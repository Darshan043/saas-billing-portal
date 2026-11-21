import { WebhookEventStatus } from '@prisma/client';
import type { PoolClient } from 'pg';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRegistry } from '../src/jobs/handlers';
import {
  createWebhookProcessor,
  type WebhookHandler,
} from '../src/jobs/webhookProcessor';
import { pool } from '../src/lib/db';
import { prisma } from '../src/lib/prisma';
import { assertTestDatabase, TEST_DATABASE_NAME } from './dbSafety';

async function expectTestDatabase(): Promise<void> {
  assertTestDatabase(process.env.DATABASE_URL);
  const rows = await prisma.$queryRaw<Array<{ current_database: string }>>`
    SELECT current_database()
  `;
  expect(rows[0]?.current_database).toBe(TEST_DATABASE_NAME);
}

async function insertEvent(input: {
  type?: string;
  status?: WebhookEventStatus;
  attempts?: number;
  lastError?: string | null;
}): Promise<{ id: string }> {
  return prisma.webhookEvent.create({
    data: {
      type: input.type ?? 'payment.succeeded',
      payload: {},
      signatureValid: true,
      status: input.status ?? WebhookEventStatus.RECEIVED,
      attempts: input.attempts ?? 0,
      lastError: input.lastError ?? undefined,
    },
    select: { id: true },
  });
}

async function waitForStatus(
  id: string,
  status: WebhookEventStatus,
  timeoutMs = 5_000,
): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const row = await prisma.webhookEvent.findUnique({ where: { id } });
    if (row?.status === status) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`timed out waiting for status ${status}`);
}

async function waitForEvent(
  event: Promise<void>,
  message: string,
  timeoutMs = 5_000,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      event,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

describe('webhook processor', () => {
  beforeEach(async () => {
    await expectTestDatabase();
    await prisma.webhookEvent.deleteMany({
      where: { type: { in: ['payment.succeeded', 'debug.ok', 'unknown.type'] } },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('processes a RECEIVED event with a registered handler', async () => {
    const handler = vi.fn(async () => undefined);
    const registry = createRegistry();
    registry.register('payment.succeeded', handler);
    const processWebhookEvent = createWebhookProcessor(registry);
    const event = await insertEvent({});

    await processWebhookEvent(event.id);

    expect(handler).toHaveBeenCalledTimes(1);
    const stored = await prisma.webhookEvent.findUniqueOrThrow({
      where: { id: event.id },
    });
    expect(stored.status).toBe(WebhookEventStatus.PROCESSED);
    expect(stored.processedAt).not.toBeNull();
    expect(stored.attempts).toBe(1);
    expect(stored.lastError).toBeNull();
  });

  it('is idempotent when processWebhookEvent is called twice', async () => {
    const handler = vi.fn(async () => undefined);
    const registry = createRegistry();
    registry.register('payment.succeeded', handler);
    const processWebhookEvent = createWebhookProcessor(registry);
    const event = await insertEvent({});

    await processWebhookEvent(event.id);
    await processWebhookEvent(event.id);

    expect(handler).toHaveBeenCalledTimes(1);
    const stored = await prisma.webhookEvent.findUniqueOrThrow({
      where: { id: event.id },
    });
    expect(stored.status).toBe(WebhookEventStatus.PROCESSED);
    expect(stored.attempts).toBe(1);
  });

  it('claims concurrently so the handler runs once and attempts is 1', async () => {
    let releaseHandler!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseHandler = resolve;
    });
    const handler = vi.fn(async () => {
      await gate;
    });
    const registry = createRegistry();
    registry.register('payment.succeeded', handler);
    const processWebhookEvent = createWebhookProcessor(registry);
    const event = await insertEvent({});

    let skippedLocks = 0;
    let resolveSkipped!: () => void;
    const fourSkippedLocks = new Promise<void>((resolve) => {
      resolveSkipped = resolve;
    });

    const originalConnect = pool.connect.bind(pool);
    const connectSpy = vi.spyOn(pool, 'connect').mockImplementation(async () => {
      const client = await originalConnect();
      const originalQuery = client.query.bind(client);
      client.query = ((...args: unknown[]) => {
        const result = originalQuery(...(args as Parameters<typeof originalQuery>));
        const sql = typeof args[0] === 'string' ? args[0] : '';
        if (
          !sql.includes('pg_try_advisory_lock') ||
          result == null ||
          typeof (result as Promise<unknown>).then !== 'function'
        ) {
          return result;
        }
        return (result as Promise<{ rows: Array<{ locked?: boolean }> }>).then(
          (res) => {
            if (res.rows[0]?.locked !== true) {
              skippedLocks += 1;
              if (skippedLocks === 4) {
                resolveSkipped();
              }
            }
            return res;
          },
        );
      }) as typeof client.query;
      return client;
    });

    const first = processWebhookEvent(event.id);
    const others: Array<Promise<void>> = [];
    try {
      await waitForStatus(event.id, WebhookEventStatus.PROCESSING);
      others.push(
        ...Array.from({ length: 4 }, () => processWebhookEvent(event.id)),
      );
      await waitForEvent(
        fourSkippedLocks,
        'timed out waiting for concurrent calls to skip the advisory lock',
      );
      await Promise.all(others);
      releaseHandler();
      await first;
    } catch (err) {
      releaseHandler();
      await Promise.allSettled([first, ...others]);
      throw err;
    } finally {
      connectSpy.mockRestore();
    }

    expect(handler).toHaveBeenCalledTimes(1);
    const stored = await prisma.webhookEvent.findUniqueOrThrow({
      where: { id: event.id },
    });
    expect(stored.status).toBe(WebhookEventStatus.PROCESSED);
    expect(stored.attempts).toBe(1);
  });

  it('marks FAILED, truncates lastError, and rethrows when the handler throws', async () => {
    const longMessage = 'x'.repeat(2_500);
    const handler = vi.fn(async () => {
      throw new Error(longMessage);
    });
    const registry = createRegistry();
    registry.register('payment.succeeded', handler);
    const processWebhookEvent = createWebhookProcessor(registry);
    const event = await insertEvent({});

    await expect(processWebhookEvent(event.id)).rejects.toThrow(longMessage);

    const stored = await prisma.webhookEvent.findUniqueOrThrow({
      where: { id: event.id },
    });
    expect(stored.status).toBe(WebhookEventStatus.FAILED);
    expect(stored.attempts).toBe(1);
    expect(stored.lastError).toHaveLength(2_000);
    expect(stored.lastError).toBe(longMessage.slice(0, 2_000));
    expect(stored.lastError).not.toContain('at ');
  });

  it('rolls back handler writes when the handler throws', async () => {
    const billingEmail = `rollback-${crypto.randomUUID()}@example.com`;
    const handler: WebhookHandler = async ({ tx }) => {
      await tx.organization.create({
        data: {
          name: `rollback-${crypto.randomUUID()}`,
          billingEmail,
        },
      });
      throw new Error('boom');
    };
    const registry = createRegistry();
    registry.register('payment.succeeded', handler);
    const processWebhookEvent = createWebhookProcessor(registry);
    const event = await insertEvent({});

    await expect(processWebhookEvent(event.id)).rejects.toThrow('boom');

    expect(
      await prisma.organization.findFirst({ where: { billingEmail } }),
    ).toBeNull();
    const stored = await prisma.webhookEvent.findUniqueOrThrow({
      where: { id: event.id },
    });
    expect(stored.status).toBe(WebhookEventStatus.FAILED);
  });

  it('retries a FAILED event and succeeds on the second call', async () => {
    let calls = 0;
    const handler = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        throw new Error('first fail');
      }
    });
    const registry = createRegistry();
    registry.register('payment.succeeded', handler);
    const processWebhookEvent = createWebhookProcessor(registry);
    const event = await insertEvent({});

    await expect(processWebhookEvent(event.id)).rejects.toThrow('first fail');
    await processWebhookEvent(event.id);

    expect(handler).toHaveBeenCalledTimes(2);
    const stored = await prisma.webhookEvent.findUniqueOrThrow({
      where: { id: event.id },
    });
    expect(stored.status).toBe(WebhookEventStatus.PROCESSED);
    expect(stored.attempts).toBe(2);
    expect(stored.lastError).toBeNull();
  });

  it('marks unknown types PROCESSED without throwing', async () => {
    const handler = vi.fn(async () => undefined);
    const registry = createRegistry();
    registry.register('payment.succeeded', handler);
    const processWebhookEvent = createWebhookProcessor(registry);
    const event = await insertEvent({ type: 'unknown.type' });

    await processWebhookEvent(event.id);

    expect(handler).not.toHaveBeenCalled();
    const stored = await prisma.webhookEvent.findUniqueOrThrow({
      where: { id: event.id },
    });
    expect(stored.status).toBe(WebhookEventStatus.PROCESSED);
    expect(stored.lastError).toBe(
      'No handler registered for type unknown.type',
    );
  });

  it('recovers an abandoned PROCESSING event without a second claim increment', async () => {
    const handler = vi.fn(async () => undefined);
    const registry = createRegistry();
    registry.register('payment.succeeded', handler);
    const processWebhookEvent = createWebhookProcessor(registry);
    const event = await insertEvent({
      status: WebhookEventStatus.PROCESSING,
      attempts: 1,
    });

    await processWebhookEvent(event.id);

    expect(handler).toHaveBeenCalledTimes(1);
    const stored = await prisma.webhookEvent.findUniqueOrThrow({
      where: { id: event.id },
    });
    expect(stored.status).toBe(WebhookEventStatus.PROCESSED);
    expect(stored.attempts).toBe(1);
    expect(stored.processedAt).not.toBeNull();
    expect(stored.lastError).toBeNull();
  });

  it('destroys the checked-out connection if advisory unlock fails', async () => {
    const release = vi.fn();
    const connectSpy = vi.spyOn(pool, 'connect').mockImplementation(async () => {
      return {
        query: async (sql: string) => {
          if (sql.includes('pg_try_advisory_lock')) {
            return { rows: [{ locked: true }] };
          }
          if (sql.includes('pg_advisory_unlock')) {
            throw new Error('unlock failed');
          }
          return { rows: [] };
        },
        release,
      } as unknown as PoolClient;
    });

    try {
      const handler = vi.fn(async () => undefined);
      const registry = createRegistry();
      registry.register('payment.succeeded', handler);
      const processWebhookEvent = createWebhookProcessor(registry);
      const event = await insertEvent({});

      await processWebhookEvent(event.id);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(release).toHaveBeenCalledTimes(1);
      expect(release.mock.calls[0]?.[0]).toMatchObject({
        message: 'unlock failed',
      });
      const stored = await prisma.webhookEvent.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(stored.status).toBe(WebhookEventStatus.PROCESSED);
    } finally {
      connectSpy.mockRestore();
    }
  });

  it('preserves the handler error when unlock also fails', async () => {
    const release = vi.fn();
    const connectSpy = vi.spyOn(pool, 'connect').mockImplementation(async () => {
      return {
        query: async (sql: string) => {
          if (sql.includes('pg_try_advisory_lock')) {
            return { rows: [{ locked: true }] };
          }
          if (sql.includes('pg_advisory_unlock')) {
            throw new Error('unlock failed');
          }
          return { rows: [] };
        },
        release,
      } as unknown as PoolClient;
    });

    try {
      const handler = vi.fn(async () => {
        throw new Error('handler boom');
      });
      const registry = createRegistry();
      registry.register('payment.succeeded', handler);
      const processWebhookEvent = createWebhookProcessor(registry);
      const event = await insertEvent({});

      await expect(processWebhookEvent(event.id)).rejects.toThrow(
        'handler boom',
      );

      expect(release).toHaveBeenCalledTimes(1);
      expect(release.mock.calls[0]?.[0]).toMatchObject({
        message: 'unlock failed',
      });
      const stored = await prisma.webhookEvent.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(stored.status).toBe(WebhookEventStatus.FAILED);
      expect(stored.lastError).toBe('handler boom');
    } finally {
      connectSpy.mockRestore();
    }
  });

  it('does nothing for REJECTED or missing events', async () => {
    const handler = vi.fn(async () => undefined);
    const registry = createRegistry();
    registry.register('payment.succeeded', handler);
    const processWebhookEvent = createWebhookProcessor(registry);
    const rejected = await insertEvent({
      status: WebhookEventStatus.REJECTED,
    });

    await processWebhookEvent(rejected.id);
    await processWebhookEvent(crypto.randomUUID());

    expect(handler).not.toHaveBeenCalled();
    const stored = await prisma.webhookEvent.findUniqueOrThrow({
      where: { id: rejected.id },
    });
    expect(stored.status).toBe(WebhookEventStatus.REJECTED);
    expect(stored.attempts).toBe(0);
  });
});

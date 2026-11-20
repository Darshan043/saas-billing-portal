import { WebhookEventStatus } from '@prisma/client';
import type PgBoss from 'pg-boss';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createBoss,
  setSendBoss,
  startBoss,
  stopBoss,
} from '../src/jobs/boss';
import { enqueueWebhookEvent } from '../src/jobs/enqueue';
import { registry } from '../src/jobs/handlers';
import { registerStubHandlers } from '../src/jobs/handlers/stubs';
import { recoverStuckWebhookEvents } from '../src/jobs/recovery';
import {
  PROCESS_WEBHOOK_EVENT,
  TEST_PGBOSS_SCHEMA,
  WEBHOOK_EVENTS_DEAD_LETTER,
  type WebhookJobData,
} from '../src/jobs/queues';
import { createWebhookProcessor } from '../src/jobs/webhookProcessor';
import { env } from '../src/config/env';
import { prisma } from '../src/lib/prisma';
import { assertTestDatabase, TEST_DATABASE_NAME } from './dbSafety';

async function expectTestDatabase(): Promise<void> {
  assertTestDatabase(process.env.DATABASE_URL);
  const rows = await prisma.$queryRaw<Array<{ current_database: string }>>`
    SELECT current_database()
  `;
  expect(rows[0]?.current_database).toBe(TEST_DATABASE_NAME);
}

async function insertReceivedEvent(input: {
  type: string;
  receivedAt?: Date;
}) {
  return prisma.webhookEvent.create({
    data: {
      type: input.type,
      payload: {},
      signatureValid: true,
      status: WebhookEventStatus.RECEIVED,
      receivedAt: input.receivedAt ?? new Date(),
    },
  });
}

async function waitFor<T>(
  fn: () => Promise<T | null | undefined | false>,
  timeoutMs = 15_000,
  intervalMs = 200,
): Promise<T> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await fn();
    if (value) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error('timed out waiting for condition');
}

async function countJobs(
  boss: PgBoss,
  queue: string,
  webhookEventId?: string,
): Promise<number> {
  if (!webhookEventId) {
    return boss.getQueueSize(queue);
  }
  const result = await boss.getDb().executeSql(
    `SELECT count(*)::int AS count
     FROM ${TEST_PGBOSS_SCHEMA}.job
     WHERE name = $1
       AND data->>'webhookEventId' = $2
       AND state < 'completed'`,
    [queue, webhookEventId],
  );
  return result.rows[0]?.count ?? 0;
}

describe('webhook queue integration', () => {
  let boss: PgBoss;
  const createdEventIds: string[] = [];

  beforeAll(async () => {
    await expectTestDatabase();
    registerStubHandlers();
    boss = createBoss({
      mode: 'worker',
      connectionString: env.DATABASE_URL,
      schema: TEST_PGBOSS_SCHEMA,
      pollingIntervalSeconds: 0.5,
    });
    await startBoss(boss);
    setSendBoss(boss);
  });

  beforeEach(async () => {
    await expectTestDatabase();
  });

  afterAll(async () => {
    setSendBoss(null);
    if (boss) {
      await stopBoss(boss);
    }
    if (createdEventIds.length > 0) {
      await prisma.webhookEvent.deleteMany({
        where: { id: { in: createdEventIds } },
      });
    }
  });

  it('enqueues one job per event id (unique singleton key)', async () => {
    const event = await insertReceivedEvent({ type: 'debug.ok' });
    createdEventIds.push(event.id);

    const first = await enqueueWebhookEvent(event.id, {
      retryLimit: 0,
      retryDelay: 1,
      retryBackoff: false,
    });
    const second = await enqueueWebhookEvent(event.id, {
      retryLimit: 0,
      retryDelay: 1,
      retryBackoff: false,
    });

    expect(first).toBeTruthy();
    expect(second).toBeNull();
    expect(await countJobs(boss, PROCESS_WEBHOOK_EVENT, event.id)).toBe(1);
  });

  it('processes a debug.ok event end to end', async () => {
    const processWebhookEvent = createWebhookProcessor(registry);
    const workerId = await boss.work<WebhookJobData>(
      PROCESS_WEBHOOK_EVENT,
      { batchSize: 1, pollingIntervalSeconds: 0.5 },
      async ([job]) => {
        if (job) {
          await processWebhookEvent(job.data.webhookEventId);
        }
      },
    );

    const event = await insertReceivedEvent({ type: 'debug.ok' });
    createdEventIds.push(event.id);
    await enqueueWebhookEvent(event.id, {
      retryLimit: 0,
      retryDelay: 1,
      retryBackoff: false,
    });

    const stored = await waitFor(async () => {
      const row = await prisma.webhookEvent.findUnique({
        where: { id: event.id },
      });
      return row?.status === WebhookEventStatus.PROCESSED ? row : null;
    });

    expect(stored.status).toBe(WebhookEventStatus.PROCESSED);
    expect(stored.attempts).toBe(1);
    expect(stored.lastError).toBeNull();
    expect(stored.processedAt).not.toBeNull();

    await boss.offWork({ id: workerId });
  });

  it('retries debug.fail then moves the job to the dead-letter queue', async () => {
    const processWebhookEvent = createWebhookProcessor(registry);
    const workerId = await boss.work<WebhookJobData>(
      PROCESS_WEBHOOK_EVENT,
      { batchSize: 1, pollingIntervalSeconds: 0.5 },
      async ([job]) => {
        if (job) {
          await processWebhookEvent(job.data.webhookEventId);
        }
      },
    );

    const event = await insertReceivedEvent({ type: 'debug.fail' });
    createdEventIds.push(event.id);
    const retryLimit = 2;
    await enqueueWebhookEvent(event.id, {
      retryLimit,
      retryDelay: 1,
      retryBackoff: false,
    });

    const stored = await waitFor(async () => {
      const row = await prisma.webhookEvent.findUnique({
        where: { id: event.id },
      });
      return row?.status === WebhookEventStatus.FAILED &&
        row.attempts === retryLimit + 1
        ? row
        : null;
    }, 20_000);

    // pg-boss retryLimit is extra retries after the first run
    // (fail when retry_count < retry_limit is false). Handler executions
    // and webhook_events.attempts are retryLimit + 1.
    expect(stored.status).toBe(WebhookEventStatus.FAILED);
    expect(stored.attempts).toBe(retryLimit + 1);
    expect(stored.lastError).toBe('debug failure');

    const deadLetterCount = await waitFor(async () => {
      const count = await countJobs(
        boss,
        WEBHOOK_EVENTS_DEAD_LETTER,
        event.id,
      );
      return count > 0 ? count : null;
    });
    expect(deadLetterCount).toBeGreaterThanOrEqual(1);

    await boss.offWork({ id: workerId });
  }, 25_000);

  it('recovery re-enqueues stale RECEIVED events and ignores fresh ones', async () => {
    const processWebhookEvent = createWebhookProcessor(registry);
    const workerId = await boss.work<WebhookJobData>(
      PROCESS_WEBHOOK_EVENT,
      { batchSize: 1, pollingIntervalSeconds: 0.5 },
      async ([job]) => {
        if (job) {
          await processWebhookEvent(job.data.webhookEventId);
        }
      },
    );

    const stale = await insertReceivedEvent({
      type: 'debug.ok',
      receivedAt: new Date(Date.now() - 2 * 60 * 1000),
    });
    const fresh = await insertReceivedEvent({
      type: 'debug.ok',
      receivedAt: new Date(),
    });
    createdEventIds.push(stale.id, fresh.id);

    const requeued = await recoverStuckWebhookEvents();
    expect(requeued).toBeGreaterThanOrEqual(1);

    const processed = await waitFor(async () => {
      const row = await prisma.webhookEvent.findUnique({
        where: { id: stale.id },
      });
      return row?.status === WebhookEventStatus.PROCESSED ? row : null;
    });
    expect(processed.status).toBe(WebhookEventStatus.PROCESSED);

    const freshRow = await prisma.webhookEvent.findUniqueOrThrow({
      where: { id: fresh.id },
    });
    expect(freshRow.status).toBe(WebhookEventStatus.RECEIVED);
    expect(freshRow.attempts).toBe(0);
    expect(await countJobs(boss, PROCESS_WEBHOOK_EVENT, fresh.id)).toBe(0);

    await boss.offWork({ id: workerId });
  });
});

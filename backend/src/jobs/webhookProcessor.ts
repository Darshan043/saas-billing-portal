import {
  Prisma,
  WebhookEvent,
  WebhookEventStatus,
} from '@prisma/client';
import type { Logger } from 'pino';
import type { PoolClient } from 'pg';
import { pool } from '../lib/db';
import { logger as defaultLogger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { WEBHOOK_ERROR_MAX_LENGTH } from './queues';

/**
 * Steps 9–12 must write all business rows through ctx.tx so those writes
 * commit together with status=PROCESSED. A thrown handler rolls everything
 * back and the event stays retryable.
 */
export type WebhookHandler = (ctx: {
  event: WebhookEvent;
  tx: Prisma.TransactionClient;
  logger: Logger;
}) => Promise<void>;

export type HandlerLookup = {
  get: (type: string) => WebhookHandler | undefined;
};

type LockedWebhookRow = {
  id: string;
  status: WebhookEventStatus;
};

function truncateError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.slice(0, WEBHOOK_ERROR_MAX_LENGTH);
}

function alreadyHandled(status: WebhookEventStatus): boolean {
  return (
    status === WebhookEventStatus.PROCESSED ||
    status === WebhookEventStatus.REJECTED
  );
}

async function tryLockEvent(
  client: PoolClient,
  webhookEventId: string,
): Promise<boolean> {
  const result = await client.query<{ locked: boolean }>(
    `SELECT pg_try_advisory_lock(hashtext('webhook_event'), hashtext($1)) AS locked`,
    [webhookEventId],
  );
  return result.rows[0]?.locked === true;
}

async function unlockEvent(
  client: PoolClient,
  webhookEventId: string,
): Promise<void> {
  await client.query(
    `SELECT pg_advisory_unlock(hashtext('webhook_event'), hashtext($1))`,
    [webhookEventId],
  );
}

export function createWebhookProcessor(
  registry: HandlerLookup,
  log: Logger = defaultLogger,
) {
  // Phase A commits immediately, which releases the row lock. Concurrent
  // callers are serialized with a session advisory lock held on this client
  // for the whole processWebhookEvent call (Phase A + Phase B). PostgreSQL
  // drops that lock if the connection dies, so a crashed worker can be
  // reclaimed without a clock. PROCESSING is reused only while holding the
  // lock, which means no live handler is running.
  async function claimEvent(
    webhookEventId: string,
  ): Promise<WebhookEvent | null> {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.webhookEvent.findUnique({
        where: { id: webhookEventId },
      });
      if (!existing) {
        log.info({ webhookEventId }, 'webhook event not found');
        return null;
      }
      if (alreadyHandled(existing.status)) {
        log.info(
          {
            webhookEventId,
            type: existing.type,
            status: existing.status,
          },
          'webhook event already handled',
        );
        return null;
      }

      if (existing.status === WebhookEventStatus.PROCESSING) {
        log.info(
          {
            webhookEventId,
            type: existing.type,
            attempts: existing.attempts,
          },
          'reclaiming abandoned PROCESSING event',
        );
        return existing;
      }

      return tx.webhookEvent.update({
        where: { id: webhookEventId },
        data: {
          status: WebhookEventStatus.PROCESSING,
          attempts: { increment: 1 },
        },
      });
    });
  }

  async function processInsideLock(webhookEventId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<LockedWebhookRow[]>`
        SELECT id, status
        FROM webhook_events
        WHERE id = ${webhookEventId}::uuid
        FOR UPDATE
      `;
      const lockedRow = locked[0];
      if (!lockedRow) {
        return;
      }
      if (lockedRow.status === WebhookEventStatus.PROCESSED) {
        return;
      }

      const event = await tx.webhookEvent.findUniqueOrThrow({
        where: { id: webhookEventId },
      });
      const handler = registry.get(event.type);

      if (!handler) {
        const lastError = `No handler registered for type ${event.type}`;
        log.warn(
          { webhookEventId, type: event.type, attempts: event.attempts },
          lastError,
        );
        await tx.webhookEvent.update({
          where: { id: webhookEventId },
          data: {
            status: WebhookEventStatus.PROCESSED,
            processedAt: new Date(),
            lastError,
          },
        });
        return;
      }

      const handlerLogger = log.child({
        webhookEventId: event.id,
        type: event.type,
        attempts: event.attempts,
      });
      await handler({ event, tx, logger: handlerLogger });

      await tx.webhookEvent.update({
        where: { id: webhookEventId },
        data: {
          status: WebhookEventStatus.PROCESSED,
          processedAt: new Date(),
          lastError: null,
        },
      });
      log.info(
        {
          webhookEventId: event.id,
          type: event.type,
          attempts: event.attempts,
          outcome: 'processed',
        },
        'webhook event processed',
      );
    });
  }

  return async function processWebhookEvent(
    webhookEventId: string,
  ): Promise<void> {
    const client = await pool.connect();
    let acquired = false;
    try {
      acquired = await tryLockEvent(client, webhookEventId);
      if (!acquired) {
        log.debug(
          { webhookEventId },
          'webhook event claim skipped; another worker holds the lock',
        );
        return;
      }

      const claimed = await claimEvent(webhookEventId);
      if (!claimed) {
        return;
      }

      try {
        await processInsideLock(webhookEventId);
      } catch (err) {
        const lastError = truncateError(err);
        await prisma.webhookEvent.update({
          where: { id: webhookEventId },
          data: {
            status: WebhookEventStatus.FAILED,
            lastError,
          },
        });
        log.warn(
          {
            webhookEventId,
            type: claimed.type,
            attempts: claimed.attempts,
            outcome: 'failed',
          },
          'webhook event handler failed',
        );
        throw err;
      }
    } finally {
      let releaseCause: Error | undefined;
      if (acquired) {
        try {
          await unlockEvent(client, webhookEventId);
        } catch (err) {
          log.error(
            { err, webhookEventId },
            'failed to release webhook event lock',
          );
          releaseCause =
            err instanceof Error ? err : new Error(String(err));
        }
      }
      // release(err) destroys the client so a leftover session lock cannot
      // leak back into the pool.
      if (releaseCause) {
        client.release(releaseCause);
      } else {
        client.release();
      }
    }
  };
}

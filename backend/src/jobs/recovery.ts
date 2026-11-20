import { WebhookEventStatus } from '@prisma/client';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { enqueueWebhookEvent } from './enqueue';
import {
  WEBHOOK_RECOVERY_BATCH_LIMIT,
  WEBHOOK_RECOVERY_STALE_MS,
} from './queues';

export async function recoverStuckWebhookEvents(): Promise<number> {
  const cutoff = new Date(Date.now() - WEBHOOK_RECOVERY_STALE_MS);
  const stuck = await prisma.webhookEvent.findMany({
    where: {
      status: WebhookEventStatus.RECEIVED,
      receivedAt: { lt: cutoff },
    },
    orderBy: { receivedAt: 'asc' },
    take: WEBHOOK_RECOVERY_BATCH_LIMIT,
    select: { id: true },
  });

  for (const row of stuck) {
    await enqueueWebhookEvent(row.id);
  }

  if (stuck.length > 0) {
    logger.info(
      { requeued: stuck.length },
      're-enqueued stuck webhook events',
    );
  }

  return stuck.length;
}

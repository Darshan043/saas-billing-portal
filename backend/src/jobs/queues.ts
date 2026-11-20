export const PROCESS_WEBHOOK_EVENT = 'process-webhook-event';
export const WEBHOOK_EVENTS_DEAD_LETTER = 'webhook-events-dead-letter';
export const WEBHOOK_EVENT_RECOVERY = 'webhook-event-recovery';

export const DEFAULT_PGBOSS_SCHEMA = 'pgboss';
export const TEST_PGBOSS_SCHEMA = 'pgboss_test';

export const WEBHOOK_JOB_RETRY_DELAY_SECONDS = 10;
export const WEBHOOK_WORKER_COUNT = 5;
export const WEBHOOK_ERROR_MAX_LENGTH = 2_000;
export const WEBHOOK_RECOVERY_STALE_MS = 60_000;
export const WEBHOOK_RECOVERY_BATCH_LIMIT = 100;

export type WebhookJobData = {
  webhookEventId: string;
};

export function isWebhookJobData(value: unknown): value is WebhookJobData {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const webhookEventId = (value as { webhookEventId?: unknown })
    .webhookEventId;
  return typeof webhookEventId === 'string' && webhookEventId.length > 0;
}

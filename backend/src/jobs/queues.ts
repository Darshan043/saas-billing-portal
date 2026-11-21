export const PROCESS_WEBHOOK_EVENT = 'process-webhook-event';
export const WEBHOOK_EVENTS_DEAD_LETTER = 'webhook-events-dead-letter';
export const WEBHOOK_EVENT_RECOVERY = 'webhook-event-recovery';

export const SEND_EMAIL = 'send-email';
export const EMAIL_DEAD_LETTER = 'email-dead-letter';

export const DEFAULT_PGBOSS_SCHEMA = 'pgboss';
export const TEST_PGBOSS_SCHEMA = 'pgboss_test';

export const WEBHOOK_JOB_RETRY_DELAY_SECONDS = 10;
export const WEBHOOK_WORKER_COUNT = 5;
export const WEBHOOK_ERROR_MAX_LENGTH = 2_000;
export const WEBHOOK_RECOVERY_STALE_MS = 60_000;
export const WEBHOOK_RECOVERY_BATCH_LIMIT = 100;

export const EMAIL_JOB_RETRY_LIMIT = 3;
export const EMAIL_JOB_RETRY_DELAY_SECONDS = 15;

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

export type EmailJobData = {
  emailLogId: string;
  to: string;
  subject: string;
  html: string;
  text: string;
};

export function isEmailJobData(value: unknown): value is EmailJobData {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.emailLogId === 'string' &&
    obj.emailLogId.length > 0 &&
    typeof obj.to === 'string' &&
    typeof obj.subject === 'string' &&
    typeof obj.html === 'string' &&
    typeof obj.text === 'string'
  );
}

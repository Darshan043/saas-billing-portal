import { env } from '../config/env';
import { getSendBoss } from './boss';
import {
  PROCESS_WEBHOOK_EVENT,
  WEBHOOK_EVENTS_DEAD_LETTER,
  WEBHOOK_JOB_RETRY_DELAY_SECONDS,
  type WebhookJobData,
} from './queues';

export type EnqueueWebhookEventOptions = {
  retryLimit?: number;
  retryDelay?: number;
  retryBackoff?: boolean;
};

export async function enqueueWebhookEvent(
  webhookEventId: string,
  options: EnqueueWebhookEventOptions = {},
): Promise<string | null> {
  const data: WebhookJobData = { webhookEventId };
  return getSendBoss().send(PROCESS_WEBHOOK_EVENT, data, {
    singletonKey: webhookEventId,
    retryLimit: options.retryLimit ?? env.WEBHOOK_JOB_RETRY_LIMIT,
    retryDelay: options.retryDelay ?? WEBHOOK_JOB_RETRY_DELAY_SECONDS,
    retryBackoff: options.retryBackoff ?? true,
    deadLetter: WEBHOOK_EVENTS_DEAD_LETTER,
  });
}

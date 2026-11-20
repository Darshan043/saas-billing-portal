import PgBoss from 'pg-boss';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import {
  DEFAULT_PGBOSS_SCHEMA,
  PROCESS_WEBHOOK_EVENT,
  WEBHOOK_EVENT_RECOVERY,
  WEBHOOK_EVENTS_DEAD_LETTER,
  WEBHOOK_JOB_RETRY_DELAY_SECONDS,
} from './queues';

export type BossMode = 'send-only' | 'worker';

export type CreateBossOptions = {
  mode: BossMode;
  connectionString?: string;
  schema?: string;
  pollingIntervalSeconds?: number;
};

let sendBoss: PgBoss | null = null;

export function createBoss(options: CreateBossOptions): PgBoss {
  const isWorker = options.mode === 'worker';
  return new PgBoss({
    connectionString: options.connectionString ?? env.DATABASE_URL,
    schema: options.schema ?? DEFAULT_PGBOSS_SCHEMA,
    // API process only sends jobs. The worker owns maintenance and cron.
    supervise: isWorker,
    schedule: isWorker,
    migrate: true,
    retryLimit: env.WEBHOOK_JOB_RETRY_LIMIT,
    retryDelay: WEBHOOK_JOB_RETRY_DELAY_SECONDS,
    retryBackoff: true,
    ...(options.pollingIntervalSeconds
      ? { pollingIntervalSeconds: options.pollingIntervalSeconds }
      : {}),
  });
}

export function setSendBoss(boss: PgBoss | null): void {
  sendBoss = boss;
}

export function getSendBoss(): PgBoss {
  if (!sendBoss) {
    throw new Error('pg-boss send client is not started');
  }
  return sendBoss;
}

export async function ensureQueues(
  boss: PgBoss,
  overrides?: { retryLimit?: number; retryDelay?: number },
): Promise<void> {
  const retryLimit = overrides?.retryLimit ?? env.WEBHOOK_JOB_RETRY_LIMIT;
  const retryDelay =
    overrides?.retryDelay ?? WEBHOOK_JOB_RETRY_DELAY_SECONDS;

  // Dead-letter queue must exist before process-webhook-event can reference it.
  await boss.createQueue(WEBHOOK_EVENTS_DEAD_LETTER, {
    name: WEBHOOK_EVENTS_DEAD_LETTER,
    retryLimit: 0,
  });
  await boss.createQueue(PROCESS_WEBHOOK_EVENT, {
    name: PROCESS_WEBHOOK_EVENT,
    // v10 has no exclusive policy. stately + singletonKey allows one job per
    // state (created/retry/active) per webhookEventId, so the same event is
    // not queued twice at the same time.
    policy: 'stately',
    retryLimit,
    retryDelay,
    retryBackoff: true,
    deadLetter: WEBHOOK_EVENTS_DEAD_LETTER,
  });
  await boss.createQueue(WEBHOOK_EVENT_RECOVERY, {
    name: WEBHOOK_EVENT_RECOVERY,
    retryLimit: 2,
  });

  // createQueue is ON CONFLICT DO NOTHING; update keeps retry settings in sync.
  await boss.updateQueue(PROCESS_WEBHOOK_EVENT, {
    name: PROCESS_WEBHOOK_EVENT,
    policy: 'stately',
    retryLimit,
    retryDelay,
    retryBackoff: true,
    deadLetter: WEBHOOK_EVENTS_DEAD_LETTER,
  });
}

export async function startBoss(boss: PgBoss): Promise<void> {
  boss.on('error', (error) => {
    logger.error({ err: error }, 'pg-boss error');
  });
  await boss.start();
  await ensureQueues(boss);
}

export async function stopBoss(
  boss: PgBoss,
  timeoutMs = 10_000,
): Promise<void> {
  await boss.stop({ graceful: true, timeout: timeoutMs, close: true });
}

import type PgBoss from 'pg-boss';
import { pool } from './lib/db';
import { prisma } from './lib/prisma';
import { logger } from './lib/logger';
import { createBoss, setSendBoss, startBoss, stopBoss } from './jobs/boss';
import { registry } from './jobs/handlers';
import { registerCheckoutHandlers } from './jobs/handlers/checkout';
import { registerStubHandlers } from './jobs/handlers/stubs';
import { setPaymentGateway } from './services/payment/paymentGateway';
import { SimulatorPaymentGateway } from './services/payment/simulatorGateway';
import { recoverStuckWebhookEvents } from './jobs/recovery';
import {
  isWebhookJobData,
  PROCESS_WEBHOOK_EVENT,
  WEBHOOK_EVENT_RECOVERY,
  WEBHOOK_EVENTS_DEAD_LETTER,
  WEBHOOK_WORKER_COUNT,
  type WebhookJobData,
} from './jobs/queues';
import { createWebhookProcessor } from './jobs/webhookProcessor';

setPaymentGateway(new SimulatorPaymentGateway());
registerStubHandlers();
registerCheckoutHandlers(registry);

const workerLogger = logger.child({ service: 'worker' });
const processWebhookEvent = createWebhookProcessor(registry, workerLogger);

const handleProcessJobs: PgBoss.WorkHandler<WebhookJobData> = async (jobs) => {
  const job = jobs[0];
  if (!job || !isWebhookJobData(job.data)) {
    workerLogger.warn('process-webhook-event job missing webhookEventId');
    return;
  }
  await processWebhookEvent(job.data.webhookEventId);
};

const handleDeadLetterJobs: PgBoss.WorkHandler<WebhookJobData> = async (
  jobs,
) => {
  const job = jobs[0];
  if (!job || !isWebhookJobData(job.data)) {
    workerLogger.error('dead-letter job missing webhookEventId');
    return;
  }

  const webhookEventId = job.data.webhookEventId;
  const event = await prisma.webhookEvent.findUnique({
    where: { id: webhookEventId },
    select: { type: true, attempts: true },
  });
  workerLogger.error(
    {
      webhookEventId,
      type: event?.type,
      attempts: event?.attempts,
    },
    'webhook event moved to dead letter',
  );
};

async function handleRecoveryJobs(): Promise<void> {
  await recoverStuckWebhookEvents();
}

async function main(): Promise<void> {
  const boss = createBoss({ mode: 'worker' });
  setSendBoss(boss);
  await startBoss(boss);

  // pg-boss 10 removed teamConcurrency/localConcurrency. Five separate
  // work() registrations poll independently with batchSize 1 so one
  // failed job cannot fail a whole batch.
  for (let i = 0; i < WEBHOOK_WORKER_COUNT; i += 1) {
    await boss.work(PROCESS_WEBHOOK_EVENT, { batchSize: 1 }, handleProcessJobs);
  }
  await boss.work(
    WEBHOOK_EVENTS_DEAD_LETTER,
    { batchSize: 1 },
    handleDeadLetterJobs,
  );
  await boss.work(
    WEBHOOK_EVENT_RECOVERY,
    { batchSize: 1 },
    handleRecoveryJobs,
  );
  await boss.schedule(WEBHOOK_EVENT_RECOVERY, '* * * * *');

  workerLogger.info(
    {
      handlers: registry.types(),
      queues: [
        PROCESS_WEBHOOK_EVENT,
        WEBHOOK_EVENTS_DEAD_LETTER,
        WEBHOOK_EVENT_RECOVERY,
      ],
      workerCount: WEBHOOK_WORKER_COUNT,
    },
    'worker started',
  );

  async function shutdown(signal: string): Promise<void> {
    workerLogger.info({ signal }, 'graceful shutdown started');
    try {
      await stopBoss(boss);
    } catch (err) {
      workerLogger.error({ err }, 'error stopping pg-boss');
    }
    try {
      await prisma.$disconnect();
    } catch (err) {
      workerLogger.error({ err }, 'error disconnecting Prisma');
    }
    try {
      await pool.end();
    } catch (err) {
      workerLogger.error({ err }, 'error closing database pool');
    }
    process.exit(0);
  }

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
}

void main().catch((err) => {
  workerLogger.error({ err }, 'worker failed to start');
  process.exit(1);
});

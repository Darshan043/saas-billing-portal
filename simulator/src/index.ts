import { app } from './app';
import { env } from './config/env';
import { deployMigrations, ensureDatabase } from './lib/ensureDatabase';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import {
  startWebhookWorker,
  stopWebhookWorker,
} from './modules/webhooks/webhook.service';

void start().catch((err) => {
  logger.error({ err }, 'simulator failed to start');
  process.exit(1);
});

async function start(): Promise<void> {
  await ensureDatabase(env.DATABASE_URL);
  deployMigrations(env.DATABASE_URL);

  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'payment simulator listening');
    startWebhookWorker();
  });

  function shutdown(signal: string): void {
    logger.info({ signal }, 'graceful shutdown started');
    stopWebhookWorker();

    server.close((closeErr) => {
      if (closeErr) {
        logger.error({ err: closeErr }, 'error closing HTTP server');
      }
      void prisma
        .$disconnect()
        .catch((err) => logger.error({ err }, 'error disconnecting Prisma'))
        .finally(() => process.exit(closeErr ? 1 : 0));
    });

    setTimeout(() => {
      logger.error('shutdown timed out, forcing exit');
      process.exit(1);
    }, 10_000).unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

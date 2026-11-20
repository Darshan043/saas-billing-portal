import { app } from './app';
import { env } from './config/env';
import { createBoss, setSendBoss, startBoss, stopBoss } from './jobs/boss';
import { pool } from './lib/db';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';

async function main(): Promise<void> {
  const boss = createBoss({ mode: 'send-only' });
  await startBoss(boss);
  setSendBoss(boss);

  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'backend listening');
  });

  function shutdown(signal: string): void {
    logger.info({ signal }, 'graceful shutdown started');

    server.close((closeErr) => {
      if (closeErr) {
        logger.error({ err: closeErr }, 'error closing HTTP server');
      }

      Promise.allSettled([
        stopBoss(boss),
        pool.end(),
        prisma.$disconnect(),
      ])
        .then((results) => {
          if (results[0].status === 'rejected') {
            logger.error({ err: results[0].reason }, 'error stopping pg-boss');
          }
          if (results[1].status === 'rejected') {
            logger.error(
              { err: results[1].reason },
              'error closing database pool',
            );
          }
          if (results[2].status === 'rejected') {
            logger.error(
              { err: results[2].reason },
              'error disconnecting Prisma',
            );
          }
        })
        .finally(() => {
          process.exit(closeErr ? 1 : 0);
        });
    });

    setTimeout(() => {
      logger.error('shutdown timed out, forcing exit');
      process.exit(1);
    }, 10_000).unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

void main().catch((err) => {
  logger.error({ err }, 'backend failed to start');
  process.exit(1);
});

import { app } from './app';
import { env } from './config/env';
import { pool } from './lib/db';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'backend listening');
});

function shutdown(signal: string): void {
  logger.info({ signal }, 'graceful shutdown started');

  server.close((closeErr) => {
    if (closeErr) {
      logger.error({ err: closeErr }, 'error closing HTTP server');
    }

    Promise.allSettled([pool.end(), prisma.$disconnect()])
      .then((results) => {
        if (results[0].status === 'rejected') {
          logger.error(
            { err: results[0].reason },
            'error closing database pool',
          );
        }
        if (results[1].status === 'rejected') {
          logger.error(
            { err: results[1].reason },
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

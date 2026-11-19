import { app } from './app';
import { env } from './config/env';
import { logger } from './lib/logger';

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'payment simulator listening');
});

function shutdown(signal: string): void {
  logger.info({ signal }, 'graceful shutdown started');

  server.close((closeErr) => {
    if (closeErr) {
      logger.error({ err: closeErr }, 'error closing HTTP server');
      process.exit(1);
    }
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('shutdown timed out, forcing exit');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

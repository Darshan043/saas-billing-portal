import pino from 'pino';

export const logger = pino({
  name: 'backend',
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
});

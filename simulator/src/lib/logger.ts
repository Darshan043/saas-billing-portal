import pino from 'pino';

export const logger = pino({
  name: 'payment-simulator',
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
});

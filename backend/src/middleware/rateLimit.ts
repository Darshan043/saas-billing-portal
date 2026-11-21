import rateLimit from 'express-rate-limit';
import { env } from '../config/env';
import { AppError } from '../lib/errors';

const rateLimitedHandler = (_req: unknown, _res: unknown, next: (err?: unknown) => void) => {
  next(
    AppError.tooManyRequests(
      'RATE_LIMITED',
      'Too many requests, please try again later.',
    ),
  );
};

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.NODE_ENV === 'test',
  handler: rateLimitedHandler,
});

export const webhookRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.NODE_ENV === 'test',
  handler: rateLimitedHandler,
});

import rateLimit from 'express-rate-limit';
import { env } from '../config/env';
import { AppError } from '../lib/errors';

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.NODE_ENV === 'test',
  handler: (_req, _res, next) => {
    next(
      AppError.tooManyRequests(
        'RATE_LIMITED',
        'Too many requests, please try again later.',
      ),
    );
  },
});

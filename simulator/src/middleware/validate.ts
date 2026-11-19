import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';
import { AppError } from '../lib/errors';

type RequestPart = 'body' | 'query' | 'params';

export function validate(schema: ZodType, source: RequestPart = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.') || source,
        message: issue.message,
      }));
      next(AppError.badRequest('VALIDATION_ERROR', 'Invalid request', details));
      return;
    }
    req[source] = result.data;
    next();
  };
}

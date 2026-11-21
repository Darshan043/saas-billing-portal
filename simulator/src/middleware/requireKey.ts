import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { AppError } from '../lib/errors';

function headerValue(req: Request, name: string): string | undefined {
  const value = req.header(name);
  return value?.trim() || undefined;
}

export function requireApiKey(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const key = headerValue(req, 'x-simulator-key');
  if (!key || key !== env.SIMULATOR_API_KEY) {
    next(AppError.unauthorized('UNAUTHENTICATED', 'Simulator API key required'));
    return;
  }
  next();
}

export function requireControlToken(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const token =
    headerValue(req, 'x-simulator-control-token') ??
    headerValue(req, 'x-simulator-key');
  if (!token || token !== env.SIMULATOR_CONTROL_TOKEN) {
    next(
      AppError.unauthorized(
        'UNAUTHENTICATED',
        'Simulator control token required',
      ),
    );
    return;
  }
  next();
}

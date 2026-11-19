import type { UserRole } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors';

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(
        AppError.unauthorized('UNAUTHENTICATED', 'Authentication required'),
      );
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(AppError.forbidden('FORBIDDEN', 'You do not have access to this resource'));
      return;
    }
    next();
  };
}

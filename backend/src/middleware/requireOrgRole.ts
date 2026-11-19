import type { MembershipRole } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors';

export function requireOrgRole(...roles: MembershipRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.organization) {
      next(
        AppError.forbidden(
          'ORGANIZATION_REQUIRED',
          'An organization is required',
        ),
      );
      return;
    }
    if (!roles.includes(req.organization.membershipRole)) {
      next(
        AppError.forbidden(
          'FORBIDDEN',
          'You do not have access to this resource',
        ),
      );
      return;
    }
    next();
  };
}

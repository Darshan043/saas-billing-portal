import type { Request } from 'express';
import { AppError } from './errors';

// Later billing queries (subscriptions, invoices, payments, usage) should
// spread this into Prisma `where` so they never trust a client-sent org id.
export function orgScope(req: Request): { organizationId: string } {
  if (!req.organization) {
    throw AppError.forbidden(
      'ORGANIZATION_REQUIRED',
      'An organization is required',
    );
  }
  return { organizationId: req.organization.id };
}

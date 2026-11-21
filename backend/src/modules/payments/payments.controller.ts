import type { Request, Response } from 'express';
import { AppError } from '../../lib/errors';
import type { ListPaymentsQuery } from './payments.schemas';
import { listPayments } from './payments.service';

export async function list(req: Request, res: Response): Promise<void> {
  if (!req.organization) {
    throw AppError.forbidden(
      'ORGANIZATION_REQUIRED',
      'An organization is required',
    );
  }
  const query = req.query as unknown as ListPaymentsQuery;
  const result = await listPayments(req.organization.id, query);
  res.status(200).json(result);
}

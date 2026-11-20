import type { Request, Response } from 'express';
import { AppError } from '../../lib/errors';
import type { CreateSubscriptionInput } from './subscriptions.schemas';
import {
  createCheckout,
  getCurrentSubscription,
} from './subscriptions.service';

export async function create(req: Request, res: Response): Promise<void> {
  if (!req.user || !req.organization) {
    throw AppError.unauthorized('UNAUTHENTICATED', 'Authentication required');
  }
  const body = req.body as CreateSubscriptionInput;
  const subscription = await createCheckout(
    req.user.id,
    req.organization.id,
    body,
  );
  res.status(201).json({ subscription });
}

export async function current(req: Request, res: Response): Promise<void> {
  if (!req.organization) {
    throw AppError.forbidden(
      'ORGANIZATION_REQUIRED',
      'An organization is required',
    );
  }
  const subscription = await getCurrentSubscription(req.organization.id);
  res.status(200).json({ subscription });
}

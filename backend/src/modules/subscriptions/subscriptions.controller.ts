import type { Request, Response } from 'express';
import { AppError } from '../../lib/errors';
import {
  cancelSubscription,
  changePlan,
  pauseSubscription,
  previewPlanChange,
  resumeSubscription,
  undoCancel,
  undoScheduledChange,
} from './subscriptionOperations';
import type {
  CancelSubscriptionInput,
  ChangePlanInput,
  CreateSubscriptionInput,
} from './subscriptions.schemas';
import {
  createCheckout,
  getCurrentSubscription,
} from './subscriptions.service';

function requireActor(req: Request): { userId: string; organizationId: string } {
  if (!req.user || !req.organization) {
    throw AppError.unauthorized('UNAUTHENTICATED', 'Authentication required');
  }
  return { userId: req.user.id, organizationId: req.organization.id };
}

export async function create(req: Request, res: Response): Promise<void> {
  const { userId, organizationId } = requireActor(req);
  const body = req.body as CreateSubscriptionInput;
  const subscription = await createCheckout(userId, organizationId, body);
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

export async function preview(req: Request, res: Response): Promise<void> {
  if (!req.organization) {
    throw AppError.forbidden(
      'ORGANIZATION_REQUIRED',
      'An organization is required',
    );
  }
  const planPriceId = String(req.query.planPriceId ?? '');
  const result = await previewPlanChange(req.organization.id, planPriceId);
  res.status(200).json(result);
}

export async function change(req: Request, res: Response): Promise<void> {
  const { userId, organizationId } = requireActor(req);
  const body = req.body as ChangePlanInput;
  const result = await changePlan(userId, organizationId, body.planPriceId);
  res.status(200).json(result);
}

export async function clearScheduledChange(
  req: Request,
  res: Response,
): Promise<void> {
  const { userId, organizationId } = requireActor(req);
  const result = await undoScheduledChange(userId, organizationId);
  res.status(200).json(result);
}

export async function pause(req: Request, res: Response): Promise<void> {
  const { userId, organizationId } = requireActor(req);
  const result = await pauseSubscription(userId, organizationId);
  res.status(200).json(result);
}

export async function resume(req: Request, res: Response): Promise<void> {
  const { userId, organizationId } = requireActor(req);
  const result = await resumeSubscription(userId, organizationId);
  res.status(200).json(result);
}

export async function cancel(req: Request, res: Response): Promise<void> {
  const { userId, organizationId } = requireActor(req);
  const body = req.body as CancelSubscriptionInput;
  const result = await cancelSubscription(userId, organizationId, body.when);
  res.status(200).json(result);
}

export async function undoScheduledCancel(
  req: Request,
  res: Response,
): Promise<void> {
  const { userId, organizationId } = requireActor(req);
  const result = await undoCancel(userId, organizationId);
  res.status(200).json(result);
}

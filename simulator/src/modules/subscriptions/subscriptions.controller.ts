import type { Request, Response } from 'express';
import { serializeSubscription } from '../../lib/serializers';
import {
  cancelSubscription,
  changeSubscriptionPlan,
  createSubscription,
  getSubscription,
  pauseSubscription,
  resumeSubscription,
  setCancelAtPeriodEnd,
  updateSubscription,
} from './subscriptions.service';

function idempotencyKeyFrom(req: Request): string | undefined {
  const header = req.header('idempotency-key')?.trim();
  if (header) {
    return header;
  }
  const bodyKey = req.body?.idempotencyKey;
  return typeof bodyKey === 'string' ? bodyKey.trim() || undefined : undefined;
}

export async function create(req: Request, res: Response): Promise<void> {
  const subscription = await createSubscription(req.body);
  res.status(201).json({ subscription: serializeSubscription(subscription) });
}

export async function getById(req: Request, res: Response): Promise<void> {
  const subscription = await getSubscription(req.params.id);
  res.status(200).json({ subscription: serializeSubscription(subscription) });
}

export async function update(req: Request, res: Response): Promise<void> {
  const subscription = await updateSubscription(req.params.id, req.body);
  res.status(200).json({ subscription: serializeSubscription(subscription) });
}

export async function cancel(req: Request, res: Response): Promise<void> {
  const subscription = await cancelSubscription(req.params.id);
  res.status(200).json({ subscription: serializeSubscription(subscription) });
}

export async function changePlan(req: Request, res: Response): Promise<void> {
  const subscription = await changeSubscriptionPlan(
    req.params.id,
    req.body,
    idempotencyKeyFrom(req),
  );
  res.status(200).json({ subscription: serializeSubscription(subscription) });
}

export async function cancelAtPeriodEnd(
  req: Request,
  res: Response,
): Promise<void> {
  const subscription = await setCancelAtPeriodEnd(
    req.params.id,
    req.body.value,
    idempotencyKeyFrom(req),
  );
  res.status(200).json({ subscription: serializeSubscription(subscription) });
}

export async function pause(req: Request, res: Response): Promise<void> {
  const subscription = await pauseSubscription(
    req.params.id,
    idempotencyKeyFrom(req),
  );
  res.status(200).json({ subscription: serializeSubscription(subscription) });
}

export async function resume(req: Request, res: Response): Promise<void> {
  const subscription = await resumeSubscription(
    req.params.id,
    req.body,
    idempotencyKeyFrom(req),
  );
  res.status(200).json({ subscription: serializeSubscription(subscription) });
}

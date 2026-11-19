import type { Request, Response } from 'express';
import { serializeSubscription } from '../../lib/serializers';
import {
  cancelSubscription,
  createSubscription,
  getSubscription,
  updateSubscription,
} from './subscriptions.service';

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

import type { Request, Response } from 'express';
import { serializeCustomer, serializePaymentMethod } from '../../lib/serializers';
import {
  attachPaymentMethod,
  createCustomer,
  getCustomer,
} from './customers.service';

export async function create(req: Request, res: Response): Promise<void> {
  const customer = await createCustomer(req.body);
  res.status(201).json({ customer: serializeCustomer(customer) });
}

export async function getById(req: Request, res: Response): Promise<void> {
  const customer = await getCustomer(req.params.id);
  res.status(200).json({ customer: serializeCustomer(customer) });
}

export async function attachMethod(req: Request, res: Response): Promise<void> {
  const method = await attachPaymentMethod(req.params.id, req.body.token);
  res.status(201).json({ paymentMethod: serializePaymentMethod(method) });
}

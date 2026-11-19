import type { Request, Response } from 'express';
import { serializePayment } from '../../lib/serializers';
import { createPayment, getPayment, listPayments } from './payments.service';

function idempotencyKeyFrom(req: Request): string | undefined {
  const header = req.header('idempotency-key')?.trim();
  if (header) {
    return header;
  }
  const bodyKey = req.body?.idempotencyKey;
  return typeof bodyKey === 'string' ? bodyKey : undefined;
}

export async function create(req: Request, res: Response): Promise<void> {
  const payment = await createPayment({
    ...req.body,
    idempotencyKey: idempotencyKeyFrom(req),
  });
  res.status(201).json({ payment: serializePayment(payment) });
}

export async function getById(req: Request, res: Response): Promise<void> {
  const payment = await getPayment(req.params.id);
  res.status(200).json({ payment: serializePayment(payment) });
}

export async function list(req: Request, res: Response): Promise<void> {
  const payments = await listPayments({
    customerId: req.query.customerId as string | undefined,
    limit: req.query.limit ? Number(req.query.limit) : undefined,
  });
  res.status(200).json({ payments: payments.map(serializePayment) });
}

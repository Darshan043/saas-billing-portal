import type { Request, Response } from 'express';
import { receivePaymentWebhook } from './webhooks.service';

function rawBodyBuffer(req: Request): Buffer {
  if (Buffer.isBuffer(req.body)) {
    return req.body;
  }
  if (typeof req.body === 'string') {
    return Buffer.from(req.body, 'utf8');
  }
  return Buffer.alloc(0);
}

export async function receivePayments(
  req: Request,
  res: Response,
): Promise<void> {
  const result = await receivePaymentWebhook({
    rawBody: rawBodyBuffer(req),
    signatureHeader: req.header('x-simulator-signature'),
    timestampHeader: req.header('x-simulator-timestamp'),
  });
  res.status(200).json({
    received: true,
    duplicate: result.duplicate,
  });
}

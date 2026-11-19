import type { Request, Response } from 'express';
import { receiveSimulatorWebhook } from './webhooks.service';

function rawBody(req: Request): string {
  if (Buffer.isBuffer(req.body)) {
    return req.body.toString('utf8');
  }
  if (typeof req.body === 'string') {
    return req.body;
  }
  return '';
}

export async function receivePayments(
  req: Request,
  res: Response,
): Promise<void> {
  const result = await receiveSimulatorWebhook({
    rawBody: rawBody(req),
    signatureHeader: req.header('x-simulator-signature'),
    timestampHeader: req.header('x-simulator-timestamp'),
    eventIdHeader: req.header('x-simulator-event-id'),
  });
  res.status(200).json({
    received: true,
    duplicate: result.duplicate,
  });
}

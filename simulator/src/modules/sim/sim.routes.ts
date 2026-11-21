import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/asyncHandler';
import { AppError } from '../../lib/errors';
import { serializePayment } from '../../lib/serializers';
import { rejectRawCredentials } from '../../lib/tokens';
import { requireControlToken } from '../../middleware/requireKey';
import { validate } from '../../middleware/validate';
import { createCustomer } from '../customers/customers.service';
import { getOverview } from '../dashboard/dashboard.service';
import { createPayment } from '../payments/payments.service';
import {
  duplicateEvent,
  replayEvent,
  setFailNext,
} from '../webhooks/webhook.service';

const eventIdSchema = z.object({
  eventId: z.string().uuid(),
});

const testPaymentSchema = z.object({
  token: z.enum([
    'tok_sim_visa_ok',
    'tok_sim_declined',
    'tok_sim_insufficient_funds',
  ]),
  amount: z.number().int().positive().optional(),
  currency: z.string().trim().optional(),
});

export const simRouter = Router();

simRouter.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    const overview = await getOverview();
    res.status(200).json(overview);
  }),
);

simRouter.post(
  '/test-payments',
  requireControlToken,
  validate(testPaymentSchema),
  asyncHandler(async (req, res) => {
    rejectRawCredentials(req.body, 'body');
    const suffix = crypto.randomUUID().slice(0, 8);
    const customer = await createCustomer({
      email: `sim-test-${suffix}@simulator.test`,
      name: `Simulator test ${suffix}`,
    });
    const payment = await createPayment({
      customerId: customer.id,
      amount: req.body.amount ?? 1999,
      currency: (req.body.currency ?? 'USD').toUpperCase(),
      token: req.body.token,
    });
    res.status(201).json({ payment: serializePayment(payment) });
  }),
);

simRouter.post(
  '/events/replay',
  requireControlToken,
  validate(eventIdSchema),
  asyncHandler(async (req, res) => {
    await replayEvent(req.body.eventId);
    res.status(200).json({ ok: true, action: 'replay', eventId: req.body.eventId });
  }),
);

simRouter.post(
  '/events/duplicate',
  requireControlToken,
  validate(eventIdSchema),
  asyncHandler(async (req, res) => {
    await duplicateEvent(req.body.eventId);
    res.status(200).json({
      ok: true,
      action: 'duplicate',
      eventId: req.body.eventId,
    });
  }),
);

simRouter.post(
  '/events/fail-next',
  requireControlToken,
  asyncHandler(async (_req, res) => {
    await setFailNext();
    res.status(200).json({ ok: true, action: 'fail-next' });
  }),
);

simRouter.use((_req, _res, next) => {
  next(AppError.notFound('NOT_FOUND', 'Route not found'));
});

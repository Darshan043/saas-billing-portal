import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireApiKey } from '../../middleware/requireKey';
import { validate } from '../../middleware/validate';
import * as controller from './payments.controller';
import {
  createPaymentSchema,
  listPaymentsQuerySchema,
  paymentIdParamsSchema,
} from './payments.schemas';

export const paymentsRouter = Router();

paymentsRouter.use(requireApiKey);

paymentsRouter.post(
  '/',
  validate(createPaymentSchema),
  asyncHandler(controller.create),
);

paymentsRouter.get(
  '/',
  validate(listPaymentsQuerySchema, 'query'),
  asyncHandler(controller.list),
);

paymentsRouter.get(
  '/:id',
  validate(paymentIdParamsSchema, 'params'),
  asyncHandler(controller.getById),
);

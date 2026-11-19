import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireApiKey } from '../../middleware/requireKey';
import { validate } from '../../middleware/validate';
import * as controller from './customers.controller';
import {
  attachPaymentMethodSchema,
  createCustomerSchema,
  customerIdParamsSchema,
} from './customers.schemas';

export const customersRouter = Router();

customersRouter.use(requireApiKey);

customersRouter.post(
  '/',
  validate(createCustomerSchema),
  asyncHandler(controller.create),
);

customersRouter.get(
  '/:id',
  validate(customerIdParamsSchema, 'params'),
  asyncHandler(controller.getById),
);

customersRouter.post(
  '/:id/payment-methods',
  validate(customerIdParamsSchema, 'params'),
  validate(attachPaymentMethodSchema),
  asyncHandler(controller.attachMethod),
);

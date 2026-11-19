import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireApiKey } from '../../middleware/requireKey';
import { validate } from '../../middleware/validate';
import * as controller from './subscriptions.controller';
import {
  createSubscriptionSchema,
  subscriptionIdParamsSchema,
  updateSubscriptionSchema,
} from './subscriptions.schemas';

export const subscriptionsRouter = Router();

subscriptionsRouter.use(requireApiKey);

subscriptionsRouter.post(
  '/',
  validate(createSubscriptionSchema),
  asyncHandler(controller.create),
);

subscriptionsRouter.get(
  '/:id',
  validate(subscriptionIdParamsSchema, 'params'),
  asyncHandler(controller.getById),
);

subscriptionsRouter.patch(
  '/:id',
  validate(subscriptionIdParamsSchema, 'params'),
  validate(updateSubscriptionSchema),
  asyncHandler(controller.update),
);

subscriptionsRouter.post(
  '/:id/cancel',
  validate(subscriptionIdParamsSchema, 'params'),
  asyncHandler(controller.cancel),
);

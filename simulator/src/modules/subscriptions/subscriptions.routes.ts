import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireApiKey } from '../../middleware/requireKey';
import { validate } from '../../middleware/validate';
import * as controller from './subscriptions.controller';
import {
  cancelAtPeriodEndSchema,
  changePlanSchema,
  createSubscriptionSchema,
  resumeSubscriptionSchema,
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

subscriptionsRouter.post(
  '/:id/change-plan',
  validate(subscriptionIdParamsSchema, 'params'),
  validate(changePlanSchema),
  asyncHandler(controller.changePlan),
);

subscriptionsRouter.post(
  '/:id/cancel-at-period-end',
  validate(subscriptionIdParamsSchema, 'params'),
  validate(cancelAtPeriodEndSchema),
  asyncHandler(controller.cancelAtPeriodEnd),
);

subscriptionsRouter.post(
  '/:id/pause',
  validate(subscriptionIdParamsSchema, 'params'),
  asyncHandler(controller.pause),
);

subscriptionsRouter.post(
  '/:id/resume',
  validate(subscriptionIdParamsSchema, 'params'),
  validate(resumeSubscriptionSchema),
  asyncHandler(controller.resume),
);

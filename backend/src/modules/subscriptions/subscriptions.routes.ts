import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/authenticate';
import { requireOrganization } from '../../middleware/requireOrganization';
import { requireOrgRole } from '../../middleware/requireOrgRole';
import { validate } from '../../middleware/validate';
import {
  cancel,
  change,
  clearScheduledChange,
  create,
  current,
  pause,
  preview,
  resume,
  undoScheduledCancel,
} from './subscriptions.controller';
import {
  cancelSubscriptionSchema,
  changePlanSchema,
  changePreviewQuerySchema,
  createSubscriptionSchema,
} from './subscriptions.schemas';

export const subscriptionsRouter = Router();

subscriptionsRouter.use(authenticate, requireOrganization);

subscriptionsRouter.get('/current', asyncHandler(current));
subscriptionsRouter.get(
  '/current/change-preview',
  requireOrgRole('OWNER'),
  validate(changePreviewQuerySchema, 'query'),
  asyncHandler(preview),
);
subscriptionsRouter.post(
  '/',
  requireOrgRole('OWNER'),
  validate(createSubscriptionSchema),
  asyncHandler(create),
);
subscriptionsRouter.post(
  '/current/change-plan',
  requireOrgRole('OWNER'),
  validate(changePlanSchema),
  asyncHandler(change),
);
subscriptionsRouter.delete(
  '/current/scheduled-change',
  requireOrgRole('OWNER'),
  asyncHandler(clearScheduledChange),
);
subscriptionsRouter.post(
  '/current/pause',
  requireOrgRole('OWNER'),
  asyncHandler(pause),
);
subscriptionsRouter.post(
  '/current/resume',
  requireOrgRole('OWNER'),
  asyncHandler(resume),
);
subscriptionsRouter.post(
  '/current/cancel',
  requireOrgRole('OWNER'),
  validate(cancelSubscriptionSchema),
  asyncHandler(cancel),
);
subscriptionsRouter.post(
  '/current/undo-cancel',
  requireOrgRole('OWNER'),
  asyncHandler(undoScheduledCancel),
);

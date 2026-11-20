import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/authenticate';
import { requireOrganization } from '../../middleware/requireOrganization';
import { requireOrgRole } from '../../middleware/requireOrgRole';
import { validate } from '../../middleware/validate';
import { create, current } from './subscriptions.controller';
import { createSubscriptionSchema } from './subscriptions.schemas';

export const subscriptionsRouter = Router();

subscriptionsRouter.use(authenticate, requireOrganization);

subscriptionsRouter.get('/current', asyncHandler(current));
subscriptionsRouter.post(
  '/',
  requireOrgRole('OWNER'),
  validate(createSubscriptionSchema),
  asyncHandler(create),
);

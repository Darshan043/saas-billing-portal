import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/authenticate';
import { requireOrgRole } from '../../middleware/requireOrgRole';
import { requireOrganization } from '../../middleware/requireOrganization';
import { validate } from '../../middleware/validate';
import { create, current, update } from './organizations.controller';
import {
  createOrganizationSchema,
  updateOrganizationSchema,
} from './organizations.schemas';

export const organizationsRouter = Router();

organizationsRouter.post(
  '/',
  authenticate,
  validate(createOrganizationSchema),
  asyncHandler(create),
);

organizationsRouter.get(
  '/current',
  authenticate,
  requireOrganization,
  asyncHandler(current),
);

organizationsRouter.patch(
  '/current',
  authenticate,
  requireOrganization,
  requireOrgRole('OWNER'),
  validate(updateOrganizationSchema),
  asyncHandler(update),
);

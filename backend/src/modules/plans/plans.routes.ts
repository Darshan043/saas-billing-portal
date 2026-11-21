import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import { create, getOne, listAdmin, listPublic, update } from './plans.controller';
import {
  createPlanSchema,
  planIdParamsSchema,
  updatePlanSchema,
} from './plans.schemas';

export const publicPlansRouter = Router();

publicPlansRouter.get('/', asyncHandler(listPublic));

export const adminPlansRouter = Router();

adminPlansRouter.use(authenticate, requireRole('ADMIN'));

adminPlansRouter.get('/', asyncHandler(listAdmin));
adminPlansRouter.post(
  '/',
  validate(createPlanSchema),
  asyncHandler(create),
);
adminPlansRouter.get(
  '/:id',
  validate(planIdParamsSchema, 'params'),
  asyncHandler(getOne),
);
adminPlansRouter.patch(
  '/:id',
  validate(planIdParamsSchema, 'params'),
  validate(updatePlanSchema),
  asyncHandler(update),
);

import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/authenticate';
import { requireOrganization } from '../../middleware/requireOrganization';
import { validate } from '../../middleware/validate';
import { list } from './payments.controller';
import { listPaymentsQuerySchema } from './payments.schemas';

export const paymentsRouter = Router();

paymentsRouter.use(authenticate, requireOrganization);

paymentsRouter.get(
  '/',
  validate(listPaymentsQuerySchema, 'query'),
  asyncHandler(list),
);

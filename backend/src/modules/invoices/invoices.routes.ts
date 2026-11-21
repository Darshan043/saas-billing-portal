import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/authenticate';
import { requireOrganization } from '../../middleware/requireOrganization';
import { validate } from '../../middleware/validate';
import { downloadPdf, getById, list } from './invoices.controller';
import { invoiceIdParamSchema, listQuerySchema } from './invoices.schemas';

export const invoicesRouter = Router();

invoicesRouter.use(authenticate, requireOrganization);

invoicesRouter.get(
  '/',
  validate(listQuerySchema, 'query'),
  asyncHandler(list),
);
invoicesRouter.get(
  '/:id/pdf',
  validate(invoiceIdParamSchema, 'params'),
  asyncHandler(downloadPdf),
);
invoicesRouter.get(
  '/:id',
  validate(invoiceIdParamSchema, 'params'),
  asyncHandler(getById),
);

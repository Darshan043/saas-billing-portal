import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { serializeInvoice } from '../../lib/serializers';
import { requireApiKey } from '../../middleware/requireKey';
import { getInvoice, listInvoices } from './invoices.service';

export const invoicesRouter = Router();

invoicesRouter.use(requireApiKey);

invoicesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const invoices = await listInvoices();
    res.status(200).json({ invoices: invoices.map(serializeInvoice) });
  }),
);

invoicesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const invoice = await getInvoice(req.params.id);
    res.status(200).json({ invoice: serializeInvoice(invoice) });
  }),
);

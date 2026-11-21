import type { Request, Response } from 'express';
import { AppError } from '../../lib/errors';
import type { ListQuery } from './invoices.schemas';
import { streamInvoicePdf } from './invoicePdf';
import {
  getInvoiceForOrganization,
  listInvoices,
  toInvoiceDetail,
} from './invoices.service';

function organizationId(req: Request): string {
  if (!req.organization) {
    throw AppError.forbidden(
      'ORGANIZATION_REQUIRED',
      'An organization is required',
    );
  }
  return req.organization.id;
}

export async function list(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListQuery;
  const result = await listInvoices(organizationId(req), query);
  res.status(200).json(result);
}

export async function getById(req: Request, res: Response): Promise<void> {
  const invoice = await getInvoiceForOrganization(
    organizationId(req),
    req.params.id,
  );
  res.status(200).json(toInvoiceDetail(invoice));
}

export async function downloadPdf(req: Request, res: Response): Promise<void> {
  const invoice = await getInvoiceForOrganization(
    organizationId(req),
    req.params.id,
  );
  streamInvoicePdf(invoice, res);
}

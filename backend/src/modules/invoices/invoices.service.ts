import { prisma } from '../../lib/prisma';
import { formatInvoiceNumber } from '../../lib/invoiceNumber';
import { AppError } from '../../lib/errors';
import type { ListQuery } from './invoices.schemas';

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

export async function listInvoices(organizationId: string, query: ListQuery) {
  const where = { organizationId };
  const skip = (query.page - 1) * query.pageSize;
  const [rows, totalItems] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: [{ issuedAt: 'desc' }, { number: 'desc' }],
      skip,
      take: query.pageSize,
      include: {
        items: { orderBy: { createdAt: 'asc' }, take: 1 },
      },
    }),
    prisma.invoice.count({ where }),
  ]);

  return {
    items: rows.map((invoice) => ({
      id: invoice.id,
      number: invoice.number,
      displayNumber: formatInvoiceNumber(invoice.number),
      status: invoice.status,
      total: invoice.total,
      currency: invoice.currency,
      issuedAt: invoice.issuedAt.toISOString(),
      paidAt: iso(invoice.paidAt),
      periodStart: invoice.periodStart.toISOString(),
      periodEnd: iso(invoice.periodEnd),
      description: invoice.items[0]?.description ?? '',
    })),
    page: query.page,
    pageSize: query.pageSize,
    totalItems,
    totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / query.pageSize),
  };
}

export async function getInvoiceForOrganization(
  organizationId: string,
  invoiceId: string,
) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, organizationId },
    include: {
      organization: { select: { name: true, billingEmail: true } },
      items: { orderBy: { createdAt: 'asc' } },
      payments: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });
  if (!invoice) {
    throw AppError.notFound('NOT_FOUND', 'Invoice not found');
  }
  return invoice;
}

export function toInvoiceDetail(invoice: Awaited<ReturnType<typeof getInvoiceForOrganization>>) {
  const payment = invoice.payments[0] ?? null;
  return {
    invoice: {
      id: invoice.id,
      number: invoice.number,
      displayNumber: formatInvoiceNumber(invoice.number),
      status: invoice.status,
      subtotal: invoice.subtotal,
      total: invoice.total,
      currency: invoice.currency,
      issuedAt: invoice.issuedAt.toISOString(),
      paidAt: iso(invoice.paidAt),
      periodStart: invoice.periodStart.toISOString(),
      periodEnd: iso(invoice.periodEnd),
      organization: {
        name: invoice.organization.name,
        billingEmail: invoice.organization.billingEmail,
      },
      items: invoice.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitAmount: item.unitAmount,
        amount: item.amount,
      })),
      payment: payment
        ? {
            id: payment.id,
            status: payment.status,
            amount: payment.amount,
            currency: payment.currency,
            paymentMethodLabel: payment.paymentMethodLabel,
            createdAt: payment.createdAt.toISOString(),
          }
        : null,
    },
  };
}

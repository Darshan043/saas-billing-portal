import { prisma } from '../../lib/prisma';
import { formatInvoiceNumber } from '../../lib/invoiceNumber';
import type { ListPaymentsQuery } from './payments.schemas';

export async function listPayments(
  organizationId: string,
  query: ListPaymentsQuery,
) {
  const where = { organizationId };
  const skip = (query.page - 1) * query.pageSize;
  const [rows, totalItems] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: query.pageSize,
      include: { invoice: { select: { id: true, number: true } } },
    }),
    prisma.payment.count({ where }),
  ]);

  return {
    items: rows.map((payment) => ({
      id: payment.id,
      status: payment.status,
      amount: payment.amount,
      currency: payment.currency,
      paymentMethodLabel: payment.paymentMethodLabel,
      failureMessage: payment.failureMessage,
      createdAt: payment.createdAt.toISOString(),
      invoice: payment.invoice
        ? {
            id: payment.invoice.id,
            displayNumber: formatInvoiceNumber(payment.invoice.number),
          }
        : null,
    })),
    page: query.page,
    pageSize: query.pageSize,
    totalItems,
    totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / query.pageSize),
  };
}

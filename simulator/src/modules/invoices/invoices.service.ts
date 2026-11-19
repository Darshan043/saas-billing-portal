import { AppError } from '../../lib/errors';
import { prisma } from '../../lib/prisma';

export async function getInvoice(id: string) {
  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice) {
    throw AppError.notFound('INVOICE_NOT_FOUND', 'Simulated invoice not found');
  }
  return invoice;
}

export async function listInvoices(limit = 25) {
  return prisma.invoice.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

import type { Prisma } from '@prisma/client';

export async function allocateInvoiceNumber(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<number> {
  // Increment inside the handler transaction so a thrown handler rolls
  // the number back and the next success reuses it (no gaps).
  const updated = await tx.organization.update({
    where: { id: organizationId },
    data: { nextInvoiceNumber: { increment: 1 } },
    select: { nextInvoiceNumber: true },
  });
  return updated.nextInvoiceNumber - 1;
}

export function formatInvoiceNumber(number: number): string {
  return `INV-${String(number).padStart(6, '0')}`;
}

import type { Response } from 'express';
import PDFDocument from 'pdfkit';
import { formatInvoiceNumber } from '../../lib/invoiceNumber';
import { formatMoney } from '../../lib/money';
import type { getInvoiceForOrganization } from './invoices.service';

type InvoiceRecord = Awaited<ReturnType<typeof getInvoiceForOrganization>>;

function formatDate(value: Date | null): string {
  if (!value) {
    return '—';
  }
  return value.toISOString().slice(0, 10);
}

export function streamInvoicePdf(invoice: InvoiceRecord, res: Response): void {
  const displayNumber = formatInvoiceNumber(invoice.number);
  const filename = `invoice-${displayNumber}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${filename}"`,
  );

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(res);

  doc.font('Helvetica-Bold').fontSize(20).text('BillingHub');
  doc.moveDown(0.4);
  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor('#9a3412')
    .text('SIMULATED PAYMENT - no real money was charged');
  doc.fillColor('#000000');
  doc.moveDown(0.8);
  doc.font('Helvetica-Bold').fontSize(16).text(`INVOICE ${displayNumber}`);
  doc.moveDown(0.4);
  doc.font('Helvetica').fontSize(11);
  doc.text(`Status: ${invoice.status}`);
  doc.text(`Issue date: ${formatDate(invoice.issuedAt)}`);
  doc.text(`Paid date: ${formatDate(invoice.paidAt)}`);
  doc.text(
    `Billing period: ${formatDate(invoice.periodStart)} to ${formatDate(invoice.periodEnd)}`,
  );
  doc.moveDown(0.8);
  doc.font('Helvetica-Bold').text('Billed to');
  doc.font('Helvetica');
  doc.text(invoice.organization.name);
  doc.text(invoice.organization.billingEmail);
  doc.moveDown(0.8);

  const tableLeft = 50;
  const colDescription = 250;
  const colQty = 50;
  const colUnit = 90;
  const colAmount = 90;
  let y = doc.y;
  doc.font('Helvetica-Bold');
  doc.text('Description', tableLeft, y, { width: colDescription });
  doc.text('Qty', tableLeft + colDescription, y, { width: colQty });
  doc.text('Unit', tableLeft + colDescription + colQty, y, { width: colUnit });
  doc.text(
    'Amount',
    tableLeft + colDescription + colQty + colUnit,
    y,
    { width: colAmount, align: 'right' },
  );
  y += 18;
  doc.moveTo(tableLeft, y).lineTo(545, y).stroke();
  y += 8;
  doc.font('Helvetica');

  for (const item of invoice.items) {
    const descriptionHeight = doc.heightOfString(item.description, {
      width: colDescription,
    });
    const rowHeight = Math.max(16, descriptionHeight);
    if (y + rowHeight > 720) {
      doc.addPage();
      y = 50;
    }
    doc.text(item.description, tableLeft, y, { width: colDescription });
    doc.text(String(item.quantity), tableLeft + colDescription, y, {
      width: colQty,
    });
    doc.text(
      formatMoney(item.unitAmount, invoice.currency),
      tableLeft + colDescription + colQty,
      y,
      { width: colUnit },
    );
    doc.text(
      formatMoney(item.amount, invoice.currency),
      tableLeft + colDescription + colQty + colUnit,
      y,
      { width: colAmount, align: 'right' },
    );
    y += rowHeight + 8;
  }

  doc.y = y + 8;
  doc.font('Helvetica-Bold');
  doc.text(`Subtotal: ${formatMoney(invoice.subtotal, invoice.currency)}`, {
    align: 'right',
  });
  doc.text(`Total: ${formatMoney(invoice.total, invoice.currency)}`, {
    align: 'right',
  });
  doc.moveDown(1.2);
  doc.font('Helvetica').fontSize(10);
  const payment = invoice.payments[0];
  if (payment?.paymentMethodLabel) {
    doc.text(`Payment method: ${payment.paymentMethodLabel}`);
  }

  doc.end();
}

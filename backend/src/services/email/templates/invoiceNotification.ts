import { emailLayout } from './layout';
import type { InvoiceNotificationEmailData } from '../types';

function formatAmount(minorUnits: number, currency: string): string {
  const major = (minorUnits / 100).toFixed(2);
  return `${currency.toUpperCase()} $${major}`;
}

export function invoiceNotificationTemplate(data: InvoiceNotificationEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const formatted = formatAmount(data.total, data.currency);
  const invoiceNumberFormatted = `INV-${String(data.invoiceNumber).padStart(6, '0')}`;
  const startStr = data.periodStart.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const endStr = data.periodEnd
    ? data.periodEnd.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'N/A';

  const subject = `Invoice ${invoiceNumberFormatted} from BillingHub`;

  const bodyContent = `
    <h2>Invoice ${invoiceNumberFormatted}</h2>
    <p>A new invoice has been generated for <strong>${data.organizationName}</strong>.</p>

    <table class="details-table">
      <tr>
        <td class="label">Invoice Number</td>
        <td class="value">${invoiceNumberFormatted}</td>
      </tr>
      <tr>
        <td class="label">Status</td>
        <td class="value"><span class="badge">${data.status}</span></td>
      </tr>
      <tr>
        <td class="label">Total Amount</td>
        <td class="value">${formatted}</td>
      </tr>
      <tr>
        <td class="label">Billing Period</td>
        <td class="value">${startStr} – ${endStr}</td>
      </tr>
    </table>

    <p style="margin-top: 24px; color: #475569; font-size: 14px;">
      You can view line items and download the official PDF for this invoice directly in your customer billing portal.
    </p>
  `;

  const html = emailLayout({
    title: subject,
    previewText: `New invoice ${invoiceNumberFormatted}: ${formatted} (${data.status})`,
    bodyContent,
  });

  const text = `BillingHub - Invoice ${invoiceNumberFormatted}

A new invoice has been generated for ${data.organizationName}.

Invoice Summary:
- Number: ${invoiceNumberFormatted}
- Status: ${data.status}
- Total: ${formatted}
- Period: ${startStr} - ${endStr}

Log in to your BillingHub customer portal to view itemized charges or download the PDF.
`;

  return { subject, html, text };
}


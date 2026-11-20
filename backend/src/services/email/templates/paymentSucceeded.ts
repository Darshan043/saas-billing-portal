import { emailLayout } from './layout';
import type { PaymentSucceededEmailData } from '../types';

function formatAmount(minorUnits: number, currency: string): string {
  const major = (minorUnits / 100).toFixed(2);
  return `${currency.toUpperCase()} $${major}`;
}

export function paymentSucceededTemplate(data: PaymentSucceededEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const formatted = formatAmount(data.amount, data.currency);
  const invoiceRef = data.invoiceNumber
    ? `INV-${String(data.invoiceNumber).padStart(6, '0')}`
    : 'N/A';
  const paymentMethod = data.paymentMethodLabel || 'Credit / Debit Card';
  const dateStr = (data.paidAt ?? new Date()).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const subject = `Payment Confirmation: ${formatted} received`;

  const bodyContent = `
    <h2>Payment Succeeded</h2>
    <p>Hello,</p>
    <p>We received your payment for <strong>${data.organizationName}</strong>. Thank you for your business!</p>

    <table class="details-table">
      <tr>
        <td class="label">Amount Paid</td>
        <td class="value"><span class="badge">${formatted}</span></td>
      </tr>
      <tr>
        <td class="label">Invoice Number</td>
        <td class="value">${invoiceRef}</td>
      </tr>
      <tr>
        <td class="label">Payment Method</td>
        <td class="value">${paymentMethod}</td>
      </tr>
      <tr>
        <td class="label">Transaction ID</td>
        <td class="value" style="font-family: monospace; font-size: 13px;">${data.paymentId}</td>
      </tr>
      <tr>
        <td class="label">Date</td>
        <td class="value">${dateStr}</td>
      </tr>
    </table>

    <p style="margin-top: 24px; color: #475569; font-size: 14px;">
      You can access your complete invoice and payment history anytime by logging into your BillingHub customer portal.
    </p>
  `;

  const html = emailLayout({
    title: subject,
    previewText: `Payment received: ${formatted} for ${data.organizationName}`,
    bodyContent,
  });

  const text = `BillingHub - Payment Confirmation

Hello,

We received your payment of ${formatted} for ${data.organizationName}.

Payment Details:
- Amount: ${formatted}
- Invoice: ${invoiceRef}
- Payment Method: ${paymentMethod}
- Transaction ID: ${data.paymentId}
- Date: ${dateStr}

Log in to your BillingHub portal to view or download full invoice details.
`;

  return { subject, html, text };
}


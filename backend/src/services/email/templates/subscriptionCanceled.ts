import { emailLayout } from './layout';
import type { SubscriptionCanceledEmailData } from '../types';

export function subscriptionCanceledTemplate(data: SubscriptionCanceledEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const isPeriodEnd = data.when === 'AT_PERIOD_END';
  const effectiveStr = data.effectiveAt
    ? new Date(data.effectiveAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'Immediately';

  const subject = `Subscription Cancellation Confirmation - BillingHub`;

  const bodyContent = `
    <h2>Subscription Canceled</h2>
    <p>We received a cancellation request for your <strong>${data.planName}</strong> subscription for <strong>${data.organizationName}</strong>.</p>

    <table class="details-table">
      <tr>
        <td class="label">Plan</td>
        <td class="value">${data.planName}</td>
      </tr>
      <tr>
        <td class="label">Cancellation Type</td>
        <td class="value">${isPeriodEnd ? 'At End of Current Period' : 'Immediate'}</td>
      </tr>
      <tr>
        <td class="label">Access Ends</td>
        <td class="value"><strong>${effectiveStr}</strong></td>
      </tr>
    </table>

    <p style="margin-top: 24px; color: #475569; font-size: 14px;">
      ${
        isPeriodEnd
          ? `You will retain full access to your plan features and data until ${effectiveStr}. You can undo this cancellation anytime before your billing cycle ends in the customer portal.`
          : 'Your subscription access has ended. We appreciate having you with us and hope to welcome you back in the future.'
      }
    </p>
  `;

  const html = emailLayout({
    title: subject,
    previewText: `Subscription cancellation confirmed for ${data.organizationName}`,
    bodyContent,
  });

  const text = `BillingHub - Subscription Cancellation Confirmation

Your ${data.planName} subscription for ${data.organizationName} has been canceled.

Details:
- Plan: ${data.planName}
- Type: ${isPeriodEnd ? 'At period end' : 'Immediate'}
- Access Ends: ${effectiveStr}

${isPeriodEnd ? `You maintain full access until ${effectiveStr}. You can undo this cancellation anytime prior to renewal.` : 'Your subscription access has ended.'}
`;

  return { subject, html, text };
}


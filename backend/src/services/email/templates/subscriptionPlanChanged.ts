import { emailLayout } from './layout';
import type { SubscriptionPlanChangedEmailData } from '../types';

export function subscriptionPlanChangedTemplate(data: SubscriptionPlanChangedEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const isUpgrade = data.kind === 'UPGRADE';
  const actionLabel = isUpgrade ? 'Plan Upgrade Confirmation' : 'Plan Downgrade Scheduled';
  const intervalLabel = data.interval === 'YEAR' ? 'Annual' : 'Monthly';

  const subject = isUpgrade
    ? `Upgraded to ${data.planName} - BillingHub`
    : `Downgrade to ${data.planName} Scheduled - BillingHub`;

  const prorationRow = isUpgrade && typeof data.chargeAmount === 'number'
    ? `<tr>
        <td class="label">Prorated Charge</td>
        <td class="value"><span class="badge">${(data.currency ?? 'USD').toUpperCase()} $${(data.chargeAmount / 100).toFixed(2)}</span></td>
      </tr>`
    : '';

  const effectiveRow = data.effectiveAt
    ? `<tr>
        <td class="label">Effective Date</td>
        <td class="value">${new Date(data.effectiveAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
      </tr>`
    : '';

  const bodyContent = `
    <h2>${actionLabel}</h2>
    <p>Your subscription plan for <strong>${data.organizationName}</strong> has been updated.</p>

    <table class="details-table">
      <tr>
        <td class="label">New Plan</td>
        <td class="value"><strong>${data.planName}</strong></td>
      </tr>
      <tr>
        <td class="label">Billing Interval</td>
        <td class="value">${intervalLabel}</td>
      </tr>
      ${prorationRow}
      ${effectiveRow}
    </table>

    <p style="margin-top: 24px; color: #475569; font-size: 14px;">
      ${
        isUpgrade
          ? 'Your new quotas and plan features are active immediately.'
          : 'Your current plan and quotas remain active until your renewal date, at which time your subscription will transition to the new tier.'
      }
    </p>
  `;

  const html = emailLayout({
    title: subject,
    previewText: `${actionLabel}: ${data.planName} for ${data.organizationName}`,
    bodyContent,
  });

  const text = `BillingHub - ${actionLabel}

Your subscription plan for ${data.organizationName} has been updated.

Details:
- Plan: ${data.planName} (${intervalLabel})
${isUpgrade && typeof data.chargeAmount === 'number' ? `- Prorated Charge: ${(data.currency ?? 'USD').toUpperCase()} $${(data.chargeAmount / 100).toFixed(2)}\n` : ''}${data.effectiveAt ? `- Effective: ${data.effectiveAt}\n` : ''}
${isUpgrade ? 'Your new plan is active immediately.' : 'Your downgrade will take effect at the end of your current billing period.'}
`;

  return { subject, html, text };
}


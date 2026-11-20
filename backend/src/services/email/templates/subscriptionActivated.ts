import { emailLayout } from './layout';
import type { SubscriptionActivatedEmailData } from '../types';

export function subscriptionActivatedTemplate(data: SubscriptionActivatedEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const intervalLabel = data.interval === 'YEAR' ? 'Annual' : 'Monthly';
  const startStr = data.currentPeriodStart
    ? data.currentPeriodStart.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'Immediate';
  const endStr = data.currentPeriodEnd
    ? data.currentPeriodEnd.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'Ongoing';

  const subject = `Subscription Activated: Welcome to ${data.planName}!`;

  const bodyContent = `
    <h2>Welcome to ${data.planName}</h2>
    <p>Your subscription for <strong>${data.organizationName}</strong> is now active!</p>

    <table class="details-table">
      <tr>
        <td class="label">Plan</td>
        <td class="value">${data.planName}</td>
      </tr>
      <tr>
        <td class="label">Billing Cadence</td>
        <td class="value">${intervalLabel}</td>
      </tr>
      <tr>
        <td class="label">Status</td>
        <td class="value"><span class="badge">ACTIVE</span></td>
      </tr>
      <tr>
        <td class="label">Current Period</td>
        <td class="value">${startStr} – ${endStr}</td>
      </tr>
    </table>

    <p style="margin-top: 24px; color: #475569; font-size: 14px;">
      Your workspace limits and features have been provisioned according to your active tier. You can manage your subscription, view invoices, or update payment settings at any time in the portal.
    </p>
  `;

  const html = emailLayout({
    title: subject,
    previewText: `Your ${data.planName} subscription is now active for ${data.organizationName}`,
    bodyContent,
  });

  const text = `BillingHub - Subscription Activated

Welcome to ${data.planName}!

Your subscription for ${data.organizationName} is now active.

Subscription Details:
- Plan: ${data.planName} (${intervalLabel})
- Status: ACTIVE
- Period: ${startStr} - ${endStr}

Log in to BillingHub to explore your features.
`;

  return { subject, html, text };
}


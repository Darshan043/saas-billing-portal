import { EmailStatus } from '@prisma/client';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import { getSendBoss } from '../../jobs/boss';
import {
  EMAIL_DEAD_LETTER,
  EMAIL_JOB_RETRY_DELAY_SECONDS,
  EMAIL_JOB_RETRY_LIMIT,
  SEND_EMAIL,
  type EmailJobData,
} from '../../jobs/queues';
import { emailService } from './emailService';
import { invoiceNotificationTemplate } from './templates/invoiceNotification';
import { paymentSucceededTemplate } from './templates/paymentSucceeded';
import { subscriptionActivatedTemplate } from './templates/subscriptionActivated';
import { subscriptionCanceledTemplate } from './templates/subscriptionCanceled';
import { subscriptionPlanChangedTemplate } from './templates/subscriptionPlanChanged';
import type {
  InvoiceNotificationEmailData,
  PaymentSucceededEmailData,
  SubscriptionActivatedEmailData,
  SubscriptionCanceledEmailData,
  SubscriptionPlanChangedEmailData,
} from './types';

const dispatcherLogger = logger.child({ service: 'email-dispatcher' });

export type EnqueueEmailParams = {
  organizationId?: string | null;
  recipient: string;
  template: string;
  dedupeKey: string;
  subject: string;
  html: string;
  text: string;
};

export async function enqueueEmail(
  params: EnqueueEmailParams,
): Promise<{ emailLogId: string; status: EmailStatus }> {
  // Idempotency check: see if this dedupeKey already exists
  const existing = await prisma.emailLog.findUnique({
    where: { dedupeKey: params.dedupeKey },
  });

  if (existing) {
    if (existing.status === EmailStatus.SENT) {
      dispatcherLogger.info(
        { dedupeKey: params.dedupeKey, recipient: params.recipient },
        'email with dedupeKey already SENT; skipping',
      );
      return { emailLogId: existing.id, status: existing.status };
    }
    dispatcherLogger.info(
      { dedupeKey: params.dedupeKey, status: existing.status },
      'reusing existing email_log record',
    );
  }

  const logRecord =
    existing ??
    (await prisma.emailLog.create({
      data: {
        organizationId: params.organizationId ?? null,
        recipient: params.recipient,
        template: params.template,
        dedupeKey: params.dedupeKey,
        status: EmailStatus.QUEUED,
      },
    }));

  const jobPayload: EmailJobData = {
    emailLogId: logRecord.id,
    to: params.recipient,
    subject: params.subject,
    html: params.html,
    text: params.text,
  };

  try {
    const boss = getSendBoss();
    await boss.send(SEND_EMAIL, jobPayload, {
      singletonKey: params.dedupeKey,
      retryLimit: EMAIL_JOB_RETRY_LIMIT,
      retryDelay: EMAIL_JOB_RETRY_DELAY_SECONDS,
      retryBackoff: true,
      deadLetter: EMAIL_DEAD_LETTER,
    });
    dispatcherLogger.info(
      { dedupeKey: params.dedupeKey, emailLogId: logRecord.id },
      'email background job enqueued',
    );
  } catch (bossErr) {
    dispatcherLogger.warn(
      { err: bossErr, dedupeKey: params.dedupeKey },
      'pg-boss unavailable; executing email delivery directly',
    );
    // Direct delivery fallback when pg-boss is not running
    const result = await emailService.sendEmail({
      to: params.recipient,
      subject: params.subject,
      html: params.html,
      text: params.text,
    });
    if (result.success) {
      await prisma.emailLog.update({
        where: { id: logRecord.id },
        data: { status: EmailStatus.SENT, sentAt: new Date(), error: null },
      });
      return { emailLogId: logRecord.id, status: EmailStatus.SENT };
    } else {
      await prisma.emailLog.update({
        where: { id: logRecord.id },
        data: { status: EmailStatus.FAILED, error: result.error?.slice(0, 1000) },
      });
      return { emailLogId: logRecord.id, status: EmailStatus.FAILED };
    }
  }

  return { emailLogId: logRecord.id, status: EmailStatus.QUEUED };
}

export async function dispatchPaymentSucceededEmail(
  data: PaymentSucceededEmailData & { organizationId?: string | null },
): Promise<void> {
  const { subject, html, text } = paymentSucceededTemplate(data);
  const dedupeKey = `payment-succeeded-${data.paymentId}`;
  await enqueueEmail({
    organizationId: data.organizationId,
    recipient: data.recipient,
    template: 'payment_succeeded',
    dedupeKey,
    subject,
    html,
    text,
  });
}

export async function dispatchInvoiceNotificationEmail(
  data: InvoiceNotificationEmailData & { organizationId?: string | null },
): Promise<void> {
  const { subject, html, text } = invoiceNotificationTemplate(data);
  const dedupeKey = `invoice-notification-${data.invoiceId}`;
  await enqueueEmail({
    organizationId: data.organizationId,
    recipient: data.recipient,
    template: 'invoice_notification',
    dedupeKey,
    subject,
    html,
    text,
  });
}

export async function dispatchSubscriptionActivatedEmail(
  data: SubscriptionActivatedEmailData & { organizationId?: string | null },
): Promise<void> {
  const { subject, html, text } = subscriptionActivatedTemplate(data);
  const dedupeKey = `subscription-activated-${data.subscriptionId}`;
  await enqueueEmail({
    organizationId: data.organizationId,
    recipient: data.recipient,
    template: 'subscription_activated',
    dedupeKey,
    subject,
    html,
    text,
  });
}

export async function dispatchSubscriptionPlanChangedEmail(
  data: SubscriptionPlanChangedEmailData & { organizationId?: string | null },
): Promise<void> {
  const { subject, html, text } = subscriptionPlanChangedTemplate(data);
  const timestamp = Math.floor(Date.now() / 1000);
  const dedupeKey = `subscription-changed-${data.subscriptionId}-${data.kind.toLowerCase()}-${timestamp}`;
  await enqueueEmail({
    organizationId: data.organizationId,
    recipient: data.recipient,
    template: 'subscription_plan_changed',
    dedupeKey,
    subject,
    html,
    text,
  });
}

export async function dispatchSubscriptionCanceledEmail(
  data: SubscriptionCanceledEmailData & { organizationId?: string | null },
): Promise<void> {
  const { subject, html, text } = subscriptionCanceledTemplate(data);
  const timestamp = Math.floor(Date.now() / 1000);
  const dedupeKey = `subscription-canceled-${data.subscriptionId}-${data.when.toLowerCase()}-${timestamp}`;
  await enqueueEmail({
    organizationId: data.organizationId,
    recipient: data.recipient,
    template: 'subscription_canceled',
    dedupeKey,
    subject,
    html,
    text,
  });
}


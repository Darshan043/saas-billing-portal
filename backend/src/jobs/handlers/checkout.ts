import {
  AuditSource,
  PaymentStatus,
  Prisma,
  SubscriptionStatus,
  type Subscription,
} from '@prisma/client';
import { recordAudit } from '../../modules/audit/audit.service';
import { dispatchSubscriptionActivatedEmail } from '../../services/email/emailDispatcher';
import type { WebhookHandler } from '../webhookProcessor';
import type { HandlerRegistry } from './index';
import {
  eventData,
  eventMetadata,
  parseIsoDate,
  stringField,
} from './payload';

async function findSubscription(
  tx: Prisma.TransactionClient,
  data: Record<string, unknown>,
): Promise<Subscription | null> {
  const metadata = eventMetadata(data);
  if (metadata.subscriptionId) {
    const byLocalId = await tx.subscription.findUnique({
      where: { id: metadata.subscriptionId },
    });
    if (byLocalId) {
      return byLocalId;
    }
  }
  const providerSubscriptionId = stringField(data, 'subscriptionId');
  if (!providerSubscriptionId) {
    return null;
  }
  return tx.subscription.findFirst({
    where: { providerSubscriptionId },
  });
}

async function lockSubscription(
  tx: Prisma.TransactionClient,
  id: string,
): Promise<Subscription | null> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM subscriptions
    WHERE id = ${id}::uuid
    FOR UPDATE
  `;
  if (!rows[0]) {
    return null;
  }
  return tx.subscription.findUnique({ where: { id } });
}

export const handleSubscriptionActivated: WebhookHandler = async (ctx) => {
  const data = eventData(ctx.event);
  const found = await findSubscription(ctx.tx, data);
  if (!found) {
    ctx.logger.warn(
      { eventId: ctx.event.id },
      'subscription.activated for unknown subscription',
    );
    return;
  }

  // Lock, then re-check status so a late or duplicate event cannot revive
  // a canceled row or write a second activation audit.
  const locked = await lockSubscription(ctx.tx, found.id);
  if (!locked) {
    return;
  }

  if (locked.status === SubscriptionStatus.ACTIVE) {
    return;
  }
  if (locked.status !== SubscriptionStatus.PENDING) {
    ctx.logger.warn(
      {
        eventId: ctx.event.id,
        subscriptionId: locked.id,
        status: locked.status,
      },
      'ignoring late subscription.activated',
    );
    return;
  }

  const providerSubscriptionId =
    stringField(data, 'subscriptionId') ?? locked.providerSubscriptionId;
  const currentPeriodStart =
    parseIsoDate(data.currentPeriodStart) ?? locked.currentPeriodStart;
  const currentPeriodEnd =
    parseIsoDate(data.currentPeriodEnd) ?? locked.currentPeriodEnd;

  const updated = await ctx.tx.subscription.update({
    where: { id: locked.id },
    data: {
      status: SubscriptionStatus.ACTIVE,
      providerSubscriptionId:
        locked.providerSubscriptionId ?? providerSubscriptionId,
      currentPeriodStart,
      currentPeriodEnd,
    },
  });

  await recordAudit(ctx.tx, {
    subscriptionId: updated.id,
    organizationId: updated.organizationId,
    action: 'subscription.activated',
    source: AuditSource.WEBHOOK,
    webhookEventId: ctx.event.id,
    beforeState: {
      status: locked.status,
      planPriceId: locked.planPriceId,
      currentPeriodStart: locked.currentPeriodStart?.toISOString() ?? null,
      currentPeriodEnd: locked.currentPeriodEnd?.toISOString() ?? null,
    },
    afterState: {
      status: updated.status,
      planPriceId: updated.planPriceId,
      currentPeriodStart: updated.currentPeriodStart?.toISOString() ?? null,
      currentPeriodEnd: updated.currentPeriodEnd?.toISOString() ?? null,
    },
  });

  const organization = await ctx.tx.organization.findUnique({
    where: { id: updated.organizationId },
    select: { name: true, billingEmail: true },
  });
  const planPrice = await ctx.tx.planPrice.findUnique({
    where: { id: updated.planPriceId },
    include: { plan: true },
  });

  if (ctx.postCommit && organization?.billingEmail && planPrice) {
    const orgEmail = organization.billingEmail;
    const orgName = organization.name;
    const subId = updated.id;
    const planName = planPrice.plan.name;
    const interval = planPrice.interval;
    const periodStart = updated.currentPeriodStart;
    const periodEnd = updated.currentPeriodEnd;

    ctx.postCommit(async () => {
      await dispatchSubscriptionActivatedEmail({
        organizationId: updated.organizationId,
        recipient: orgEmail,
        organizationName: orgName,
        subscriptionId: subId,
        planName,
        interval,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
      });
    });
  }
};

function failureMessage(data: Record<string, unknown>): string {
  const code = stringField(data, 'errorCode');
  if (code === 'CARD_DECLINED') {
    return 'Card declined';
  }
  if (code === 'INSUFFICIENT_FUNDS') {
    return 'Insufficient funds';
  }
  return code ?? 'Payment failed';
}

export const handlePaymentFailed: WebhookHandler = async (ctx) => {
  const data = eventData(ctx.event);
  const found = await findSubscription(ctx.tx, data);
  if (!found) {
    ctx.logger.warn(
      { eventId: ctx.event.id, type: ctx.event.type },
      'payment failure for unknown subscription',
    );
    return;
  }

  const locked = await lockSubscription(ctx.tx, found.id);
  if (!locked) {
    return;
  }

  if (locked.status !== SubscriptionStatus.PENDING) {
    ctx.logger.info(
      {
        eventId: ctx.event.id,
        subscriptionId: locked.id,
        status: locked.status,
      },
      'payment.failed for non-pending subscription - handled in Step 12',
    );
    return;
  }

  const providerPaymentId = stringField(data, 'paymentId');
  if (!providerPaymentId) {
    ctx.logger.warn(
      { eventId: ctx.event.id },
      'payment failure missing paymentId',
    );
    return;
  }

  await ctx.tx.payment.upsert({
    where: { providerPaymentId },
    create: {
      organizationId: locked.organizationId,
      subscriptionId: locked.id,
      providerPaymentId,
      status: PaymentStatus.FAILED,
      amount: typeof data.amount === 'number' ? data.amount : 0,
      currency: stringField(data, 'currency') ?? 'USD',
      failureCode: stringField(data, 'errorCode'),
      failureMessage: failureMessage(data),
    },
    update: {},
  });

  const now = new Date();
  const updated = await ctx.tx.subscription.update({
    where: { id: locked.id },
    data: {
      status: SubscriptionStatus.CANCELED,
      canceledAt: now,
      endedAt: now,
    },
  });

  const existingAudit = await ctx.tx.auditLog.findFirst({
    where: {
      subscriptionId: locked.id,
      action: 'subscription.payment_failed',
    },
  });
  if (existingAudit) {
    return;
  }

  await recordAudit(ctx.tx, {
    subscriptionId: updated.id,
    organizationId: updated.organizationId,
    action: 'subscription.payment_failed',
    source: AuditSource.WEBHOOK,
    webhookEventId: ctx.event.id,
    beforeState: {
      status: locked.status,
      planPriceId: locked.planPriceId,
      currentPeriodStart: locked.currentPeriodStart?.toISOString() ?? null,
      currentPeriodEnd: locked.currentPeriodEnd?.toISOString() ?? null,
    },
    afterState: {
      status: updated.status,
      planPriceId: updated.planPriceId,
      currentPeriodStart: updated.currentPeriodStart?.toISOString() ?? null,
      currentPeriodEnd: updated.currentPeriodEnd?.toISOString() ?? null,
      reason: failureMessage(data),
    },
  });
};

export function registerCheckoutHandlers(
  target: HandlerRegistry,
): void {
  target.register('subscription.activated', handleSubscriptionActivated);
  target.register('payment.declined', handlePaymentFailed);
  target.register('payment.insufficient_funds', handlePaymentFailed);
}

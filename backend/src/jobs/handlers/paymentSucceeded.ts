import {
  InvoiceStatus,
  PaymentStatus,
  Prisma,
  type BillingInterval,
  type Subscription,
} from '@prisma/client';
import { z } from 'zod';
import { allocateInvoiceNumber } from '../../lib/invoiceNumber';
import type { WebhookHandler } from '../webhookProcessor';
import type { HandlerRegistry } from './index';
import { asRecord, parseIsoDate } from './payload';

const paymentSucceededDataSchema = z
  .object({
    paymentId: z.string().min(1),
    amount: z.number().int(),
    currency: z.string().min(1).optional(),
    customerId: z.string().min(1).optional(),
    subscriptionId: z.string().min(1).optional(),
    invoiceId: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    paymentMethodLabel: z.string().min(1).max(80).optional(),
    currentPeriodStart: z.string().optional(),
    currentPeriodEnd: z.string().optional(),
    periodStart: z.string().optional(),
    periodEnd: z.string().optional(),
    metadata: z
      .object({
        subscriptionId: z.string().min(1).optional(),
        organizationId: z.string().min(1).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

type PaymentSucceededData = z.infer<typeof paymentSucceededDataSchema>;

type SubscriptionWithPrice = Subscription & {
  planPrice: {
    interval: BillingInterval;
    currency: string;
    plan: { name: string };
  };
};

export const paymentSucceededTestHooks = {
  afterAllocate: async (
    _tx: Prisma.TransactionClient,
  ): Promise<void> => undefined,
};

function parsePaymentSucceededData(eventPayload: unknown): PaymentSucceededData {
  const data = asRecord(asRecord(eventPayload).data);
  const parsed = paymentSucceededDataSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error('payment.succeeded is missing required fields');
  }
  return parsed.data;
}

function paymentTime(eventPayload: unknown, receivedAt: Date): Date {
  const createdAt = parseIsoDate(asRecord(eventPayload).createdAt);
  return createdAt ?? receivedAt;
}

async function lockPaymentId(
  tx: Prisma.TransactionClient,
  providerPaymentId: string,
): Promise<void> {
  // Transaction-scoped lock: released on commit/rollback. Serializes two
  // events (or workers) that share the same provider payment id.
  // $executeRaw: pg_advisory_xact_lock returns void, which $queryRaw cannot read.
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${providerPaymentId}::text, 0))
  `;
}

async function findSubscription(
  tx: Prisma.TransactionClient,
  data: PaymentSucceededData,
): Promise<SubscriptionWithPrice | null> {
  const localId = data.metadata?.subscriptionId;
  if (localId) {
    const byLocal = await tx.subscription.findUnique({
      where: { id: localId },
      include: { planPrice: { include: { plan: true } } },
    });
    if (byLocal) {
      return byLocal;
    }
  }
  if (data.subscriptionId) {
    return tx.subscription.findFirst({
      where: { providerSubscriptionId: data.subscriptionId },
      include: { planPrice: { include: { plan: true } } },
    });
  }
  return null;
}

async function findOrganizationId(
  tx: Prisma.TransactionClient,
  data: PaymentSucceededData,
  subscription: SubscriptionWithPrice | null,
): Promise<string | null> {
  if (subscription) {
    return subscription.organizationId;
  }
  if (data.metadata?.organizationId) {
    const org = await tx.organization.findUnique({
      where: { id: data.metadata.organizationId },
      select: { id: true },
    });
    if (org) {
      return org.id;
    }
  }
  if (data.customerId) {
    const org = await tx.organization.findUnique({
      where: { providerCustomerId: data.customerId },
      select: { id: true },
    });
    if (org) {
      return org.id;
    }
  }
  return null;
}

function formatDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function itemDescription(
  data: PaymentSucceededData,
  subscription: SubscriptionWithPrice | null,
  periodStart: Date,
  periodEnd: Date | null,
): string {
  if (subscription) {
    const interval =
      subscription.planPrice.interval === 'YEAR' ? 'Yearly' : 'Monthly';
    const planName = subscription.planPrice.plan.name;
    if (periodEnd) {
      return `${planName} - ${interval} subscription (${formatDay(periodStart)} to ${formatDay(periodEnd)})`;
    }
    return `${planName} - ${interval} subscription`;
  }
  if (data.description) {
    return data.description;
  }
  return 'Subscription payment';
}

export const handlePaymentSucceeded: WebhookHandler = async (ctx) => {
  // All writes go through ctx.tx so they commit with PROCESSED, or not at all.
  const data = parsePaymentSucceededData(ctx.event.payload);
  await lockPaymentId(ctx.tx, data.paymentId);

  const subscription = await findSubscription(ctx.tx, data);
  const organizationId = await findOrganizationId(ctx.tx, data, subscription);
  if (!organizationId) {
    ctx.logger.warn(
      { eventId: ctx.event.id },
      'payment.succeeded for unknown organization',
    );
    return;
  }

  const existing = await ctx.tx.payment.findUnique({
    where: { providerPaymentId: data.paymentId },
  });
  if (
    existing?.status === PaymentStatus.SUCCEEDED &&
    existing.invoiceId
  ) {
    ctx.logger.info(
      { eventId: ctx.event.id },
      'duplicate payment.succeeded ignored',
    );
    return;
  }

  const issuedAt = paymentTime(ctx.event.payload, ctx.event.receivedAt);
  // Event period first, then the subscription's stored current period.
  // Do not compute a cycle. invoices.period_start is NOT NULL, so when both
  // are missing (typical while PENDING, before subscription.activated)
  // periodStart is the invoice issue time and periodEnd stays null.
  const periodStart =
    parseIsoDate(data.currentPeriodStart) ??
    parseIsoDate(data.periodStart) ??
    subscription?.currentPeriodStart ??
    issuedAt;
  const periodEnd =
    parseIsoDate(data.currentPeriodEnd) ??
    parseIsoDate(data.periodEnd) ??
    subscription?.currentPeriodEnd ??
    null;
  const currency =
    data.currency ?? subscription?.planPrice.currency ?? 'USD';
  const subscriptionId = subscription?.id ?? null;

  const number = await allocateInvoiceNumber(ctx.tx, organizationId);
  await paymentSucceededTestHooks.afterAllocate(ctx.tx);

  const invoice = await ctx.tx.invoice.create({
    data: {
      organizationId,
      subscriptionId,
      number,
      status: InvoiceStatus.PAID,
      subtotal: data.amount,
      total: data.amount,
      currency,
      periodStart,
      periodEnd,
      issuedAt,
      paidAt: issuedAt,
      providerInvoiceId: data.invoiceId ?? null,
    },
  });

  await ctx.tx.invoiceItem.create({
    data: {
      invoiceId: invoice.id,
      description: itemDescription(data, subscription, periodStart, periodEnd),
      quantity: 1,
      unitAmount: data.amount,
      amount: data.amount,
    },
  });

  const paymentFields = {
    organizationId,
    subscriptionId,
    invoiceId: invoice.id,
    status: PaymentStatus.SUCCEEDED,
    amount: data.amount,
    currency,
    failureCode: null,
    failureMessage: null,
    paymentMethodLabel: data.paymentMethodLabel ?? null,
  };

  if (existing) {
    await ctx.tx.payment.update({
      where: { id: existing.id },
      data: paymentFields,
    });
    return;
  }

  await ctx.tx.payment.create({
    data: {
      ...paymentFields,
      providerPaymentId: data.paymentId,
    },
  });
};

export function registerInvoiceHandlers(target: HandlerRegistry): void {
  target.register('payment.succeeded', handlePaymentSucceeded);
}

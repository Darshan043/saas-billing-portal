import {
  BillingInterval,
  InvoiceStatus,
  PaymentStatus,
  Prisma,
  SubscriptionStatus,
} from '@prisma/client';
import { AppError } from '../../lib/errors';
import { periodDates } from '../../lib/period';
import { prisma } from '../../lib/prisma';
import { rejectRawCredentials } from '../../lib/tokens';
import { createPayment } from '../payments/payments.service';
import { emitEvent } from '../webhooks/webhook.service';

export type SubscriptionMetadata = {
  subscriptionId: string;
  organizationId: string;
};

export async function getSubscription(id: string) {
  const subscription = await prisma.subscription.findUnique({ where: { id } });
  if (!subscription) {
    throw AppError.notFound(
      'SUBSCRIPTION_NOT_FOUND',
      'Simulated subscription not found',
    );
  }
  return subscription;
}

export async function createSubscription(input: {
  customerId: string;
  amount: number;
  currency: string;
  planPriceId?: string;
  token?: string;
  interval?: BillingInterval;
  metadata?: SubscriptionMetadata;
}) {
  rejectRawCredentials(input, 'body');
  const customer = await prisma.customer.findUnique({
    where: { id: input.customerId },
  });
  if (!customer) {
    throw AppError.notFound('CUSTOMER_NOT_FOUND', 'Simulated customer not found');
  }

  const interval = input.interval ?? BillingInterval.MONTH;
  const subscription = await prisma.subscription.create({
    data: {
      customerId: input.customerId,
      status: SubscriptionStatus.ACTIVE,
      amount: input.amount,
      currency: input.currency,
      planPriceId: input.planPriceId,
      interval,
      metadata: input.metadata
        ? (input.metadata as Prisma.InputJsonValue)
        : undefined,
    },
  });

  const createdData: Record<string, unknown> = {
    subscriptionId: subscription.id,
    customerId: subscription.customerId,
    amount: subscription.amount,
    currency: subscription.currency,
    planPriceId: subscription.planPriceId,
    status: 'active',
  };
  if (input.metadata) {
    createdData.metadata = input.metadata;
  }

  await emitEvent('subscription.created', subscription.id, createdData);

  if (input.token) {
    const payment = await createPayment({
      customerId: input.customerId,
      amount: input.amount,
      currency: input.currency,
      token: input.token,
      subscriptionId: subscription.id,
      metadata: input.metadata,
    });
    await prisma.invoice.update({
      where: { paymentId: payment.id },
      data: { subscriptionId: subscription.id },
    });
    if (payment.status === PaymentStatus.SUCCEEDED) {
      const { currentPeriodStart, currentPeriodEnd } = periodDates(interval);
      const activatedData: Record<string, unknown> = {
        subscriptionId: subscription.id,
        customerId: subscription.customerId,
        amount: subscription.amount,
        currency: subscription.currency,
        planPriceId: subscription.planPriceId,
        status: 'active',
        currentPeriodStart: currentPeriodStart.toISOString(),
        currentPeriodEnd: currentPeriodEnd.toISOString(),
      };
      if (input.metadata) {
        activatedData.metadata = input.metadata;
      }
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { currentPeriodStart, currentPeriodEnd },
      });
      await emitEvent(
        'subscription.activated',
        subscription.id,
        activatedData,
      );
    }
  } else {
    const invoice = await prisma.invoice.create({
      data: {
        customerId: input.customerId,
        subscriptionId: subscription.id,
        amount: input.amount,
        currency: input.currency,
        status: InvoiceStatus.OPEN,
      },
    });
    await emitEvent('invoice.created', invoice.id, {
      invoiceId: invoice.id,
      subscriptionId: subscription.id,
      paymentId: null,
      customerId: invoice.customerId,
      amount: invoice.amount,
      currency: invoice.currency,
      status: invoice.status.toLowerCase(),
    });
  }

  return subscription;
}

export async function updateSubscription(
  id: string,
  input: {
    amount?: number;
    currency?: string;
    planPriceId?: string | null;
  },
) {
  rejectRawCredentials(input, 'body');
  const current = await getSubscription(id);
  if (current.status === SubscriptionStatus.CANCELED) {
    throw AppError.badRequest(
      'SUBSCRIPTION_CANCELED',
      'Cannot update a canceled simulated subscription',
    );
  }

  const subscription = await prisma.subscription.update({
    where: { id },
    data: {
      amount: input.amount ?? current.amount,
      currency: input.currency ?? current.currency,
      planPriceId:
        input.planPriceId === undefined
          ? current.planPriceId
          : input.planPriceId,
    },
  });

  await emitEvent('subscription.updated', subscription.id, {
    subscriptionId: subscription.id,
    customerId: subscription.customerId,
    amount: subscription.amount,
    currency: subscription.currency,
    planPriceId: subscription.planPriceId,
    status: 'active',
  });
  return subscription;
}

export async function cancelSubscription(id: string) {
  const current = await getSubscription(id);
  if (current.status === SubscriptionStatus.CANCELED) {
    return current;
  }
  const subscription = await prisma.subscription.update({
    where: { id },
    data: {
      status: SubscriptionStatus.CANCELED,
      canceledAt: new Date(),
      cancelAtPeriodEnd: false,
      pausedAt: null,
    },
  });
  await emitEvent('subscription.cancelled', subscription.id, {
    subscriptionId: subscription.id,
    customerId: subscription.customerId,
    canceledAt: subscription.canceledAt?.toISOString() ?? null,
    status: 'canceled',
  });
  return subscription;
}

function eventMetadata(subscription: {
  metadata: Prisma.JsonValue | null;
}): Record<string, unknown> | undefined {
  if (
    subscription.metadata &&
    typeof subscription.metadata === 'object' &&
    !Array.isArray(subscription.metadata)
  ) {
    return subscription.metadata as Record<string, unknown>;
  }
  return undefined;
}

async function replayIfKnown(idempotencyKey: string | undefined) {
  if (!idempotencyKey) {
    return null;
  }
  const existing = await prisma.subscriptionOp.findUnique({
    where: { idempotencyKey },
  });
  if (!existing) {
    return null;
  }
  return getSubscription(existing.subscriptionId);
}

async function rememberOp(
  idempotencyKey: string | undefined,
  kind: string,
  subscriptionId: string,
): Promise<void> {
  if (!idempotencyKey) {
    return;
  }
  try {
    await prisma.subscriptionOp.create({
      data: { idempotencyKey, kind, subscriptionId },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      return;
    }
    throw err;
  }
}

function assertNotCanceled(
  subscription: { status: SubscriptionStatus },
  action: string,
): void {
  if (subscription.status === SubscriptionStatus.CANCELED) {
    throw AppError.badRequest(
      'SUBSCRIPTION_CANCELED',
      `Cannot ${action} a canceled simulated subscription`,
    );
  }
}

export async function changeSubscriptionPlan(
  id: string,
  input: {
    planPriceId: string;
    amount: number;
    currency: string;
    chargeAmount: number;
    token?: string;
    description?: string;
    metadata?: {
      subscriptionId: string;
      organizationId: string;
      reason?: string;
      description?: string;
      fromPlanPriceId?: string;
      toPlanPriceId?: string;
    };
  },
  idempotencyKey?: string,
) {
  rejectRawCredentials(input, 'body');
  const replayed = await replayIfKnown(idempotencyKey);
  if (replayed) {
    return replayed;
  }

  const current = await getSubscription(id);
  assertNotCanceled(current, 'change');

  let providerPaymentId: string | null = null;
  if (input.chargeAmount > 0) {
    const payment = await createPayment({
      customerId: current.customerId,
      amount: input.chargeAmount,
      currency: input.currency,
      token: input.token ?? 'tok_sim_visa_ok',
      idempotencyKey,
      subscriptionId: current.id,
      description: input.description,
      metadata: input.metadata,
    });
    if (payment.status !== PaymentStatus.SUCCEEDED) {
      throw AppError.badRequest(
        'PAYMENT_REJECTED',
        payment.errorCode === 'INSUFFICIENT_FUNDS'
          ? 'Insufficient funds'
          : 'Card declined',
      );
    }
    providerPaymentId = payment.id;
  }

  const metadata = input.metadata
    ? (input.metadata as Prisma.InputJsonValue)
    : current.metadata ?? undefined;
  const subscription = await prisma.subscription.update({
    where: { id },
    data: {
      amount: input.amount,
      currency: input.currency,
      planPriceId: input.planPriceId,
      metadata,
    },
  });

  const updatedData: Record<string, unknown> = {
    subscriptionId: subscription.id,
    customerId: subscription.customerId,
    amount: subscription.amount,
    currency: subscription.currency,
    planPriceId: subscription.planPriceId,
    status: 'active',
  };
  const echoed = input.metadata ?? eventMetadata(subscription);
  if (echoed) {
    updatedData.metadata = echoed;
  }
  if (providerPaymentId) {
    updatedData.paymentId = providerPaymentId;
  }
  await emitEvent('subscription.updated', subscription.id, updatedData);
  await rememberOp(idempotencyKey, 'change-plan', subscription.id);
  return subscription;
}

export async function setCancelAtPeriodEnd(
  id: string,
  value: boolean,
  idempotencyKey?: string,
) {
  const replayed = await replayIfKnown(idempotencyKey);
  if (replayed) {
    return replayed;
  }
  const current = await getSubscription(id);
  assertNotCanceled(current, 'schedule cancellation for');
  const subscription = await prisma.subscription.update({
    where: { id },
    data: { cancelAtPeriodEnd: value },
  });
  const data: Record<string, unknown> = {
    subscriptionId: subscription.id,
    customerId: subscription.customerId,
    amount: subscription.amount,
    currency: subscription.currency,
    planPriceId: subscription.planPriceId,
    status: 'active',
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
  };
  const echoed = eventMetadata(subscription);
  if (echoed) {
    data.metadata = echoed;
  }
  await emitEvent('subscription.updated', subscription.id, data);
  await rememberOp(idempotencyKey, 'cancel-at-period-end', subscription.id);
  return subscription;
}

export async function pauseSubscription(
  id: string,
  idempotencyKey?: string,
) {
  const replayed = await replayIfKnown(idempotencyKey);
  if (replayed) {
    return replayed;
  }
  const current = await getSubscription(id);
  assertNotCanceled(current, 'pause');
  const subscription = await prisma.subscription.update({
    where: { id },
    data: {
      status: SubscriptionStatus.PAUSED,
      pausedAt: current.pausedAt ?? new Date(),
    },
  });
  const data: Record<string, unknown> = {
    subscriptionId: subscription.id,
    customerId: subscription.customerId,
    amount: subscription.amount,
    currency: subscription.currency,
    planPriceId: subscription.planPriceId,
    status: 'paused',
    pausedAt: subscription.pausedAt?.toISOString() ?? null,
  };
  const echoed = eventMetadata(subscription);
  if (echoed) {
    data.metadata = echoed;
  }
  await emitEvent('subscription.updated', subscription.id, data);
  await rememberOp(idempotencyKey, 'pause', subscription.id);
  return subscription;
}

export async function resumeSubscription(
  id: string,
  input: { currentPeriodEnd?: string },
  idempotencyKey?: string,
) {
  const replayed = await replayIfKnown(idempotencyKey);
  if (replayed) {
    return replayed;
  }
  const current = await getSubscription(id);
  assertNotCanceled(current, 'resume');
  const periodEnd = input.currentPeriodEnd
    ? new Date(input.currentPeriodEnd)
    : current.currentPeriodEnd;
  const subscription = await prisma.subscription.update({
    where: { id },
    data: {
      status: SubscriptionStatus.ACTIVE,
      pausedAt: null,
      currentPeriodEnd: periodEnd,
    },
  });
  const data: Record<string, unknown> = {
    subscriptionId: subscription.id,
    customerId: subscription.customerId,
    amount: subscription.amount,
    currency: subscription.currency,
    planPriceId: subscription.planPriceId,
    status: 'active',
    currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
  };
  const echoed = eventMetadata(subscription);
  if (echoed) {
    data.metadata = echoed;
  }
  await emitEvent('subscription.updated', subscription.id, data);
  await rememberOp(idempotencyKey, 'resume', subscription.id);
  return subscription;
}

import { InvoiceStatus, SubscriptionStatus } from '@prisma/client';
import { AppError } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { rejectRawCredentials } from '../../lib/tokens';
import { createPayment } from '../payments/payments.service';
import { emitEvent } from '../webhooks/webhook.service';

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
}) {
  rejectRawCredentials(input, 'body');
  const customer = await prisma.customer.findUnique({
    where: { id: input.customerId },
  });
  if (!customer) {
    throw AppError.notFound('CUSTOMER_NOT_FOUND', 'Simulated customer not found');
  }

  const subscription = await prisma.subscription.create({
    data: {
      customerId: input.customerId,
      status: SubscriptionStatus.ACTIVE,
      amount: input.amount,
      currency: input.currency,
      planPriceId: input.planPriceId,
    },
  });

  await emitEvent('subscription.created', subscription.id, {
    subscriptionId: subscription.id,
    customerId: subscription.customerId,
    amount: subscription.amount,
    currency: subscription.currency,
    planPriceId: subscription.planPriceId,
    status: 'active',
  });

  if (input.token) {
    const payment = await createPayment({
      customerId: input.customerId,
      amount: input.amount,
      currency: input.currency,
      token: input.token,
    });
    await prisma.invoice.update({
      where: { paymentId: payment.id },
      data: { subscriptionId: subscription.id },
    });
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

import { prisma } from '../../lib/prisma';

export async function getOverview() {
  const [payments, subscriptions, invoices, events, customers] =
    await Promise.all([
      prisma.payment.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { customer: true },
      }),
      prisma.subscription.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { customer: true },
      }),
      prisma.invoice.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      prisma.webhookEvent.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          deliveries: { orderBy: { createdAt: 'desc' } },
        },
      }),
      prisma.customer.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

  return {
    notice: 'SIMULATOR — no real money',
    payments: payments.map((payment) => ({
      id: payment.id,
      customerId: payment.customerId,
      customerEmail: payment.customer.email,
      customerName: payment.customer.name,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status.toLowerCase(),
      errorCode: payment.errorCode,
      createdAt: payment.createdAt.toISOString(),
    })),
    subscriptions: subscriptions.map((subscription) => ({
      id: subscription.id,
      customerId: subscription.customerId,
      customerEmail: subscription.customer.email,
      status: subscription.status.toLowerCase(),
      amount: subscription.amount,
      currency: subscription.currency,
      planPriceId: subscription.planPriceId,
      canceledAt: subscription.canceledAt?.toISOString() ?? null,
      createdAt: subscription.createdAt.toISOString(),
    })),
    invoices: invoices.map((invoice) => ({
      id: invoice.id,
      customerId: invoice.customerId,
      subscriptionId: invoice.subscriptionId,
      paymentId: invoice.paymentId,
      amount: invoice.amount,
      currency: invoice.currency,
      status: invoice.status.toLowerCase(),
      createdAt: invoice.createdAt.toISOString(),
    })),
    events: events.map((event) => {
      const last = event.deliveries[0];
      return {
        id: event.id,
        type: event.type,
        objectId: event.objectId,
        status: event.status.toLowerCase(),
        attempts: event.attempts,
        deliveryCount: event.deliveries.length,
        lastError: event.lastError,
        createdAt: event.createdAt.toISOString(),
        lastDelivery: last
          ? {
              status: last.status.toLowerCase(),
              reason: last.reason.toLowerCase(),
              httpStatus: last.httpStatus,
              responseBody: last.responseBody,
              createdAt: last.createdAt.toISOString(),
            }
          : null,
      };
    }),
    customers: customers.map((customer) => ({
      id: customer.id,
      email: customer.email,
      name: customer.name,
      createdAt: customer.createdAt.toISOString(),
    })),
  };
}

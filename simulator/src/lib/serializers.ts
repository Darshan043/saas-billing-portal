import type {
  Customer,
  Invoice,
  Payment,
  PaymentMethod,
  PaymentStatus,
  Subscription,
  WebhookDelivery,
  WebhookEvent,
} from '@prisma/client';

const PAYMENT_STATUS: Record<PaymentStatus, string> = {
  SUCCEEDED: 'succeeded',
  DECLINED: 'declined',
  INSUFFICIENT_FUNDS: 'insufficient_funds',
};

export function serializeCustomer(
  customer: Customer & { paymentMethods?: PaymentMethod[] },
) {
  return {
    id: customer.id,
    email: customer.email,
    name: customer.name,
    createdAt: customer.createdAt.toISOString(),
    paymentMethods: (customer.paymentMethods ?? []).map(serializePaymentMethod),
  };
}

export function serializePaymentMethod(method: PaymentMethod) {
  return {
    id: method.id,
    customerId: method.customerId,
    tokenKind: method.tokenKind,
    label: method.label,
    createdAt: method.createdAt.toISOString(),
  };
}

export function serializePayment(payment: Payment) {
  return {
    id: payment.id,
    customerId: payment.customerId,
    paymentMethodId: payment.paymentMethodId,
    amount: payment.amount,
    currency: payment.currency,
    status: PAYMENT_STATUS[payment.status],
    errorCode: payment.errorCode,
    createdAt: payment.createdAt.toISOString(),
  };
}

export function serializeSubscription(subscription: Subscription) {
  return {
    id: subscription.id,
    customerId: subscription.customerId,
    status: subscription.status === 'ACTIVE' ? 'active' : 'canceled',
    amount: subscription.amount,
    currency: subscription.currency,
    planPriceId: subscription.planPriceId,
    interval: subscription.interval,
    metadata: subscription.metadata,
    canceledAt: subscription.canceledAt?.toISOString() ?? null,
    createdAt: subscription.createdAt.toISOString(),
    updatedAt: subscription.updatedAt.toISOString(),
  };
}

export function serializeInvoice(invoice: Invoice) {
  return {
    id: invoice.id,
    customerId: invoice.customerId,
    subscriptionId: invoice.subscriptionId,
    paymentId: invoice.paymentId,
    amount: invoice.amount,
    currency: invoice.currency,
    status: invoice.status.toLowerCase(),
    createdAt: invoice.createdAt.toISOString(),
  };
}

export function serializeWebhookEvent(
  event: WebhookEvent & { deliveries?: WebhookDelivery[] },
) {
  const deliveries = event.deliveries ?? [];
  const last = deliveries[0];
  return {
    id: event.id,
    type: event.type,
    objectId: event.objectId,
    status: event.status.toLowerCase(),
    attempts: event.attempts,
    nextRetryAt: event.nextRetryAt?.toISOString() ?? null,
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
    deliveryCount: deliveries.length,
  };
}

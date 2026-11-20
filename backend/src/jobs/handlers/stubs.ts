import type { WebhookHandler } from '../webhookProcessor';
import { registry, type HandlerRegistry } from './index';

// Exact strings the simulator emits (simulator/src/modules/webhooks/webhook.service.ts).
export const SIMULATOR_EVENT_TYPES = [
  'customer.created',
  'payment.succeeded',
  'payment.declined',
  'payment.insufficient_funds',
  'subscription.created',
  'subscription.activated',
  'subscription.updated',
  'subscription.cancelled',
  'invoice.created',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
] as const;

function stubHandler(type: string): WebhookHandler {
  return async ({ event, logger }) => {
    logger.info(
      { eventId: event.id, type },
      `stub handler for ${type}`,
    );
  };
}

export function registerStubHandlers(
  target: HandlerRegistry = registry,
): void {
  // TODO(Step 9): persist customer / provider customer id from customer.created
  target.register('customer.created', stubHandler('customer.created'));
  // Replaced in paymentSucceeded.ts (Step 10).
  target.register('payment.succeeded', stubHandler('payment.succeeded'));
  // TODO(Step 9): record a failed payment attempt
  target.register('payment.declined', stubHandler('payment.declined'));
  // TODO(Step 9): record an insufficient-funds payment attempt
  target.register(
    'payment.insufficient_funds',
    stubHandler('payment.insufficient_funds'),
  );
  // TODO(Step 11): create/activate the BillingHub subscription
  target.register(
    'subscription.created',
    stubHandler('subscription.created'),
  );
  target.register(
    'subscription.activated',
    stubHandler('subscription.activated'),
  );
  // TODO(Step 11): apply provider subscription updates
  target.register(
    'subscription.updated',
    stubHandler('subscription.updated'),
  );
  // TODO(Step 11): cancel the BillingHub subscription
  target.register(
    'subscription.cancelled',
    stubHandler('subscription.cancelled'),
  );
  // TODO(Step 10): persist the invoice
  target.register('invoice.created', stubHandler('invoice.created'));
  // TODO(Step 10): mark the invoice paid
  target.register(
    'invoice.payment_succeeded',
    stubHandler('invoice.payment_succeeded'),
  );
  // TODO(Step 10): mark the invoice payment failed
  target.register(
    'invoice.payment_failed',
    stubHandler('invoice.payment_failed'),
  );

  if (process.env.NODE_ENV !== 'production') {
    target.register('debug.ok', async ({ event, logger }) => {
      logger.info(
        { eventId: event.id, type: event.type },
        'stub handler for debug.ok',
      );
    });
    target.register('debug.fail', async () => {
      throw new Error('debug failure');
    });
  }
}

import {
  AuditSource,
  Prisma,
  SubscriptionStatus,
  type Subscription,
} from '@prisma/client';
import { recordAudit } from '../../modules/audit/audit.service';
import { assertTransition } from '../../modules/subscriptions/subscriptionRules';
import type { WebhookHandler } from '../webhookProcessor';
import type { HandlerRegistry } from './index';
import {
  asRecord,
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

function endedStatus(data: Record<string, unknown>): boolean {
  const status = stringField(data, 'status');
  return status === 'canceled' || status === 'cancelled';
}

export const handleSubscriptionUpdated: WebhookHandler = async (ctx) => {
  const data = eventData(ctx.event);
  const found = await findSubscription(ctx.tx, data);
  if (!found) {
    ctx.logger.warn(
      { eventId: ctx.event.id },
      'subscription.updated for unknown subscription',
    );
    return;
  }

  // Local plan, status, period, and flags are applied synchronously in
  // runSubscriptionOperation after the provider confirms. These events only
  // confirm that call. Differences are left for Step 18 reconciliation.
  const locked = await lockSubscription(ctx.tx, found.id);
  if (!locked) {
    return;
  }

  const providerSubscriptionId = stringField(data, 'subscriptionId');
  if (!locked.providerSubscriptionId && providerSubscriptionId) {
    await ctx.tx.subscription.update({
      where: { id: locked.id },
      data: { providerSubscriptionId },
    });
  }

  ctx.logger.info(
    { eventId: ctx.event.id, subscriptionId: locked.id },
    'confirmation received',
  );
};

export const handleSubscriptionCancelled: WebhookHandler = async (ctx) => {
  const data = eventData(ctx.event);
  if (!endedStatus(data)) {
    ctx.logger.info(
      { eventId: ctx.event.id },
      'subscription.cancelled ignored; provider did not end the subscription',
    );
    return;
  }

  const found = await findSubscription(ctx.tx, data);
  if (!found) {
    ctx.logger.warn(
      { eventId: ctx.event.id },
      'subscription.cancelled for unknown subscription',
    );
    return;
  }

  const locked = await lockSubscription(ctx.tx, found.id);
  if (!locked) {
    return;
  }

  if (locked.status === SubscriptionStatus.CANCELED) {
    return;
  }

  assertTransition(locked.status, SubscriptionStatus.CANCELED);
  const payload = asRecord(ctx.event.payload);
  const endedAt =
    parseIsoDate(data.canceledAt) ??
    parseIsoDate(payload.createdAt) ??
    new Date();

  const updated = await ctx.tx.subscription.update({
    where: { id: locked.id },
    data: {
      status: SubscriptionStatus.CANCELED,
      canceledAt: endedAt,
      endedAt,
      cancelAtPeriodEnd: false,
      pendingPlanPriceId: null,
    },
  });

  await recordAudit(ctx.tx, {
    subscriptionId: updated.id,
    organizationId: updated.organizationId,
    action: 'subscription.canceled',
    source: AuditSource.WEBHOOK,
    webhookEventId: ctx.event.id,
    beforeState: { status: locked.status },
    afterState: {
      status: updated.status,
      canceledAt: updated.canceledAt?.toISOString() ?? null,
      endedAt: updated.endedAt?.toISOString() ?? null,
    },
  });
};

export function registerSubscriptionChangeHandlers(
  target: HandlerRegistry,
): void {
  target.register('subscription.updated', handleSubscriptionUpdated);
  target.register('subscription.cancelled', handleSubscriptionCancelled);
}

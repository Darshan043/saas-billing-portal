import {
  AuditSource,
  Prisma,
  SubscriptionStatus,
  type Plan,
  type PlanPrice,
  type Subscription,
} from '@prisma/client';
import { now } from '../../lib/clock';
import { AppError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import {
  extendPeriodAfterPause,
  prorateUpgrade,
} from '../../lib/proration';
import {
  ProviderRejectedError,
  ProviderUnavailableError,
  getPaymentGateway,
} from '../../services/payment/paymentGateway';
import {
  dispatchSubscriptionCanceledEmail,
  dispatchSubscriptionPlanChangedEmail,
} from '../../services/email/emailDispatcher';
import { recordAudit } from '../audit/audit.service';
import {
  assertCanCancel,
  assertCanChangePlan,
  assertCanPause,
  assertCanResume,
  assertCanUndoCancel,
  assertCanUndoScheduledChange,
  assertTransition,
  classifyChange,
} from './subscriptionRules';
import { loadSubscriptionView, type SubscriptionView } from './subscriptions.service';

type LockedSubscription = Subscription & {
  planPrice: PlanPrice & { plan: Plan };
  pendingPlanPrice: (PlanPrice & { plan: Plan }) | null;
};

const withPrices = {
  planPrice: { include: { plan: true } },
  pendingPlanPrice: { include: { plan: true } },
} as const;

function mapProviderError(err: unknown): never {
  if (err instanceof ProviderRejectedError) {
    throw AppError.paymentRequired('PAYMENT_REJECTED', err.message);
  }
  if (err instanceof ProviderUnavailableError) {
    throw new AppError(502, 'PAYMENT_PROVIDER_UNAVAILABLE', err.message);
  }
  throw err;
}

function intervalLabel(interval: string): string {
  return interval === 'YEAR' ? 'Yearly' : 'Monthly';
}

function displayDate(value: Date): string {
  return value.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function requireProviderId(subscription: Subscription): string {
  if (!subscription.providerSubscriptionId) {
    throw new AppError(
      502,
      'PAYMENT_PROVIDER_UNAVAILABLE',
      'Provider subscription id is missing',
    );
  }
  return subscription.providerSubscriptionId;
}

async function lockCurrentSubscription(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<LockedSubscription> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM subscriptions
    WHERE organization_id = ${organizationId}::uuid
      AND status <> 'CANCELED'
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE
  `;
  const id = rows[0]?.id;
  if (!id) {
    throw AppError.notFound(
      'NO_ACTIVE_SUBSCRIPTION',
      'No active subscription',
    );
  }
  return tx.subscription.findUniqueOrThrow({
    where: { id },
    include: withPrices,
  });
}

type OperationFn<T> = (
  tx: Prisma.TransactionClient,
  locked: LockedSubscription,
  markProviderDone: () => void,
) => Promise<T>;

async function runSubscriptionOperation<T>(
  organizationId: string,
  operation: string,
  fn: OperationFn<T>,
): Promise<T> {
  let providerSucceeded = false;
  let subscriptionId: string | undefined;
  try {
    // Row lock is held across the provider call so a second request waits
    // and cannot start another charge or diverge local vs provider state.
    return await prisma.$transaction(
      async (tx) => {
        const locked = await lockCurrentSubscription(tx, organizationId);
        subscriptionId = locked.id;
        return fn(tx, locked, () => {
          providerSucceeded = true;
        });
      },
      { timeout: 20_000 },
    );
  } catch (err) {
    if (providerSucceeded) {
      logger.error(
        { subscriptionId, operation },
        'provider succeeded but local commit failed',
      );
      throw new AppError(
        500,
        'INTERNAL_ERROR',
        'The provider confirmed the change but it could not be saved',
      );
    }
    if (
      err instanceof ProviderRejectedError ||
      err instanceof ProviderUnavailableError
    ) {
      mapProviderError(err);
    }
    throw err;
  }
}

async function loadTargetPrice(planPriceId: string) {
  const target = await prisma.planPrice.findUnique({
    where: { id: planPriceId },
    include: { plan: true },
  });
  if (!target || !target.isActive || !target.plan.isActive) {
    throw AppError.notFound(
      'PLAN_NOT_AVAILABLE',
      'This plan is not available',
    );
  }
  return target;
}

function requirePeriod(subscription: Subscription): {
  periodStart: Date;
  periodEnd: Date;
} {
  if (!subscription.currentPeriodStart || !subscription.currentPeriodEnd) {
    throw AppError.conflict(
      'INVALID_STATE_TRANSITION',
      'Subscription period is missing',
    );
  }
  return {
    periodStart: subscription.currentPeriodStart,
    periodEnd: subscription.currentPeriodEnd,
  };
}

function upgradeDescription(
  fromName: string,
  toName: string,
  interval: string,
  periodStart: Date,
  periodEnd: Date,
): string {
  const text = `Upgrade from ${fromName} to ${toName} (${intervalLabel(interval)}): prorated charge for ${displayDate(periodStart)} to ${displayDate(periodEnd)}`;
  return text.slice(0, 200);
}

export async function previewPlanChange(
  organizationId: string,
  planPriceId: string,
): Promise<{
  kind: 'UPGRADE' | 'DOWNGRADE';
  current: {
    planName: string;
    interval: string;
    amount: number;
    currency: string;
    usageLimit: number;
  };
  target: {
    planName: string;
    interval: string;
    amount: number;
    currency: string;
    usageLimit: number;
  };
  effectiveAt: string;
  proration: {
    chargeAmount: number;
    creditAmount: number;
    newPeriodAmount: number;
    remainingDays: number;
    currency: string;
  } | null;
}> {
  const current = await prisma.subscription.findFirst({
    where: {
      organizationId,
      status: { not: SubscriptionStatus.CANCELED },
    },
    orderBy: { createdAt: 'desc' },
    include: withPrices,
  });
  if (!current) {
    throw AppError.notFound(
      'NO_ACTIVE_SUBSCRIPTION',
      'No active subscription',
    );
  }
  assertCanChangePlan(current);
  const target = await loadTargetPrice(planPriceId);
  const kind = classifyChange(current.planPrice, target);
  const clock = now();
  if (kind === 'UPGRADE') {
    const { periodStart, periodEnd } = requirePeriod(current);
    const proration = prorateUpgrade({
      oldAmount: current.planPrice.amount,
      newAmount: target.amount,
      periodStart,
      periodEnd,
      now: clock,
    });
    return {
      kind,
      current: {
        planName: current.planPrice.plan.name,
        interval: current.planPrice.interval,
        amount: current.planPrice.amount,
        currency: current.planPrice.currency,
        usageLimit: current.planPrice.plan.usageLimit,
      },
      target: {
        planName: target.plan.name,
        interval: target.interval,
        amount: target.amount,
        currency: target.currency,
        usageLimit: target.plan.usageLimit,
      },
      effectiveAt: clock.toISOString(),
      proration: {
        chargeAmount: proration.chargeAmount,
        creditAmount: proration.creditAmount,
        newPeriodAmount: proration.newPeriodAmount,
        remainingDays: proration.remainingDays,
        currency: current.planPrice.currency,
      },
    };
  }
  return {
    kind,
    current: {
      planName: current.planPrice.plan.name,
      interval: current.planPrice.interval,
      amount: current.planPrice.amount,
      currency: current.planPrice.currency,
      usageLimit: current.planPrice.plan.usageLimit,
    },
    target: {
      planName: target.plan.name,
      interval: target.interval,
      amount: target.amount,
      currency: target.currency,
      usageLimit: target.plan.usageLimit,
    },
    effectiveAt: current.currentPeriodEnd?.toISOString() ?? clock.toISOString(),
    proration: null,
  };
}

export async function changePlan(
  actorUserId: string,
  organizationId: string,
  planPriceId: string,
): Promise<{
  kind: 'UPGRADE' | 'DOWNGRADE';
  chargeAmount?: number;
  currency?: string;
  effectiveAt?: string;
  subscription: SubscriptionView;
}> {
  const result = await runSubscriptionOperation(organizationId, 'change-plan', async (tx, locked, markDone) => {
    assertCanChangePlan(locked);
    const target = await tx.planPrice.findUnique({
      where: { id: planPriceId },
      include: { plan: true },
    });
    if (!target || !target.isActive || !target.plan.isActive) {
      throw AppError.notFound(
        'PLAN_NOT_AVAILABLE',
        'This plan is not available',
      );
    }
    const kind = classifyChange(locked.planPrice, target);
    if (kind === 'DOWNGRADE') {
      if (locked.pendingPlanPriceId === target.id) {
        throw AppError.badRequest('NO_CHANGE', 'Already on this plan');
      }
      const updated = await tx.subscription.update({
        where: { id: locked.id },
        data: { pendingPlanPriceId: target.id },
        include: withPrices,
      });
      await recordAudit(tx, {
        subscriptionId: updated.id,
        organizationId,
        action: 'subscription.downgrade_scheduled',
        source: AuditSource.CUSTOMER,
        actorUserId,
        beforeState: {
          pendingPlanPriceId: locked.pendingPlanPriceId,
          planPriceId: locked.planPriceId,
        },
        afterState: {
          pendingPlanPriceId: updated.pendingPlanPriceId,
          planPriceId: updated.planPriceId,
          effectiveAt: updated.currentPeriodEnd?.toISOString() ?? null,
        },
      });
      return {
        kind,
        effectiveAt: updated.currentPeriodEnd?.toISOString() ?? now().toISOString(),
        subscription: await loadSubscriptionView(updated),
      };
    }

    const { periodStart, periodEnd } = requirePeriod(locked);
    const clock = now();
    const proration = prorateUpgrade({
      oldAmount: locked.planPrice.amount,
      newAmount: target.amount,
      periodStart,
      periodEnd,
      now: clock,
    });
    const description = upgradeDescription(
      locked.planPrice.plan.name,
      target.plan.name,
      locked.planPrice.interval,
      periodStart,
      periodEnd,
    );
    const idempotencyKey = `sub-upgrade-${locked.id}-${target.id}-${Math.floor(periodEnd.getTime() / 1000)}`;
    // Provider call stays inside the row lock so a parallel request waits
    // and cannot start a second charge for the same period.
    await getPaymentGateway().changeSubscriptionPlan({
      providerSubscriptionId: requireProviderId(locked),
      planPriceId: target.id,
      amount: target.amount,
      currency: target.currency,
      chargeAmount: proration.chargeAmount,
      idempotencyKey,
      description,
      metadata: {
        subscriptionId: locked.id,
        organizationId,
        reason: 'plan_upgrade',
        description,
        fromPlanPriceId: locked.planPriceId,
        toPlanPriceId: target.id,
      },
    });
    markDone();
    const updated = await tx.subscription.update({
      where: { id: locked.id },
      data: {
        planPriceId: target.id,
        pendingPlanPriceId: null,
      },
      include: withPrices,
    });
    await recordAudit(tx, {
      subscriptionId: updated.id,
      organizationId,
      action: 'subscription.upgraded',
      source: AuditSource.CUSTOMER,
      actorUserId,
      beforeState: {
        planPriceId: locked.planPriceId,
        planName: locked.planPrice.plan.name,
        pendingPlanPriceId: locked.pendingPlanPriceId,
      },
      afterState: {
        planPriceId: updated.planPriceId,
        planName: updated.planPrice.plan.name,
        pendingPlanPriceId: null,
        chargeAmount: proration.chargeAmount,
        currency: target.currency,
      },
    });
    return {
      kind,
      chargeAmount: proration.chargeAmount,
      currency: target.currency,
      subscription: await loadSubscriptionView(updated),
    };
  });

  try {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, billingEmail: true },
    });
    if (org?.billingEmail) {
      await dispatchSubscriptionPlanChangedEmail({
        organizationId,
        recipient: org.billingEmail,
        organizationName: org.name,
        subscriptionId: result.subscription.id,
        kind: result.kind,
        planName: result.subscription.planName,
        interval: result.subscription.interval,
        effectiveAt: result.effectiveAt,
        chargeAmount: result.chargeAmount,
        currency: result.currency,
      });
    }
  } catch (notifyErr) {
    logger.error(
      { err: notifyErr, organizationId },
      'failed to dispatch plan change notification',
    );
  }

  return result;
}

export async function undoScheduledChange(
  actorUserId: string,
  organizationId: string,
): Promise<{ subscription: SubscriptionView }> {
  return runSubscriptionOperation(organizationId, 'undo-scheduled-change', async (tx, locked) => {
    assertCanUndoScheduledChange(locked);
    const updated = await tx.subscription.update({
      where: { id: locked.id },
      data: { pendingPlanPriceId: null },
      include: withPrices,
    });
    await recordAudit(tx, {
      subscriptionId: updated.id,
      organizationId,
      action: 'subscription.scheduled_change_canceled',
      source: AuditSource.CUSTOMER,
      actorUserId,
      beforeState: { pendingPlanPriceId: locked.pendingPlanPriceId },
      afterState: { pendingPlanPriceId: null },
    });
    return { subscription: await loadSubscriptionView(updated) };
  });
}

export async function pauseSubscription(
  actorUserId: string,
  organizationId: string,
): Promise<{ subscription: SubscriptionView }> {
  return runSubscriptionOperation(organizationId, 'pause', async (tx, locked, markDone) => {
    assertCanPause(locked);
    assertTransition(locked.status, SubscriptionStatus.PAUSED);
    await getPaymentGateway().pauseSubscription({
      providerSubscriptionId: requireProviderId(locked),
      idempotencyKey: crypto.randomUUID(),
    });
    markDone();
    const pausedAt = now();
    const updated = await tx.subscription.update({
      where: { id: locked.id },
      data: { status: SubscriptionStatus.PAUSED, pausedAt },
      include: withPrices,
    });
    await recordAudit(tx, {
      subscriptionId: updated.id,
      organizationId,
      action: 'subscription.paused',
      source: AuditSource.CUSTOMER,
      actorUserId,
      beforeState: { status: locked.status, pausedAt: null },
      afterState: {
        status: updated.status,
        pausedAt: updated.pausedAt?.toISOString() ?? null,
      },
    });
    return { subscription: await loadSubscriptionView(updated) };
  });
}

export async function resumeSubscription(
  actorUserId: string,
  organizationId: string,
): Promise<{ subscription: SubscriptionView }> {
  return runSubscriptionOperation(organizationId, 'resume', async (tx, locked, markDone) => {
    assertCanResume(locked);
    assertTransition(locked.status, SubscriptionStatus.ACTIVE);
    if (!locked.pausedAt || !locked.currentPeriodEnd) {
      throw AppError.conflict(
        'INVALID_STATE_TRANSITION',
        'Paused subscription is missing period dates',
      );
    }
    const resumedAt = now();
    const computedEnd = extendPeriodAfterPause({
      currentPeriodEnd: locked.currentPeriodEnd,
      pausedAt: locked.pausedAt,
      resumedAt,
    });
    const provider = await getPaymentGateway().resumeSubscription({
      providerSubscriptionId: requireProviderId(locked),
      idempotencyKey: crypto.randomUUID(),
      newPeriodEnd: computedEnd,
    });
    markDone();
    let periodEnd = computedEnd;
    if (
      provider.currentPeriodEnd &&
      provider.currentPeriodEnd !== computedEnd.toISOString()
    ) {
      logger.warn(
        { subscriptionId: locked.id },
        'simulator resume period end differed from computed value',
      );
      periodEnd = new Date(provider.currentPeriodEnd);
    }
    const updated = await tx.subscription.update({
      where: { id: locked.id },
      data: {
        status: SubscriptionStatus.ACTIVE,
        pausedAt: null,
        currentPeriodEnd: periodEnd,
      },
      include: withPrices,
    });
    await recordAudit(tx, {
      subscriptionId: updated.id,
      organizationId,
      action: 'subscription.resumed',
      source: AuditSource.CUSTOMER,
      actorUserId,
      beforeState: {
        status: locked.status,
        currentPeriodEnd: locked.currentPeriodEnd.toISOString(),
      },
      afterState: {
        status: updated.status,
        currentPeriodEnd: updated.currentPeriodEnd?.toISOString() ?? null,
      },
    });
    return { subscription: await loadSubscriptionView(updated) };
  });
}

export async function cancelSubscription(
  actorUserId: string,
  organizationId: string,
  when: 'IMMEDIATELY' | 'AT_PERIOD_END',
): Promise<{ subscription: SubscriptionView }> {
  const result = await runSubscriptionOperation(organizationId, 'cancel', async (tx, locked, markDone) => {
    assertCanCancel(locked, when);
    if (when === 'AT_PERIOD_END') {
      await getPaymentGateway().setCancelAtPeriodEnd({
        providerSubscriptionId: requireProviderId(locked),
        value: true,
        idempotencyKey: crypto.randomUUID(),
      });
      markDone();
      const updated = await tx.subscription.update({
        where: { id: locked.id },
        data: { cancelAtPeriodEnd: true, pendingPlanPriceId: null },
        include: withPrices,
      });
      await recordAudit(tx, {
        subscriptionId: updated.id,
        organizationId,
        action: 'subscription.cancel_scheduled',
        source: AuditSource.CUSTOMER,
        actorUserId,
        beforeState: {
          cancelAtPeriodEnd: locked.cancelAtPeriodEnd,
          pendingPlanPriceId: locked.pendingPlanPriceId,
        },
        afterState: {
          cancelAtPeriodEnd: true,
          pendingPlanPriceId: null,
          effectiveAt: updated.currentPeriodEnd?.toISOString() ?? null,
        },
      });
      return { subscription: await loadSubscriptionView(updated) };
    }

    assertTransition(locked.status, SubscriptionStatus.CANCELED);
    await getPaymentGateway().cancelSubscriptionNow({
      providerSubscriptionId: requireProviderId(locked),
      idempotencyKey: crypto.randomUUID(),
    });
    markDone();
    const ended = now();
    const updated = await tx.subscription.update({
      where: { id: locked.id },
      data: {
        status: SubscriptionStatus.CANCELED,
        canceledAt: ended,
        endedAt: ended,
        cancelAtPeriodEnd: false,
        pendingPlanPriceId: null,
      },
      include: withPrices,
    });
    await recordAudit(tx, {
      subscriptionId: updated.id,
      organizationId,
      action: 'subscription.canceled',
      source: AuditSource.CUSTOMER,
      actorUserId,
      beforeState: { status: locked.status },
      afterState: {
        status: updated.status,
        canceledAt: updated.canceledAt?.toISOString() ?? null,
        endedAt: updated.endedAt?.toISOString() ?? null,
      },
    });
    return { subscription: await loadSubscriptionView(updated) };
  });

  try {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, billingEmail: true },
    });
    if (org?.billingEmail) {
      await dispatchSubscriptionCanceledEmail({
        organizationId,
        recipient: org.billingEmail,
        organizationName: org.name,
        subscriptionId: result.subscription.id,
        planName: result.subscription.planName,
        when,
        effectiveAt:
          when === 'AT_PERIOD_END'
            ? result.subscription.currentPeriodEnd ?? undefined
            : undefined,
      });
    }
  } catch (notifyErr) {
    logger.error(
      { err: notifyErr, organizationId },
      'failed to dispatch subscription cancellation notification',
    );
  }

  return result;
}

export async function undoCancel(
  actorUserId: string,
  organizationId: string,
): Promise<{ subscription: SubscriptionView }> {
  return runSubscriptionOperation(organizationId, 'undo-cancel', async (tx, locked, markDone) => {
    assertCanUndoCancel(locked);
    await getPaymentGateway().setCancelAtPeriodEnd({
      providerSubscriptionId: requireProviderId(locked),
      value: false,
      idempotencyKey: crypto.randomUUID(),
    });
    markDone();
    const updated = await tx.subscription.update({
      where: { id: locked.id },
      data: { cancelAtPeriodEnd: false },
      include: withPrices,
    });
    await recordAudit(tx, {
      subscriptionId: updated.id,
      organizationId,
      action: 'subscription.cancel_undone',
      source: AuditSource.CUSTOMER,
      actorUserId,
      beforeState: { cancelAtPeriodEnd: true },
      afterState: { cancelAtPeriodEnd: false },
    });
    return { subscription: await loadSubscriptionView(updated) };
  });
}

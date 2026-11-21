import {
  AuditSource,
  Prisma,
  SubscriptionStatus,
  type BillingInterval,
  type Subscription,
} from '@prisma/client';
import { env } from '../../config/env';
import { AppError } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import {
  ProviderRejectedError,
  ProviderUnavailableError,
  getPaymentGateway,
} from '../../services/payment/paymentGateway';
import { recordAudit } from '../audit/audit.service';
import { capabilities } from './subscriptionRules';
import {
  SIMULATOR_PAYMENT_TOKENS,
  type CreateSubscriptionInput,
} from './subscriptions.schemas';

const ALLOWED_TOKENS = new Set<string>(SIMULATOR_PAYMENT_TOKENS);

export type SubscriptionCapabilities = {
  canChangePlan: boolean;
  canPause: boolean;
  canResume: boolean;
  canCancelNow: boolean;
  canCancelAtPeriodEnd: boolean;
  canUndoCancel: boolean;
  canUndoScheduledChange: boolean;
};

export type PendingChangeView = {
  planPriceId: string;
  planName: string;
  amount: number;
  currency: string;
  effectiveAt: string | null;
};

export type SubscriptionView = {
  id: string;
  status: SubscriptionStatus;
  planName: string;
  planId: string;
  planPriceId: string;
  interval: BillingInterval;
  amount: number;
  currency: string;
  usageLimit: number;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  pausedAt: string | null;
  canceledAt: string | null;
  endedAt: string | null;
  pendingChange: PendingChangeView | null;
  capabilities: SubscriptionCapabilities;
  createdAt: string;
  failureReason: string | null;
};

type SubscriptionWithPrice = Subscription & {
  planPrice: {
    id: string;
    planId: string;
    interval: BillingInterval;
    amount: number;
    currency: string;
    plan: { id: string; name: string; usageLimit: number };
  };
  pendingPlanPrice?: {
    id: string;
    amount: number;
    currency: string;
    plan: { name: string };
  } | null;
};

function isUniqueConstraint(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
  );
}

function assertPaymentToken(token: string): void {
  if (!ALLOWED_TOKENS.has(token)) {
    throw AppError.badRequest(
      'INVALID_PAYMENT_TOKEN',
      'Use a simulator test token',
    );
  }
}

function pendingTimeoutMs(): number {
  return env.SUBSCRIPTION_PENDING_TIMEOUT_MINUTES * 60 * 1000;
}

function snapshot(sub: {
  status: SubscriptionStatus;
  planPriceId: string;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  reason?: string;
}) {
  return {
    status: sub.status,
    planPriceId: sub.planPriceId,
    currentPeriodStart: sub.currentPeriodStart?.toISOString() ?? null,
    currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
    ...(sub.reason ? { reason: sub.reason } : {}),
  };
}

export async function loadSubscriptionView(
  subscription: SubscriptionWithPrice,
): Promise<SubscriptionView> {
  let failureReason: string | null = null;
  if (subscription.status === SubscriptionStatus.CANCELED) {
    const audit = await prisma.auditLog.findFirst({
      where: {
        subscriptionId: subscription.id,
        action: {
          in: ['subscription.payment_failed', 'subscription.checkout_canceled'],
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    const after = audit?.afterState;
    if (after && typeof after === 'object' && !Array.isArray(after)) {
      const reason = (after as { reason?: unknown }).reason;
      failureReason = typeof reason === 'string' ? reason : null;
    }
  }

  const pending = subscription.pendingPlanPrice ?? null;

  return {
    id: subscription.id,
    status: subscription.status,
    planName: subscription.planPrice.plan.name,
    planId: subscription.planPrice.plan.id,
    planPriceId: subscription.planPriceId,
    interval: subscription.planPrice.interval,
    amount: subscription.planPrice.amount,
    currency: subscription.planPrice.currency,
    usageLimit: subscription.planPrice.plan.usageLimit,
    currentPeriodStart: subscription.currentPeriodStart?.toISOString() ?? null,
    currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    pausedAt: subscription.pausedAt?.toISOString() ?? null,
    canceledAt: subscription.canceledAt?.toISOString() ?? null,
    endedAt: subscription.endedAt?.toISOString() ?? null,
    pendingChange: pending
      ? {
          planPriceId: pending.id,
          planName: pending.plan.name,
          amount: pending.amount,
          currency: pending.currency,
          effectiveAt: subscription.currentPeriodEnd?.toISOString() ?? null,
        }
      : null,
    capabilities: capabilities(subscription),
    createdAt: subscription.createdAt.toISOString(),
    failureReason,
  };
}

const withPrices = {
  planPrice: { include: { plan: true } },
  pendingPlanPrice: { include: { plan: true } },
} as const;

async function cancelPending(
  subscription: Subscription,
  reason: string,
  source: AuditSource,
  actorUserId?: string,
): Promise<void> {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const updated = await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        status: SubscriptionStatus.CANCELED,
        canceledAt: now,
        endedAt: now,
      },
    });
    await recordAudit(tx, {
      subscriptionId: updated.id,
      organizationId: updated.organizationId,
      action: 'subscription.checkout_canceled',
      source,
      actorUserId,
      beforeState: snapshot(subscription),
      afterState: snapshot({ ...updated, reason }),
    });
  });
}

async function conflictingNonCanceled(organizationId: string) {
  return prisma.subscription.findFirst({
    where: {
      organizationId,
      status: { not: SubscriptionStatus.CANCELED },
    },
    orderBy: { createdAt: 'desc' },
  });
}

function conflictFromExisting(existing: Subscription): never {
  if (existing.status === SubscriptionStatus.PENDING) {
    throw AppError.conflict(
      'SUBSCRIPTION_PENDING',
      'A payment is already being processed',
    );
  }
  throw AppError.conflict(
    'SUBSCRIPTION_ALREADY_EXISTS',
    'This organization already has a subscription',
  );
}

async function ensureNoBlockingSubscription(
  organizationId: string,
): Promise<void> {
  const existing = await conflictingNonCanceled(organizationId);
  if (!existing) {
    return;
  }

  if (existing.status === SubscriptionStatus.PENDING) {
    const ageMs = Date.now() - existing.createdAt.getTime();
    if (ageMs > pendingTimeoutMs()) {
      await cancelPending(
        existing,
        'pending timeout',
        AuditSource.SYSTEM,
      );
      return;
    }
    throw AppError.conflict(
      'SUBSCRIPTION_PENDING',
      'A payment is already being processed',
    );
  }

  throw AppError.conflict(
    'SUBSCRIPTION_ALREADY_EXISTS',
    'This organization already has a subscription',
  );
}

async function ensureProviderCustomer(organizationId: string): Promise<string> {
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
  });
  if (organization.providerCustomerId) {
    return organization.providerCustomerId;
  }

  const created = await getPaymentGateway().createCustomer({
    organizationId: organization.id,
    name: organization.name,
    email: organization.billingEmail,
    idempotencyKey: `customer-create-${organization.id}`,
  });

  await prisma.organization.updateMany({
    where: { id: organization.id, providerCustomerId: null },
    data: { providerCustomerId: created.id },
  });
  const latest = await prisma.organization.findUniqueOrThrow({
    where: { id: organization.id },
  });
  if (!latest.providerCustomerId) {
    throw new ProviderUnavailableError('Provider customer id was not saved');
  }
  return latest.providerCustomerId;
}

export async function createCheckout(
  actorUserId: string,
  organizationId: string,
  input: CreateSubscriptionInput,
): Promise<SubscriptionView> {
  assertPaymentToken(input.paymentToken);

  const planPrice = await prisma.planPrice.findUnique({
    where: { id: input.planPriceId },
    include: { plan: true },
  });
  if (!planPrice || !planPrice.isActive || !planPrice.plan.isActive) {
    throw AppError.notFound(
      'PLAN_NOT_AVAILABLE',
      'This plan is not available',
    );
  }

  await ensureNoBlockingSubscription(organizationId);

  // Commit PENDING locally before the provider call so a fast webhook can
  // already find the row. This request never sets ACTIVE.
  let pending: Subscription;
  try {
    pending = await prisma.$transaction(async (tx) => {
      const created = await tx.subscription.create({
        data: {
          organizationId,
          planPriceId: planPrice.id,
          status: SubscriptionStatus.PENDING,
        },
      });
      await recordAudit(tx, {
        subscriptionId: created.id,
        organizationId,
        action: 'subscription.created',
        source: AuditSource.CUSTOMER,
        actorUserId,
        beforeState: null,
        afterState: snapshot(created),
      });
      return created;
    });
  } catch (err) {
    if (isUniqueConstraint(err)) {
      const existing = await conflictingNonCanceled(organizationId);
      if (existing) {
        conflictFromExisting(existing);
      }
    }
    throw err;
  }

  try {
    const providerCustomerId = await ensureProviderCustomer(organizationId);
    const provider = await getPaymentGateway().createSubscription({
      providerCustomerId,
      amount: planPrice.amount,
      currency: planPrice.currency,
      interval: planPrice.interval,
      planName: planPrice.plan.name,
      planPriceId: planPrice.id,
      paymentToken: input.paymentToken,
      idempotencyKey: `sub-create-${pending.id}`,
      metadata: {
        subscriptionId: pending.id,
        organizationId,
      },
    });

    await prisma.subscription.updateMany({
      where: { id: pending.id, status: SubscriptionStatus.PENDING },
      data: { providerSubscriptionId: provider.id },
    });
  } catch (err) {
    if (err instanceof ProviderRejectedError) {
      await cancelPending(
        pending,
        err.message,
        AuditSource.CUSTOMER,
        actorUserId,
      );
      throw AppError.paymentRequired('PAYMENT_REJECTED', err.message);
    }
    const message =
      err instanceof ProviderUnavailableError
        ? err.message
        : 'provider unavailable';
    await cancelPending(
      pending,
      'provider unavailable',
      AuditSource.CUSTOMER,
      actorUserId,
    );
    throw new AppError(502, 'PAYMENT_PROVIDER_UNAVAILABLE', message);
  }

  const current = await prisma.subscription.findUniqueOrThrow({
    where: { id: pending.id },
    include: withPrices,
  });
  return loadSubscriptionView(current);
}

export async function getCurrentSubscription(
  organizationId: string,
): Promise<SubscriptionView | null> {
  const subscription = await prisma.subscription.findFirst({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
    include: withPrices,
  });
  if (!subscription) {
    return null;
  }
  return loadSubscriptionView(subscription);
}

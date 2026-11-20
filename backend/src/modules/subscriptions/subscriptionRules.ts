import {
  SubscriptionStatus,
  type Plan,
  type PlanPrice,
} from '@prisma/client';
import { AppError } from '../../lib/errors';

export type ChangeKind = 'UPGRADE' | 'DOWNGRADE';

const ALLOWED: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  PENDING: [SubscriptionStatus.ACTIVE, SubscriptionStatus.CANCELED],
  ACTIVE: [
    SubscriptionStatus.PAUSED,
    SubscriptionStatus.PAST_DUE,
    SubscriptionStatus.CANCELED,
  ],
  PAST_DUE: [SubscriptionStatus.ACTIVE, SubscriptionStatus.CANCELED],
  PAUSED: [SubscriptionStatus.ACTIVE, SubscriptionStatus.CANCELED],
  CANCELED: [],
};

export function assertTransition(
  from: SubscriptionStatus,
  to: SubscriptionStatus,
): void {
  if (from === to) {
    return;
  }
  if (!ALLOWED[from].includes(to)) {
    throw AppError.conflict(
      'INVALID_STATE_TRANSITION',
      `Cannot move a subscription from ${from} to ${to}`,
    );
  }
}

type GuardSub = {
  status: SubscriptionStatus;
  cancelAtPeriodEnd: boolean;
  pendingPlanPriceId: string | null;
};

function assertNotPending(subscription: GuardSub): void {
  if (subscription.status === SubscriptionStatus.PENDING) {
    throw AppError.conflict(
      'SUBSCRIPTION_PENDING',
      'A payment is already being processed',
    );
  }
}

export function assertCanChangePlan(subscription: GuardSub): void {
  assertNotPending(subscription);
  if (subscription.status === SubscriptionStatus.PAUSED) {
    throw AppError.conflict(
      'SUBSCRIPTION_PAUSED',
      'Resume your subscription first',
    );
  }
  if (subscription.status === SubscriptionStatus.PAST_DUE) {
    throw AppError.conflict(
      'PAYMENT_REQUIRED',
      'Fix your payment first',
    );
  }
  if (subscription.status !== SubscriptionStatus.ACTIVE) {
    throw AppError.conflict(
      'INVALID_STATE_TRANSITION',
      'Only an active subscription can change plan',
    );
  }
  if (subscription.cancelAtPeriodEnd) {
    throw AppError.conflict(
      'CANCELLATION_SCHEDULED',
      'Undo the scheduled cancellation first',
    );
  }
}

export function assertCanPause(subscription: GuardSub): void {
  assertNotPending(subscription);
  if (subscription.status !== SubscriptionStatus.ACTIVE) {
    throw AppError.conflict(
      'INVALID_STATE_TRANSITION',
      'Only an active subscription can be paused',
    );
  }
  if (subscription.cancelAtPeriodEnd) {
    throw AppError.conflict(
      'CANCELLATION_SCHEDULED',
      'Undo the scheduled cancellation first',
    );
  }
}

export function assertCanResume(subscription: GuardSub): void {
  assertNotPending(subscription);
  if (subscription.status !== SubscriptionStatus.PAUSED) {
    throw AppError.conflict(
      'INVALID_STATE_TRANSITION',
      'Only a paused subscription can be resumed',
    );
  }
}

export function assertCanCancel(
  subscription: GuardSub,
  when: 'IMMEDIATELY' | 'AT_PERIOD_END',
): void {
  assertNotPending(subscription);
  if (when === 'AT_PERIOD_END') {
    if (subscription.status !== SubscriptionStatus.ACTIVE) {
      throw AppError.conflict(
        'INVALID_STATE_TRANSITION',
        'Pause or payment issues must be canceled immediately instead',
      );
    }
    return;
  }
  if (
    subscription.status !== SubscriptionStatus.ACTIVE &&
    subscription.status !== SubscriptionStatus.PAST_DUE &&
    subscription.status !== SubscriptionStatus.PAUSED
  ) {
    throw AppError.conflict(
      'INVALID_STATE_TRANSITION',
      'This subscription cannot be canceled now',
    );
  }
}

export function assertCanUndoCancel(subscription: GuardSub): void {
  if (
    subscription.status !== SubscriptionStatus.ACTIVE ||
    !subscription.cancelAtPeriodEnd
  ) {
    throw AppError.conflict(
      'INVALID_STATE_TRANSITION',
      'There is no scheduled cancellation to undo',
    );
  }
}

export function assertCanUndoScheduledChange(subscription: GuardSub): void {
  if (!subscription.pendingPlanPriceId) {
    throw AppError.conflict(
      'INVALID_STATE_TRANSITION',
      'There is no scheduled plan change to undo',
    );
  }
}

export type PlanPriceWithPlan = PlanPrice & { plan: Plan };

export function classifyChange(
  current: PlanPriceWithPlan,
  target: PlanPriceWithPlan,
): ChangeKind {
  if (!target.isActive || !target.plan.isActive) {
    throw AppError.notFound(
      'PLAN_NOT_AVAILABLE',
      'This plan is not available',
    );
  }
  if (target.currency !== current.currency) {
    throw AppError.badRequest(
      'CURRENCY_MISMATCH',
      'The new plan must use the same currency',
    );
  }
  if (target.interval !== current.interval) {
    throw AppError.badRequest(
      'INTERVAL_CHANGE_NOT_SUPPORTED',
      'Changing billing interval is not supported',
    );
  }
  if (target.id === current.id) {
    throw AppError.badRequest('NO_CHANGE', 'Already on this plan');
  }
  if (target.amount === current.amount) {
    throw AppError.badRequest('NO_CHANGE', 'Already on this plan');
  }
  return target.amount > current.amount ? 'UPGRADE' : 'DOWNGRADE';
}

export function capabilities(subscription: GuardSub): {
  canChangePlan: boolean;
  canPause: boolean;
  canResume: boolean;
  canCancelNow: boolean;
  canCancelAtPeriodEnd: boolean;
  canUndoCancel: boolean;
  canUndoScheduledChange: boolean;
} {
  const tryGuard = (fn: () => void): boolean => {
    try {
      fn();
      return true;
    } catch {
      return false;
    }
  };
  return {
    canChangePlan: tryGuard(() => assertCanChangePlan(subscription)),
    canPause: tryGuard(() => assertCanPause(subscription)),
    canResume: tryGuard(() => assertCanResume(subscription)),
    canCancelNow: tryGuard(() =>
      assertCanCancel(subscription, 'IMMEDIATELY'),
    ),
    canCancelAtPeriodEnd: tryGuard(() =>
      assertCanCancel(subscription, 'AT_PERIOD_END'),
    ),
    canUndoCancel: tryGuard(() => assertCanUndoCancel(subscription)),
    canUndoScheduledChange: tryGuard(() =>
      assertCanUndoScheduledChange(subscription),
    ),
  };
}

import { SubscriptionStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { AppError } from '../src/lib/errors';
import {
  assertCanCancel,
  assertCanChangePlan,
  assertCanPause,
  assertCanResume,
  assertCanUndoCancel,
  assertCanUndoScheduledChange,
  assertTransition,
  capabilities,
  classifyChange,
  type PlanPriceWithPlan,
} from '../src/modules/subscriptions/subscriptionRules';

const STATUSES = [
  SubscriptionStatus.PENDING,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
  SubscriptionStatus.PAUSED,
  SubscriptionStatus.CANCELED,
] as const;

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

function guard(status: SubscriptionStatus, extra?: Partial<{
  cancelAtPeriodEnd: boolean;
  pendingPlanPriceId: string | null;
}>) {
  return {
    status,
    cancelAtPeriodEnd: extra?.cancelAtPeriodEnd ?? false,
    pendingPlanPriceId: extra?.pendingPlanPriceId ?? null,
  };
}

function codeOf(fn: () => void): string | null {
  try {
    fn();
    return null;
  } catch (err) {
    return err instanceof AppError ? err.code : 'UNEXPECTED';
  }
}

function price(overrides: {
  id?: string;
  amount?: number;
  currency?: string;
  interval?: 'MONTH' | 'YEAR';
  isActive?: boolean;
  planActive?: boolean;
}): PlanPriceWithPlan {
  return {
    id: overrides.id ?? 'price-a',
    planId: 'plan-a',
    interval: overrides.interval ?? 'MONTH',
    amount: overrides.amount ?? 900,
    currency: overrides.currency ?? 'USD',
    providerPriceId: null,
    isActive: overrides.isActive ?? true,
    retiredAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    plan: {
      id: 'plan-a',
      name: 'Starter',
      description: 'x',
      features: [],
      usageLimit: 100,
      usageMetric: 'api_calls',
      isActive: overrides.planActive ?? true,
      sortOrder: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };
}

describe('assertTransition', () => {
  it.each(
    STATUSES.flatMap((from) =>
      STATUSES.map((to) => ({ from, to })),
    ),
  )('from $from to $to', ({ from, to }) => {
    const allowed = from === to || ALLOWED[from].includes(to);
    if (allowed) {
      expect(() => assertTransition(from, to)).not.toThrow();
    } else {
      expect(codeOf(() => assertTransition(from, to))).toBe(
        'INVALID_STATE_TRANSITION',
      );
    }
  });
});

describe('action guards', () => {
  it('changePlan is ACTIVE only and blocked by pause, past due, pending, cancel', () => {
    expect(codeOf(() => assertCanChangePlan(guard(SubscriptionStatus.ACTIVE)))).toBeNull();
    expect(codeOf(() => assertCanChangePlan(guard(SubscriptionStatus.PENDING)))).toBe(
      'SUBSCRIPTION_PENDING',
    );
    expect(codeOf(() => assertCanChangePlan(guard(SubscriptionStatus.PAUSED)))).toBe(
      'SUBSCRIPTION_PAUSED',
    );
    expect(codeOf(() => assertCanChangePlan(guard(SubscriptionStatus.PAST_DUE)))).toBe(
      'PAYMENT_REQUIRED',
    );
    expect(codeOf(() => assertCanChangePlan(guard(SubscriptionStatus.CANCELED)))).toBe(
      'INVALID_STATE_TRANSITION',
    );
    expect(
      codeOf(() =>
        assertCanChangePlan(
          guard(SubscriptionStatus.ACTIVE, { cancelAtPeriodEnd: true }),
        ),
      ),
    ).toBe('CANCELLATION_SCHEDULED');
  });

  it('pause is ACTIVE only without scheduled cancel', () => {
    expect(codeOf(() => assertCanPause(guard(SubscriptionStatus.ACTIVE)))).toBeNull();
    expect(codeOf(() => assertCanPause(guard(SubscriptionStatus.PAUSED)))).toBe(
      'INVALID_STATE_TRANSITION',
    );
    expect(
      codeOf(() =>
        assertCanPause(guard(SubscriptionStatus.ACTIVE, { cancelAtPeriodEnd: true })),
      ),
    ).toBe('CANCELLATION_SCHEDULED');
  });

  it('resume is PAUSED only', () => {
    expect(codeOf(() => assertCanResume(guard(SubscriptionStatus.PAUSED)))).toBeNull();
    expect(codeOf(() => assertCanResume(guard(SubscriptionStatus.ACTIVE)))).toBe(
      'INVALID_STATE_TRANSITION',
    );
  });

  it('cancel immediately vs at period end', () => {
    for (const status of [
      SubscriptionStatus.ACTIVE,
      SubscriptionStatus.PAST_DUE,
      SubscriptionStatus.PAUSED,
    ]) {
      expect(
        codeOf(() => assertCanCancel(guard(status), 'IMMEDIATELY')),
      ).toBeNull();
    }
    expect(
      codeOf(() =>
        assertCanCancel(guard(SubscriptionStatus.PENDING), 'IMMEDIATELY'),
      ),
    ).toBe('SUBSCRIPTION_PENDING');
    expect(
      codeOf(() =>
        assertCanCancel(guard(SubscriptionStatus.ACTIVE), 'AT_PERIOD_END'),
      ),
    ).toBeNull();
    expect(
      codeOf(() =>
        assertCanCancel(guard(SubscriptionStatus.PAUSED), 'AT_PERIOD_END'),
      ),
    ).toBe('INVALID_STATE_TRANSITION');
  });

  it('undo cancel and scheduled change', () => {
    expect(
      codeOf(() =>
        assertCanUndoCancel(
          guard(SubscriptionStatus.ACTIVE, { cancelAtPeriodEnd: true }),
        ),
      ),
    ).toBeNull();
    expect(
      codeOf(() => assertCanUndoCancel(guard(SubscriptionStatus.ACTIVE))),
    ).toBe('INVALID_STATE_TRANSITION');
    expect(
      codeOf(() =>
        assertCanUndoScheduledChange(
          guard(SubscriptionStatus.ACTIVE, { pendingPlanPriceId: 'p' }),
        ),
      ),
    ).toBeNull();
    expect(
      codeOf(() =>
        assertCanUndoScheduledChange(guard(SubscriptionStatus.ACTIVE)),
      ),
    ).toBe('INVALID_STATE_TRANSITION');
  });

  it('capabilities match the guards', () => {
    const active = capabilities(guard(SubscriptionStatus.ACTIVE));
    expect(active.canChangePlan).toBe(true);
    expect(active.canPause).toBe(true);
    expect(active.canResume).toBe(false);
    expect(active.canCancelNow).toBe(true);
    expect(active.canCancelAtPeriodEnd).toBe(true);
    const paused = capabilities(guard(SubscriptionStatus.PAUSED));
    expect(paused.canChangePlan).toBe(false);
    expect(paused.canResume).toBe(true);
    expect(paused.canCancelAtPeriodEnd).toBe(false);
  });
});

describe('classifyChange', () => {
  const starter = price({ id: 'starter', amount: 900 });

  it('classifies upgrade and downgrade', () => {
    expect(classifyChange(starter, price({ id: 'pro', amount: 2900 }))).toBe(
      'UPGRADE',
    );
    expect(classifyChange(price({ id: 'pro', amount: 2900 }), starter)).toBe(
      'DOWNGRADE',
    );
  });

  it('rejects same price, same amount, interval, currency, inactive', () => {
    expect(codeOf(() => classifyChange(starter, starter))).toBe('NO_CHANGE');
    expect(
      codeOf(() =>
        classifyChange(starter, price({ id: 'other', amount: 900 })),
      ),
    ).toBe('NO_CHANGE');
    expect(
      codeOf(() =>
        classifyChange(
          starter,
          price({ id: 'year', amount: 9000, interval: 'YEAR' }),
        ),
      ),
    ).toBe('INTERVAL_CHANGE_NOT_SUPPORTED');
    expect(
      codeOf(() =>
        classifyChange(
          starter,
          price({ id: 'eur', amount: 2900, currency: 'EUR' }),
        ),
      ),
    ).toBe('CURRENCY_MISMATCH');
    expect(
      codeOf(() =>
        classifyChange(starter, price({ id: 'off', amount: 2900, isActive: false })),
      ),
    ).toBe('PLAN_NOT_AVAILABLE');
    expect(
      codeOf(() =>
        classifyChange(
          starter,
          price({ id: 'plan-off', amount: 2900, planActive: false }),
        ),
      ),
    ).toBe('PLAN_NOT_AVAILABLE');
  });
});

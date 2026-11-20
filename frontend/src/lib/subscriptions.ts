export type SubscriptionStatus =
  | 'PENDING'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'PAUSED'
  | 'CANCELED';

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
  interval: 'MONTH' | 'YEAR';
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

export type CurrentSubscriptionResponse = {
  subscription: SubscriptionView | null;
};

export type ChangePreview = {
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
};

export function isBlockingSubscription(
  subscription: SubscriptionView | null,
): boolean {
  return subscription !== null && subscription.status !== 'CANCELED';
}

export function intervalLabel(interval: 'MONTH' | 'YEAR' | string): string {
  return interval === 'YEAR' ? 'Yearly' : 'Monthly';
}

export function formatRenewalDate(iso: string | null): string {
  if (!iso) {
    return '—';
  }
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return '—';
  }
  return parsed.toLocaleDateString();
}

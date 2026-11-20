export type SubscriptionStatus =
  | 'PENDING'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'PAUSED'
  | 'CANCELED';

export type SubscriptionView = {
  id: string;
  status: SubscriptionStatus;
  planName: string;
  interval: 'MONTH' | 'YEAR';
  amount: number;
  currency: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
  failureReason: string | null;
};

export type CurrentSubscriptionResponse = {
  subscription: SubscriptionView | null;
};

export function isBlockingSubscription(
  subscription: SubscriptionView | null,
): boolean {
  return subscription !== null && subscription.status !== 'CANCELED';
}

export function intervalLabel(interval: 'MONTH' | 'YEAR'): string {
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

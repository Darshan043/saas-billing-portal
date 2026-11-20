import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formatMoney } from '../lib/money';
import {
  formatRenewalDate,
  intervalLabel,
  type CurrentSubscriptionResponse,
} from '../lib/subscriptions';

const PENDING_FAST_MS = 2_000;
const PENDING_SLOW_MS = 10_000;
const PENDING_SLOW_AFTER_MS = 60_000;

export function SubscriptionStatus() {
  const [waitedTooLong, setWaitedTooLong] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setWaitedTooLong(true),
      PENDING_SLOW_AFTER_MS,
    );
    return () => window.clearTimeout(timer);
  }, []);

  const query = useQuery({
    queryKey: ['subscription-current'],
    queryFn: () => api<CurrentSubscriptionResponse>('/subscriptions/current'),
    refetchInterval: (current) => {
      const status = current.state.data?.subscription?.status;
      if (status !== 'PENDING') {
        return false;
      }
      return waitedTooLong ? PENDING_SLOW_MS : PENDING_FAST_MS;
    },
  });

  const subscription = query.data?.subscription ?? null;

  return (
    <main className="page">
      <h1>Subscription status</h1>

      {query.isLoading && <p className="muted">Loading subscription…</p>}
      {query.isError && (
        <p className="error">Could not load subscription status.</p>
      )}

      {subscription?.status === 'PENDING' && (
        <section className="status-card status-pending">
          <div className="spinner" aria-hidden="true" />
          <p>Processing your payment...</p>
          {waitedTooLong && (
            <>
              <p className="muted">
                Still processing. You can leave this page; your plan will appear
                when payment is confirmed.
              </p>
              <button type="button" onClick={() => void query.refetch()}>
                Refresh
              </button>
            </>
          )}
        </section>
      )}

      {subscription?.status === 'ACTIVE' && (
        <section className="status-card status-success">
          <h2>You are subscribed</h2>
          <p>
            {subscription.planName} · {intervalLabel(subscription.interval)} ·{' '}
            {formatMoney(subscription.amount, subscription.currency)}
          </p>
          <p>
            Renews on {formatRenewalDate(subscription.currentPeriodEnd)}
          </p>
          <p>
            <Link to="/app">Go to app</Link>
          </p>
        </section>
      )}

      {subscription?.status === 'CANCELED' && (
        <section className="status-card status-failure">
          <h2>Payment did not go through</h2>
          <p>{subscription.failureReason ?? 'Checkout was canceled.'}</p>
          <p>
            <Link to="/pricing">Try again</Link>
          </p>
        </section>
      )}

      {!query.isLoading && !subscription && (
        <p className="muted">
          No subscription yet. <Link to="/pricing">Choose a plan</Link>
        </p>
      )}
    </main>
  );
}

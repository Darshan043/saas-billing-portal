import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  Card,
  EmptyState,
  PageHeader,
  Spinner,
  StatusPill,
} from '../components/ui';
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
    <main className="page page-wide" style={{ maxWidth: '40rem', margin: '0 auto' }}>
      <PageHeader
        title="Subscription Status"
        description="Real-time transaction status and activation verification."
      />

      {query.isLoading && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <Spinner size="sm" />
            <span>Checking subscription state…</span>
          </div>
        </Card>
      )}

      {query.isError && (
        <div className="callout-banner callout-banner-danger" role="alert">
          <span>Could not load subscription status. Please refresh.</span>
        </div>
      )}

      {/* Pending State */}
      {subscription?.status === 'PENDING' && (
        <Card>
          <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 'var(--space-4)' }}>
              <Spinner size="lg" />
            </div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 700, margin: '0 0 0.5rem' }}>
              Processing payment authorization…
            </h2>
            <p className="muted" style={{ margin: '0 0 var(--space-4)', fontSize: 'var(--font-size-sm)' }}>
              Waiting for simulated gateway settlement and webhook event confirmation.
            </p>

            {waitedTooLong && (
              <div style={{ marginTop: 'var(--space-4)' }}>
                <p className="muted" style={{ fontSize: 'var(--font-size-xs)', marginBottom: 'var(--space-2)' }}>
                  Still awaiting webhook. You may safely navigate away or manually refresh.
                </p>
                <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
                  Refresh Now
                </Button>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Active State */}
      {subscription?.status === 'ACTIVE' && (
        <Card>
          <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
            <div style={{ fontSize: '3rem', marginBottom: 'var(--space-2)' }}>🎉</div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0 0 0.5rem', color: 'var(--color-navy-900)' }}>
              You are successfully subscribed!
            </h2>
            <div style={{ display: 'inline-flex', marginBottom: 'var(--space-4)' }}>
              <StatusPill status="ACTIVE" label="Active Subscription" />
            </div>
            <p style={{ margin: '0 0 var(--space-2)', fontSize: 'var(--font-size-base)', fontWeight: 600 }}>
              {subscription.planName} · {intervalLabel(subscription.interval)} ·{' '}
              {formatMoney(subscription.amount, subscription.currency)}
            </p>
            <p className="muted" style={{ margin: '0 0 var(--space-6)', fontSize: 'var(--font-size-sm)' }}>
              Renews automatically on {formatRenewalDate(subscription.currentPeriodEnd)}
            </p>

            <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--space-3)' }}>
              <Link to="/app" style={{ textDecoration: 'none' }}>
                <Button>Go to Dashboard →</Button>
              </Link>
              <Link to="/app/billing/invoices" style={{ textDecoration: 'none' }}>
                <Button variant="secondary">View Invoices</Button>
              </Link>
            </div>
          </div>
        </Card>
      )}

      {/* Canceled or Declined State */}
      {subscription?.status === 'CANCELED' && (
        <Card>
          <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
            <div style={{ fontSize: '3rem', marginBottom: 'var(--space-2)' }}>
              {subscription.failureReason ? '❌' : '⚠️'}
            </div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 700, margin: '0 0 0.5rem', color: 'var(--color-danger-700)' }}>
              {subscription.failureReason ? 'Payment Declined' : 'Subscription Canceled'}
            </h2>
            <p className="muted" style={{ margin: '0 0 var(--space-6)', fontSize: 'var(--font-size-sm)', maxWidth: '24rem', marginLeft: 'auto', marginRight: 'auto' }}>
              {subscription.failureReason ?? 'This subscription has concluded.'}
            </p>
            <Link to="/pricing" style={{ textDecoration: 'none' }}>
              <Button>Try Another Payment Method</Button>
            </Link>
          </div>
        </Card>
      )}

      {/* No Subscription */}
      {!query.isLoading && !subscription && (
        <Card>
          <EmptyState
            icon="📋"
            title="No active subscription"
            description="Your organization has no pending or active plans."
            action={
              <Link to="/pricing" style={{ textDecoration: 'none' }}>
                <Button>Choose a Plan</Button>
              </Link>
            }
          />
        </Card>
      )}
    </main>
  );
}

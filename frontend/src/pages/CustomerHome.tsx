import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  Button,
  Card,
  EmptyState,
  PageHeader,
  Skeleton,
  SkeletonText,
  StatusPill,
} from '../components/ui';
import { api } from '../lib/api';
import {
  formatBillingDate,
  type InvoiceListItem,
  type Paginated,
  type PaymentListItem,
} from '../lib/billing';
import { formatMoney } from '../lib/money';
import {
  formatRenewalDate,
  intervalLabel,
  type CurrentSubscriptionResponse,
} from '../lib/subscriptions';

export function CustomerHome() {
  const { user } = useAuth();

  const subQuery = useQuery({
    queryKey: ['subscription-current'],
    queryFn: () => api<CurrentSubscriptionResponse>('/subscriptions/current'),
  });

  const invoicesQuery = useQuery({
    queryKey: ['invoices-recent'],
    queryFn: () =>
      api<Paginated<InvoiceListItem>>('/invoices?page=1&pageSize=3'),
    enabled: Boolean(user?.organization),
  });

  const paymentsQuery = useQuery({
    queryKey: ['payments-recent'],
    queryFn: () =>
      api<Paginated<PaymentListItem>>('/payments?page=1&pageSize=3'),
    enabled: Boolean(user?.organization),
  });

  const subscription = subQuery.data?.subscription ?? null;

  return (
    <main className="page page-wide">
      <PageHeader
        title={`Welcome back, ${user?.name ?? 'Customer'}`}
        description={
          user?.organization
            ? `Organization: ${user.organization.name} (${user.organization.membershipRole.toLowerCase()})`
            : 'Subscription billing & customer portal'
        }
        action={
          subscription ? (
            <Link to="/app/subscription" style={{ textDecoration: 'none' }}>
              <Button size="sm">Manage Subscription</Button>
            </Link>
          ) : (
            <Link to="/pricing" style={{ textDecoration: 'none' }}>
              <Button size="sm">Choose a Plan</Button>
            </Link>
          )
        }
      />

      {/* Loading Skeletons */}
      {subQuery.isLoading && (
        <div className="metric-grid">
          <Card>
            <Skeleton width="40%" height="0.875rem" />
            <Skeleton width="70%" height="1.75rem" style={{ margin: '0.5rem 0' }} />
            <Skeleton width="50%" height="0.75rem" />
          </Card>
          <Card>
            <Skeleton width="40%" height="0.875rem" />
            <Skeleton width="70%" height="1.75rem" style={{ margin: '0.5rem 0' }} />
            <Skeleton width="50%" height="0.75rem" />
          </Card>
          <Card>
            <Skeleton width="40%" height="0.875rem" />
            <Skeleton width="70%" height="1.75rem" style={{ margin: '0.5rem 0' }} />
            <Skeleton width="50%" height="0.75rem" />
          </Card>
        </div>
      )}

      {/* Error Banner */}
      {subQuery.isError && (
        <div className="callout-banner callout-banner-danger" role="alert">
          <div>
            <strong>Could not load your subscription.</strong>
            <p style={{ margin: '0.25rem 0 0' }}>
              There was an issue communicating with the server. Please refresh or try again later.
            </p>
          </div>
        </div>
      )}

      {/* Active Subscription Overview Cards */}
      {!subQuery.isLoading && !subQuery.isError && subscription && (
        <>
          <div className="metric-grid">
            <div className="metric-card">
              <div className="metric-card-header">
                <span className="metric-card-label">Current Plan</span>
                <StatusPill status={subscription.status} />
              </div>
              <div className="metric-card-value">{subscription.planName}</div>
              <div className="metric-card-sub">
                {formatMoney(subscription.amount, subscription.currency)} ·{' '}
                {intervalLabel(subscription.interval)}
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-card-header">
                <span className="metric-card-label">
                  {subscription.status === 'PAUSED' ? 'Paused Status' : 'Billing Cycle'}
                </span>
              </div>
              <div className="metric-card-value">
                {subscription.status === 'PAUSED'
                  ? 'Paused'
                  : formatRenewalDate(subscription.currentPeriodEnd)}
              </div>
              <div className="metric-card-sub">
                {subscription.status === 'PAUSED'
                  ? `Paused on ${formatRenewalDate(subscription.pausedAt)}`
                  : subscription.cancelAtPeriodEnd
                    ? 'Cancels at period end'
                    : 'Scheduled auto-renewal'}
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-card-header">
                <span className="metric-card-label">Monthly Allowance</span>
              </div>
              <div className="metric-card-value">
                {subscription.usageLimit.toLocaleString()}
              </div>
              <div className="metric-card-sub">API calls included per month</div>
            </div>

            <div className="metric-card">
              <div className="metric-card-header">
                <span className="metric-card-label">Organization</span>
              </div>
              <div className="metric-card-value" style={{ fontSize: '1.25rem' }}>
                {user?.organization?.name ?? '—'}
              </div>
              <div className="metric-card-sub">
                Role: {user?.organization?.membershipRole ?? 'Member'}
              </div>
            </div>
          </div>

          {/* Quick Actions Bar */}
          <div className="quick-actions-bar">
            <span
              style={{
                fontSize: 'var(--font-size-xs)',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                color: 'var(--color-text-muted)',
                marginRight: 'var(--space-2)',
              }}
            >
              Quick Actions
            </span>
            <Link to="/app/subscription" style={{ textDecoration: 'none' }}>
              <Button variant="secondary" size="sm">
                Manage Subscription
              </Button>
            </Link>
            <Link to="/app/subscription/change" style={{ textDecoration: 'none' }}>
              <Button variant="secondary" size="sm">
                Change Plan
              </Button>
            </Link>
            <Link to="/app/billing/invoices" style={{ textDecoration: 'none' }}>
              <Button variant="ghost" size="sm">
                View Invoices
              </Button>
            </Link>
            <Link to="/app/billing/payments" style={{ textDecoration: 'none' }}>
              <Button variant="ghost" size="sm">
                Payment History
              </Button>
            </Link>
          </div>
        </>
      )}

      {/* No Plan Empty State */}
      {!subQuery.isLoading && !subQuery.isError && !subscription && (
        <Card style={{ marginBottom: 'var(--space-6)' }}>
          <EmptyState
            icon="💳"
            title="No active subscription"
            description="Subscribe to a plan to start making API calls and access premium team features."
            action={
              <Link to="/pricing" style={{ textDecoration: 'none' }}>
                <Button>Browse Available Plans</Button>
              </Link>
            }
          />
        </Card>
      )}

      {/* Recent Activity Section */}
      <div style={{ display: 'grid', gap: 'var(--space-6)', marginTop: 'var(--space-4)' }}>
        {/* Recent Invoices */}
        <section>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 'var(--space-3)',
            }}
          >
            <h2 style={{ margin: 0, fontSize: '1.15rem' }}>Recent Invoices</h2>
            <Link
              to="/app/billing/invoices"
              style={{
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-action-primary)',
                textDecoration: 'none',
              }}
            >
              View all invoices →
            </Link>
          </div>

          {invoicesQuery.isLoading && (
            <Card>
              <SkeletonText lines={3} />
            </Card>
          )}

          {!invoicesQuery.isLoading &&
            invoicesQuery.data &&
            invoicesQuery.data.items.length > 0 && (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Date</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoicesQuery.data.items.map((inv) => (
                      <tr key={inv.id}>
                        <td>
                          <strong>{inv.displayNumber}</strong>
                        </td>
                        <td>{formatBillingDate(inv.issuedAt)}</td>
                        <td>{formatMoney(inv.total, inv.currency)}</td>
                        <td>
                          <StatusPill status={inv.status} />
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Link
                            to={`/app/billing/invoices/${inv.id}`}
                            style={{
                              color: 'var(--color-action-primary)',
                              fontSize: 'var(--font-size-sm)',
                              fontWeight: 500,
                            }}
                          >
                            View
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

          {!invoicesQuery.isLoading &&
            (!invoicesQuery.data || invoicesQuery.data.items.length === 0) && (
              <Card compact>
                <p className="muted" style={{ margin: 0, fontSize: 'var(--font-size-sm)' }}>
                  No invoices generated yet. Invoices appear automatically after successful payments.
                </p>
              </Card>
            )}
        </section>

        {/* Recent Payments */}
        <section>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 'var(--space-3)',
            }}
          >
            <h2 style={{ margin: 0, fontSize: '1.15rem' }}>Recent Payment Attempts</h2>
            <Link
              to="/app/billing/payments"
              style={{
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-action-primary)',
                textDecoration: 'none',
              }}
            >
              View all payments →
            </Link>
          </div>

          {paymentsQuery.isLoading && (
            <Card>
              <SkeletonText lines={3} />
            </Card>
          )}

          {!paymentsQuery.isLoading &&
            paymentsQuery.data &&
            paymentsQuery.data.items.length > 0 && (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Amount</th>
                      <th>Payment Method</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentsQuery.data.items.map((pmt) => (
                      <tr key={pmt.id}>
                        <td>{formatBillingDate(pmt.createdAt)}</td>
                        <td>{formatMoney(pmt.amount, pmt.currency)}</td>
                        <td>{pmt.paymentMethodLabel ?? 'Credit Card'}</td>
                        <td>
                          <StatusPill status={pmt.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

          {!paymentsQuery.isLoading &&
            (!paymentsQuery.data || paymentsQuery.data.items.length === 0) && (
              <Card compact>
                <p className="muted" style={{ margin: 0, fontSize: 'var(--font-size-sm)' }}>
                  No charge history recorded yet.
                </p>
              </Card>
            )}
        </section>
      </div>
    </main>
  );
}

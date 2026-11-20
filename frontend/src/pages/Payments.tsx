import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  Card,
  EmptyState,
  PageHeader,
  SkeletonText,
  StatusPill,
} from '../components/ui';
import { api } from '../lib/api';
import {
  formatBillingDate,
  type Paginated,
  type PaymentListItem,
} from '../lib/billing';
import { formatMoney } from '../lib/money';

export function Payments() {
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['payments', page],
    queryFn: () =>
      api<Paginated<PaymentListItem>>(
        `/payments?page=${page}&pageSize=10`,
      ),
  });
  const data = query.data;

  return (
    <main className="page page-wide">
      <PageHeader
        title="Payment History"
        description="Every simulated charge and transaction attempt recorded for your organization."
      />

      {/* Simulator Notice */}
      <div className="simulator-notice" role="note" style={{ marginBottom: 'var(--space-6)' }}>
        SIMULATOR MODE — Charges are simulated sandbox operations. No actual banking or payment gateway funds were moved.
      </div>

      {/* Loading Skeleton */}
      {query.isLoading && (
        <Card>
          <SkeletonText lines={5} />
        </Card>
      )}

      {/* Error state */}
      {query.isError && (
        <div className="callout-banner callout-banner-danger" role="alert">
          <div>
            <strong>Could not load payment records.</strong>
            <p style={{ margin: '0.25rem 0 0' }}>
              Please verify your connection and refresh or retry.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void query.refetch()}
            style={{ marginLeft: 'auto' }}
          >
            Retry
          </Button>
        </div>
      )}

      {/* Empty state */}
      {!query.isLoading && !query.isError && data?.items.length === 0 && (
        <Card>
          <EmptyState
            icon="💳"
            title="No payment attempts recorded"
            description="Transaction records will appear here whenever a subscription activates or renewal charges occur."
            action={
              <Link to="/app/subscription" style={{ textDecoration: 'none' }}>
                <Button variant="secondary">Go to Subscription</Button>
              </Link>
            }
          />
        </Card>
      )}

      {/* Payments Table */}
      {data && data.items.length > 0 && (
        <>
          <div className="table-wrap-card">
            <table>
              <thead>
                <tr>
                  <th>Transaction Date</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Payment Method</th>
                  <th>Linked Invoice</th>
                  <th>Failure Notes</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((payment) => (
                  <tr key={payment.id}>
                    <td>
                      <span style={{ fontWeight: 500 }}>
                        {formatBillingDate(payment.createdAt)}
                      </span>
                    </td>
                    <td>
                      <strong>{formatMoney(payment.amount, payment.currency)}</strong>
                    </td>
                    <td>
                      <StatusPill status={payment.status} />
                    </td>
                    <td>
                      <span style={{ color: 'var(--color-navy-800)', fontSize: '0.875rem' }}>
                        {payment.paymentMethodLabel ?? 'Simulator Card'}
                      </span>
                    </td>
                    <td>
                      {payment.invoice ? (
                        <Link
                          to={`/app/billing/invoices/${payment.invoice.id}`}
                          style={{
                            fontFamily: 'monospace',
                            fontWeight: 700,
                            color: 'var(--color-action-primary)',
                            textDecoration: 'none',
                          }}
                        >
                          {payment.invoice.displayNumber}
                        </Link>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      {payment.status === 'FAILED' ? (
                        <span
                          style={{
                            color: 'var(--color-danger-700)',
                            fontSize: 'var(--font-size-xs)',
                            fontWeight: 500,
                            background: 'var(--color-danger-50)',
                            padding: '0.2rem 0.5rem',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--color-danger-200)',
                            display: 'inline-block',
                          }}
                        >
                          {payment.failureMessage ?? 'Declined'}
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div className="pager-container">
            <span className="pager-info">
              Showing page <strong>{data.page}</strong> of{' '}
              <strong>{data.totalPages || 1}</strong> ({data.totalItems} total)
            </span>
            <div className="pager-controls">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
              >
                ← Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= data.totalPages}
                onClick={() => setPage((current) => current + 1)}
              >
                Next →
              </Button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}

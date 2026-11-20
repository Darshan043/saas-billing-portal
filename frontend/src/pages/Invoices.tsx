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
  type InvoiceListItem,
  type Paginated,
} from '../lib/billing';
import { formatMoney } from '../lib/money';

export function Invoices() {
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['invoices', page],
    queryFn: () =>
      api<Paginated<InvoiceListItem>>(
        `/invoices?page=${page}&pageSize=10`,
      ),
  });
  const data = query.data;

  return (
    <main className="page page-wide">
      <PageHeader
        title="Invoices"
        description="View and download finalized billing statements and receipts for your organization."
      />

      {/* Simulator Notice */}
      <div className="simulator-notice" role="note" style={{ marginBottom: 'var(--space-6)' }}>
        SIMULATOR MODE — Invoices represent simulated test transactions. No actual banking or tax authorities are involved.
      </div>

      {/* Loading Skeletons */}
      {query.isLoading && (
        <Card>
          <SkeletonText lines={5} />
        </Card>
      )}

      {/* Query Error */}
      {query.isError && (
        <div className="callout-banner callout-banner-danger" role="alert">
          <div>
            <strong>Could not load invoices.</strong>
            <p style={{ margin: '0.25rem 0 0' }}>
              Please check your connection and refresh or retry.
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

      {/* Empty State */}
      {!query.isLoading && !query.isError && data?.items.length === 0 && (
        <Card>
          <EmptyState
            icon="📄"
            title="No invoices generated yet"
            description="Official invoices and receipts are issued automatically whenever a subscription charge or renewal succeeds."
            action={
              <Link to="/app/subscription" style={{ textDecoration: 'none' }}>
                <Button variant="secondary">Check Subscription</Button>
              </Link>
            }
          />
        </Card>
      )}

      {/* Invoices Data Table */}
      {data && data.items.length > 0 && (
        <>
          <div className="table-wrap-card">
            <table>
              <thead>
                <tr>
                  <th>Invoice Number</th>
                  <th>Issue Date</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>
                      <span
                        style={{
                          fontFamily: 'monospace',
                          fontWeight: 700,
                          fontSize: '0.875rem',
                          color: 'var(--color-navy-900)',
                        }}
                      >
                        {invoice.displayNumber}
                      </span>
                    </td>
                    <td>{formatBillingDate(invoice.issuedAt)}</td>
                    <td style={{ color: 'var(--color-text-secondary)' }}>
                      {invoice.description || 'Subscription charge'}
                    </td>
                    <td>
                      <strong>{formatMoney(invoice.total, invoice.currency)}</strong>
                    </td>
                    <td>
                      <StatusPill status={invoice.status} />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Link
                        to={`/app/billing/invoices/${invoice.id}`}
                        style={{ textDecoration: 'none' }}
                      >
                        <Button variant="ghost" size="sm">
                          View Details →
                        </Button>
                      </Link>
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

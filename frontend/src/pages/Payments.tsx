import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
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
      <h1>Payments</h1>
      <p className="subtitle">Every charge attempt for this organization.</p>

      {query.isLoading && <p className="muted">Loading payments…</p>}
      {query.isError && <p className="error">Could not load payments.</p>}
      {!query.isLoading && !query.isError && data?.items.length === 0 && (
        <p className="muted">No payments yet.</p>
      )}

      {data && data.items.length > 0 && (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Payment method</th>
                  <th>Invoice</th>
                  <th>Failure</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((payment) => (
                  <tr key={payment.id}>
                    <td>{formatBillingDate(payment.createdAt)}</td>
                    <td>{formatMoney(payment.amount, payment.currency)}</td>
                    <td>
                      <span
                        className={`pill status-${payment.status.toLowerCase()}`}
                      >
                        {payment.status}
                      </span>
                    </td>
                    <td>{payment.paymentMethodLabel ?? '—'}</td>
                    <td>
                      {payment.invoice ? (
                        <Link
                          to={`/app/billing/invoices/${payment.invoice.id}`}
                        >
                          {payment.invoice.displayNumber}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      {payment.status === 'FAILED'
                        ? payment.failureMessage ?? '—'
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pager">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
            >
              Previous
            </button>
            <span>
              Page {data.page} of {data.totalPages}
            </span>
            <button
              type="button"
              disabled={page >= data.totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </main>
  );
}

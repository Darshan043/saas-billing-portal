import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
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
      <h1>Invoices</h1>
      <p className="subtitle">Invoices appear after a successful payment.</p>

      {query.isLoading && <p className="muted">Loading invoices…</p>}
      {query.isError && <p className="error">Could not load invoices.</p>}
      {!query.isLoading && !query.isError && data?.items.length === 0 && (
        <p className="muted">
          No invoices yet. They appear here after your first payment.
        </p>
      )}

      {data && data.items.length > 0 && (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice number</th>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>{invoice.displayNumber}</td>
                    <td>{formatBillingDate(invoice.issuedAt)}</td>
                    <td>{invoice.description}</td>
                    <td>{formatMoney(invoice.total, invoice.currency)}</td>
                    <td>
                      <span
                        className={`pill status-${invoice.status.toLowerCase()}`}
                      >
                        {invoice.status}
                      </span>
                    </td>
                    <td>
                      <Link to={`/app/billing/invoices/${invoice.id}`}>
                        View
                      </Link>
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

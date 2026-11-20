import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ApiError, api, downloadBinary } from '../lib/api';
import {
  formatBillingDate,
  triggerBrowserDownload,
  type InvoiceDetail as InvoiceDetailResponse,
} from '../lib/billing';
import { formatMoney } from '../lib/money';

export function InvoiceDetail() {
  const { id } = useParams();
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['invoice', id],
    enabled: Boolean(id),
    queryFn: () => api<InvoiceDetailResponse>(`/invoices/${id}`),
    retry: false,
  });

  async function onDownload() {
    if (!id) {
      return;
    }
    setDownloading(true);
    setDownloadError(null);
    try {
      const file = await downloadBinary(`/invoices/${id}/pdf`);
      triggerBrowserDownload(file.blob, file.filename);
    } catch (err) {
      setDownloadError(
        err instanceof ApiError ? err.message : 'Could not download PDF',
      );
    } finally {
      setDownloading(false);
    }
  }

  if (query.isLoading) {
    return (
      <main className="page">
        <p className="muted">Loading invoice…</p>
      </main>
    );
  }

  if (query.error instanceof ApiError && query.error.status === 404) {
    return (
      <main className="page">
        <h1>Invoice not found</h1>
        <p className="muted">This invoice does not exist or is not yours.</p>
        <p>
          <Link to="/app/billing/invoices">Back to invoices</Link>
        </p>
      </main>
    );
  }

  if (query.isError || !query.data) {
    return (
      <main className="page">
        <p className="error">Could not load this invoice.</p>
        <p>
          <Link to="/app/billing/invoices">Back to invoices</Link>
        </p>
      </main>
    );
  }

  const invoice = query.data.invoice;
  const period =
    invoice.periodEnd != null
      ? `${formatBillingDate(invoice.periodStart)} – ${formatBillingDate(invoice.periodEnd)}`
      : formatBillingDate(invoice.periodStart);

  return (
    <main className="page page-wide">
      <p>
        <Link to="/app/billing/invoices">Back to invoices</Link>
      </p>
      <div className="invoice-header">
        <h1>{invoice.displayNumber}</h1>
        <span className={`pill status-${invoice.status.toLowerCase()}`}>
          {invoice.status}
        </span>
      </div>
      <p className="simulator-notice">
        SIMULATED PAYMENT - no real money was charged
      </p>

      <section className="status-box">
        <dl>
          <div>
            <dt>Issue date</dt>
            <dd>{formatBillingDate(invoice.issuedAt)}</dd>
          </div>
          <div>
            <dt>Paid date</dt>
            <dd>{formatBillingDate(invoice.paidAt)}</dd>
          </div>
          <div>
            <dt>Billing period</dt>
            <dd>{period}</dd>
          </div>
        </dl>
      </section>

      <section className="billed-to">
        <h2>Billed to</h2>
        <p>{invoice.organization.name}</p>
        <p className="muted">{invoice.organization.billingEmail}</p>
      </section>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Qty</th>
              <th>Unit amount</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item, index) => (
              <tr key={`${item.description}-${index}`}>
                <td>{item.description}</td>
                <td>{item.quantity}</td>
                <td>{formatMoney(item.unitAmount, invoice.currency)}</td>
                <td>{formatMoney(item.amount, invoice.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="invoice-totals">
        <p>Subtotal: {formatMoney(invoice.subtotal, invoice.currency)}</p>
        <p>
          <strong>Total: {formatMoney(invoice.total, invoice.currency)}</strong>
        </p>
      </div>

      {invoice.payment && (
        <p className="muted">
          Payment {invoice.payment.status.toLowerCase()}
          {invoice.payment.paymentMethodLabel
            ? ` · ${invoice.payment.paymentMethodLabel}`
            : ''}
        </p>
      )}

      <p className="home-actions">
        <button
          type="button"
          className="primary-button"
          disabled={downloading}
          onClick={() => void onDownload()}
        >
          {downloading ? 'Downloading…' : 'Download PDF'}
        </button>
      </p>
      {downloadError && <p className="error">{downloadError}</p>}
    </main>
  );
}

import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  Card,
  EmptyState,
  PageHeader,
  Skeleton,
  SkeletonText,
  StatusPill,
} from '../components/ui';
import { DownloadIcon } from '../components/layouts/Icons';
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
      <main className="page page-wide">
        <PageHeader title="Loading Invoice…" description="Fetching statement details from the server." />
        <Card>
          <Skeleton width="40%" height="2rem" />
          <SkeletonText lines={4} style={{ marginTop: '1.5rem' }} />
        </Card>
      </main>
    );
  }

  if (query.error instanceof ApiError && query.error.status === 404) {
    return (
      <main className="page page-wide">
        <PageHeader title="Invoice Not Found" description="The requested invoice does not exist or access is restricted." />
        <Card>
          <EmptyState
            icon="🔍"
            title="Invoice not found"
            description="We could not find an invoice matching this ID for your organization."
            action={
              <Link to="/app/billing/invoices" style={{ textDecoration: 'none' }}>
                <Button>Back to Invoices</Button>
              </Link>
            }
          />
        </Card>
      </main>
    );
  }

  if (query.isError || !query.data) {
    return (
      <main className="page page-wide">
        <PageHeader title="Error Loading Invoice" />
        <div className="callout-banner callout-banner-danger" role="alert">
          <div>
            <strong>Unable to load invoice details.</strong> Please return to the invoice list and try again.
          </div>
        </div>
        <div style={{ marginTop: 'var(--space-4)' }}>
          <Link to="/app/billing/invoices">
            <Button variant="secondary">Back to Invoices</Button>
          </Link>
        </div>
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
      {/* Top Breadcrumb & Actions */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'var(--space-4)',
          flexWrap: 'wrap',
          gap: 'var(--space-3)',
        }}
      >
        <Link
          to="/app/billing/invoices"
          style={{
            fontSize: 'var(--font-size-sm)',
            color: 'var(--color-action-primary)',
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
          }}
        >
          ← Back to invoices
        </Link>

        <Button
          onClick={() => void onDownload()}
          disabled={downloading}
          size="sm"
        >
          <DownloadIcon style={{ width: '1rem', height: '1rem' }} />
          <span>{downloading ? 'Generating PDF…' : 'Download Official PDF'}</span>
        </Button>
      </div>

      {downloadError && (
        <div className="callout-banner callout-banner-danger" style={{ marginBottom: 'var(--space-4)' }}>
          <span>{downloadError}</span>
        </div>
      )}

      {/* Simulator Mode Notice */}
      <div className="simulator-notice" role="note" style={{ marginBottom: 'var(--space-5)' }}>
        SIMULATED PAYMENT — No real credit card was charged and no legal sales tax was collected.
      </div>

      {/* Main Printable-Style Invoice Paper Card */}
      <div className="invoice-paper-card">
        {/* Header Block: Title & Status */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--color-border)',
            paddingBottom: 'var(--space-6)',
            marginBottom: 'var(--space-6)',
            flexWrap: 'wrap',
            gap: 'var(--space-4)',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800 }}>
                {invoice.displayNumber}
              </h1>
              <StatusPill status={invoice.status} />
            </div>
            <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: 'var(--font-size-sm)' }}>
              Official Subscription Invoice & Receipt
            </p>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-navy-900)' }}>
              {formatMoney(invoice.total, invoice.currency)}
            </div>
            <span className="muted" style={{ fontSize: 'var(--font-size-xs)' }}>
              Total Amount ({invoice.currency})
            </span>
          </div>
        </div>

        {/* Invoice Metadata Banner Grid */}
        <div className="invoice-meta-banner">
          <div>
            <div className="invoice-meta-item-label">Issue Date</div>
            <div className="invoice-meta-item-value">{formatBillingDate(invoice.issuedAt)}</div>
          </div>
          <div>
            <div className="invoice-meta-item-label">Payment Date</div>
            <div className="invoice-meta-item-value">{formatBillingDate(invoice.paidAt)}</div>
          </div>
          <div>
            <div className="invoice-meta-item-label">Billing Period</div>
            <div className="invoice-meta-item-value">{period}</div>
          </div>
          <div>
            <div className="invoice-meta-item-label">Payment Status</div>
            <div className="invoice-meta-item-value">
              <StatusPill status={invoice.status} />
            </div>
          </div>
        </div>

        {/* Two-Column Parties Info */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))',
            gap: 'var(--space-6)',
            marginBottom: 'var(--space-6)',
          }}
        >
          <div>
            <div style={{ fontSize: 'var(--font-size-xs)', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>
              Issuer
            </div>
            <div style={{ fontWeight: 700, fontSize: 'var(--font-size-base)', color: 'var(--color-navy-900)' }}>
              BillingHub SaaS Inc.
            </div>
            <div className="muted" style={{ fontSize: 'var(--font-size-sm)' }}>
              Subscription & Customer Portal
            </div>
            <div className="muted" style={{ fontSize: 'var(--font-size-sm)' }}>
              support@billinghub.example.com
            </div>
          </div>

          <div>
            <div style={{ fontSize: 'var(--font-size-xs)', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>
              Billed To
            </div>
            <div style={{ fontWeight: 700, fontSize: 'var(--font-size-base)', color: 'var(--color-navy-900)' }}>
              {invoice.organization.name}
            </div>
            <div className="muted" style={{ fontSize: 'var(--font-size-sm)' }}>
              {invoice.organization.billingEmail}
            </div>
          </div>
        </div>

        {/* Line Items Table */}
        <div className="table-wrap-card" style={{ marginBottom: 'var(--space-6)' }}>
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th style={{ textAlign: 'center' }}>Qty</th>
                <th style={{ textAlign: 'right' }}>Unit Price</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item, index) => (
                <tr key={`${item.description}-${index}`}>
                  <td>
                    <strong>{item.description}</strong>
                  </td>
                  <td style={{ textAlign: 'center' }}>{item.quantity}</td>
                  <td style={{ textAlign: 'right' }}>
                    {formatMoney(item.unitAmount, invoice.currency)}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>
                    {formatMoney(item.amount, invoice.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals & Breakdown */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-6)' }}>
          <div style={{ width: '100%', maxWidth: '20rem' }}>
            <div className="order-summary-line">
              <span className="muted">Subtotal</span>
              <span>{formatMoney(invoice.subtotal, invoice.currency)}</span>
            </div>
            <div className="order-summary-line">
              <span className="muted">Taxes (Simulator)</span>
              <span>$0.00</span>
            </div>
            <div className="order-summary-line total">
              <span>Total Paid</span>
              <span>{formatMoney(invoice.total, invoice.currency)}</span>
            </div>
          </div>
        </div>

        {/* Payment Confirmation Settlement Details */}
        {invoice.payment && (
          <div
            style={{
              padding: 'var(--space-4)',
              background: 'var(--color-surface-secondary)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 'var(--space-3)',
            }}
          >
            <div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                Payment Method & Reference
              </div>
              <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, marginTop: '0.2rem' }}>
                {invoice.payment.paymentMethodLabel ?? 'Simulator Test Method'} · ID {invoice.payment.id.slice(0, 12)}…
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <span className="muted" style={{ fontSize: 'var(--font-size-xs)' }}>
                Settled on {formatBillingDate(invoice.payment.createdAt)}:
              </span>
              <StatusPill status={invoice.payment.status} />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

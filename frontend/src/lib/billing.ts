export type InvoiceStatus = 'OPEN' | 'PAID' | 'VOID';
export type PaymentStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED';

export type InvoiceListItem = {
  id: string;
  number: number;
  displayNumber: string;
  status: InvoiceStatus;
  total: number;
  currency: string;
  issuedAt: string;
  paidAt: string | null;
  periodStart: string;
  periodEnd: string | null;
  description: string;
};

export type Paginated<T> = {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

export type InvoiceDetail = {
  invoice: {
    id: string;
    number: number;
    displayNumber: string;
    status: InvoiceStatus;
    subtotal: number;
    total: number;
    currency: string;
    issuedAt: string;
    paidAt: string | null;
    periodStart: string;
    periodEnd: string | null;
    organization: {
      name: string;
      billingEmail: string;
    };
    items: Array<{
      description: string;
      quantity: number;
      unitAmount: number;
      amount: number;
    }>;
    payment: {
      id: string;
      status: PaymentStatus;
      amount: number;
      currency: string;
      paymentMethodLabel: string | null;
      createdAt: string;
    } | null;
  };
};

export type PaymentListItem = {
  id: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  paymentMethodLabel: string | null;
  failureMessage: string | null;
  createdAt: string;
  invoice: { id: string; displayNumber: string } | null;
};

export function formatBillingDate(value: string | null): string {
  if (!value) {
    return '—';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '—';
  }
  return parsed.toLocaleDateString();
}

export function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

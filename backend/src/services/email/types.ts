export type SendMailOptions = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type SendMailResult = {
  success: boolean;
  messageId?: string;
  error?: string;
};

export type PaymentSucceededEmailData = {
  recipient: string;
  organizationName: string;
  amount: number;
  currency: string;
  paymentId: string;
  invoiceNumber?: number;
  paymentMethodLabel?: string | null;
  paidAt?: Date;
};

export type InvoiceNotificationEmailData = {
  recipient: string;
  organizationName: string;
  invoiceId: string;
  invoiceNumber: number;
  total: number;
  currency: string;
  status: string;
  periodStart: Date;
  periodEnd?: Date | null;
  viewUrl?: string;
};

export type SubscriptionActivatedEmailData = {
  recipient: string;
  organizationName: string;
  subscriptionId: string;
  planName: string;
  interval: string;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
};

export type SubscriptionPlanChangedEmailData = {
  recipient: string;
  organizationName: string;
  subscriptionId: string;
  kind: 'UPGRADE' | 'DOWNGRADE';
  planName: string;
  interval: string;
  effectiveAt?: string;
  chargeAmount?: number;
  currency?: string;
};

export type SubscriptionCanceledEmailData = {
  recipient: string;
  organizationName: string;
  subscriptionId: string;
  planName: string;
  when: 'IMMEDIATELY' | 'AT_PERIOD_END';
  effectiveAt?: string;
};


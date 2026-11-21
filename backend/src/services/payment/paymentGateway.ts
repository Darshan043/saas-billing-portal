export class ProviderRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderRejectedError';
  }
}

export class ProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderUnavailableError';
  }
}

export type CreateCustomerRequest = {
  organizationId: string;
  name: string;
  email: string;
  idempotencyKey: string;
};

export type CreateCustomerResponse = {
  id: string;
  email: string;
  name: string;
  createdAt: string;
};

export type CreateSubscriptionRequest = {
  providerCustomerId: string;
  amount: number;
  currency: string;
  interval: 'MONTH' | 'YEAR';
  planName: string;
  planPriceId: string;
  paymentToken: string;
  idempotencyKey: string;
  metadata: {
    subscriptionId: string;
    organizationId: string;
  };
};

export type CreateSubscriptionResponse = {
  id: string;
  customerId: string;
  status: string;
  amount: number;
  currency: string;
  planPriceId: string | null;
};

export type SubscriptionMetadata = {
  subscriptionId: string;
  organizationId: string;
  reason?: string;
  description?: string;
  fromPlanPriceId?: string;
  toPlanPriceId?: string;
};

export type ChangePlanRequest = {
  providerSubscriptionId: string;
  planPriceId: string;
  amount: number;
  currency: string;
  chargeAmount: number;
  idempotencyKey: string;
  description?: string;
  token?: string;
  metadata: SubscriptionMetadata;
};

export type ChangePlanResponse = {
  id: string;
  status: string;
  amount: number;
  currency: string;
  planPriceId: string | null;
  providerPaymentId?: string | null;
  newPeriod?: { currentPeriodEnd: string } | null;
};

export type ProviderSubscriptionRequest = {
  providerSubscriptionId: string;
  idempotencyKey: string;
};

export type ResumeSubscriptionRequest = ProviderSubscriptionRequest & {
  newPeriodEnd: Date;
};

export interface PaymentGateway {
  createCustomer(
    request: CreateCustomerRequest,
  ): Promise<CreateCustomerResponse>;
  createSubscription(
    request: CreateSubscriptionRequest,
  ): Promise<CreateSubscriptionResponse>;
  changeSubscriptionPlan(
    request: ChangePlanRequest,
  ): Promise<ChangePlanResponse>;
  setCancelAtPeriodEnd(
    request: ProviderSubscriptionRequest & { value: boolean },
  ): Promise<void>;
  cancelSubscriptionNow(request: ProviderSubscriptionRequest): Promise<void>;
  pauseSubscription(request: ProviderSubscriptionRequest): Promise<void>;
  resumeSubscription(request: ResumeSubscriptionRequest): Promise<{
    currentPeriodEnd: string | null;
  }>;
}

let currentGateway: PaymentGateway | null = null;

export function setPaymentGateway(gateway: PaymentGateway | null): void {
  currentGateway = gateway;
}

export function getPaymentGateway(): PaymentGateway {
  if (!currentGateway) {
    throw new Error('Payment gateway is not configured');
  }
  return currentGateway;
}

export function resetPaymentGateway(): void {
  currentGateway = null;
}

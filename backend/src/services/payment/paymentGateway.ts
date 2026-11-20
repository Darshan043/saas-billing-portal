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

export interface PaymentGateway {
  createCustomer(
    request: CreateCustomerRequest,
  ): Promise<CreateCustomerResponse>;
  createSubscription(
    request: CreateSubscriptionRequest,
  ): Promise<CreateSubscriptionResponse>;
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

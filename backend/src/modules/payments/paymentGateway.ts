export type CreateCustomerRequest = {
  email: string;
  name: string;
};

export type CreateCustomerResponse = {
  id: string;
  email: string;
  name: string;
  createdAt: string;
};

export type CreatePaymentRequest = {
  customerId: string;
  amount: number;
  currency: string;
  token?: string;
  paymentMethodId?: string;
  idempotencyKey?: string;
};

export type PaymentStatus =
  | 'succeeded'
  | 'declined'
  | 'insufficient_funds';

export type CreatePaymentResponse = {
  id: string;
  customerId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  errorCode: string | null;
  createdAt: string;
};

export type CreateSubscriptionRequest = {
  customerId: string;
  amount: number;
  currency: string;
  planPriceId?: string;
  token?: string;
};

export type UpdateSubscriptionRequest = {
  subscriptionId: string;
  amount?: number;
  currency?: string;
  planPriceId?: string | null;
};

export type SubscriptionState = {
  id: string;
  customerId: string;
  status: 'active' | 'canceled';
  amount: number;
  currency: string;
  planPriceId: string | null;
  canceledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export interface PaymentGateway {
  createCustomer(
    request: CreateCustomerRequest,
  ): Promise<CreateCustomerResponse>;
  createPayment(request: CreatePaymentRequest): Promise<CreatePaymentResponse>;
  createSubscription(
    request: CreateSubscriptionRequest,
  ): Promise<SubscriptionState>;
  updateSubscription(
    request: UpdateSubscriptionRequest,
  ): Promise<SubscriptionState>;
  cancelSubscription(subscriptionId: string): Promise<SubscriptionState>;
  getSubscriptionState(subscriptionId: string): Promise<SubscriptionState>;
}

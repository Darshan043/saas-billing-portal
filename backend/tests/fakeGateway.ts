import {
  ProviderRejectedError,
  ProviderUnavailableError,
  type CreateCustomerRequest,
  type CreateCustomerResponse,
  type CreateSubscriptionRequest,
  type CreateSubscriptionResponse,
  type PaymentGateway,
} from '../src/services/payment/paymentGateway';

export type FakeGatewayBehavior = 'success' | 'rejected' | 'unavailable';

export class FakePaymentGateway implements PaymentGateway {
  behavior: FakeGatewayBehavior = 'success';
  readonly createCustomerCalls: CreateCustomerRequest[] = [];
  readonly createSubscriptionCalls: CreateSubscriptionRequest[] = [];

  async createCustomer(
    request: CreateCustomerRequest,
  ): Promise<CreateCustomerResponse> {
    this.createCustomerCalls.push(request);
    if (this.behavior === 'unavailable') {
      throw new ProviderUnavailableError('simulator down');
    }
    if (this.behavior === 'rejected') {
      throw new ProviderRejectedError('Customer rejected');
    }
    return {
      id: `cus_${request.organizationId}`,
      email: request.email,
      name: request.name,
      createdAt: new Date().toISOString(),
    };
  }

  async createSubscription(
    request: CreateSubscriptionRequest,
  ): Promise<CreateSubscriptionResponse> {
    this.createSubscriptionCalls.push(request);
    if (this.behavior === 'rejected') {
      throw new ProviderRejectedError('Card declined');
    }
    if (this.behavior === 'unavailable') {
      throw new ProviderUnavailableError('simulator down');
    }
    return {
      id: `sub_${request.idempotencyKey}`,
      customerId: request.providerCustomerId,
      status: 'active',
      amount: request.amount,
      currency: request.currency,
      planPriceId: request.planPriceId,
    };
  }
}

import {
  ProviderRejectedError,
  ProviderUnavailableError,
  type ChangePlanRequest,
  type ChangePlanResponse,
  type CreateCustomerRequest,
  type CreateCustomerResponse,
  type CreateSubscriptionRequest,
  type CreateSubscriptionResponse,
  type PaymentGateway,
  type ProviderSubscriptionRequest,
  type ResumeSubscriptionRequest,
} from '../src/services/payment/paymentGateway';

export type FakeGatewayBehavior = 'success' | 'rejected' | 'unavailable';

export class FakePaymentGateway implements PaymentGateway {
  behavior: FakeGatewayBehavior = 'success';
  methodBehavior: Partial<
    Record<
      | 'createCustomer'
      | 'createSubscription'
      | 'changeSubscriptionPlan'
      | 'setCancelAtPeriodEnd'
      | 'cancelSubscriptionNow'
      | 'pauseSubscription'
      | 'resumeSubscription',
      FakeGatewayBehavior
    >
  > = {};
  readonly createCustomerCalls: CreateCustomerRequest[] = [];
  readonly createSubscriptionCalls: CreateSubscriptionRequest[] = [];
  readonly changePlanCalls: ChangePlanRequest[] = [];
  readonly setCancelAtPeriodEndCalls: Array<
    ProviderSubscriptionRequest & { value: boolean }
  > = [];
  readonly cancelNowCalls: ProviderSubscriptionRequest[] = [];
  readonly pauseCalls: ProviderSubscriptionRequest[] = [];
  readonly resumeCalls: ResumeSubscriptionRequest[] = [];

  private outcome(
    method: keyof FakePaymentGateway['methodBehavior'],
  ): FakeGatewayBehavior {
    return this.methodBehavior[method] ?? this.behavior;
  }

  private throwIfNotSuccess(method: keyof FakePaymentGateway['methodBehavior']) {
    const outcome = this.outcome(method);
    if (outcome === 'unavailable') {
      throw new ProviderUnavailableError('simulator down');
    }
    if (outcome === 'rejected') {
      throw new ProviderRejectedError('Card declined');
    }
  }

  async createCustomer(
    request: CreateCustomerRequest,
  ): Promise<CreateCustomerResponse> {
    this.createCustomerCalls.push(request);
    this.throwIfNotSuccess('createCustomer');
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
    this.throwIfNotSuccess('createSubscription');
    return {
      id: `sub_${request.idempotencyKey}`,
      customerId: request.providerCustomerId,
      status: 'active',
      amount: request.amount,
      currency: request.currency,
      planPriceId: request.planPriceId,
    };
  }

  async changeSubscriptionPlan(
    request: ChangePlanRequest,
  ): Promise<ChangePlanResponse> {
    this.changePlanCalls.push(request);
    this.throwIfNotSuccess('changeSubscriptionPlan');
    return {
      id: request.providerSubscriptionId,
      status: 'active',
      amount: request.amount,
      currency: request.currency,
      planPriceId: request.planPriceId,
      providerPaymentId:
        request.chargeAmount > 0 ? `pay_${request.idempotencyKey}` : null,
      newPeriod: null,
    };
  }

  async setCancelAtPeriodEnd(
    request: ProviderSubscriptionRequest & { value: boolean },
  ): Promise<void> {
    this.setCancelAtPeriodEndCalls.push(request);
    this.throwIfNotSuccess('setCancelAtPeriodEnd');
  }

  async cancelSubscriptionNow(
    request: ProviderSubscriptionRequest,
  ): Promise<void> {
    this.cancelNowCalls.push(request);
    this.throwIfNotSuccess('cancelSubscriptionNow');
  }

  async pauseSubscription(
    request: ProviderSubscriptionRequest,
  ): Promise<void> {
    this.pauseCalls.push(request);
    this.throwIfNotSuccess('pauseSubscription');
  }

  async resumeSubscription(
    request: ResumeSubscriptionRequest,
  ): Promise<{ currentPeriodEnd: string | null }> {
    this.resumeCalls.push(request);
    this.throwIfNotSuccess('resumeSubscription');
    return { currentPeriodEnd: request.newPeriodEnd.toISOString() };
  }
}

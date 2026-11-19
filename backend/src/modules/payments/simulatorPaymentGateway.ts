import { env } from '../../config/env';
import { AppError } from '../../lib/errors';
import type {
  CreateCustomerRequest,
  CreateCustomerResponse,
  CreatePaymentRequest,
  CreatePaymentResponse,
  CreateSubscriptionRequest,
  PaymentGateway,
  SubscriptionState,
  UpdateSubscriptionRequest,
} from './paymentGateway';

type ErrorBody = {
  error?: { code?: string; message?: string };
};

export class SimulatorPaymentGateway implements PaymentGateway {
  constructor(
    private readonly baseUrl: string = env.SIMULATOR_URL,
    private readonly apiKey: string = env.SIMULATOR_API_KEY,
    private readonly timeoutMs: number = env.SIMULATOR_TIMEOUT_MS,
  ) {}

  async createCustomer(
    request: CreateCustomerRequest,
  ): Promise<CreateCustomerResponse> {
    const body = await this.request<{ customer: CreateCustomerResponse }>(
      'POST',
      '/v1/customers',
      request,
    );
    return body.customer;
  }

  async createPayment(
    request: CreatePaymentRequest,
  ): Promise<CreatePaymentResponse> {
    const headers: Record<string, string> = {};
    if (request.idempotencyKey) {
      headers['Idempotency-Key'] = request.idempotencyKey;
    }
    const body = await this.request<{ payment: CreatePaymentResponse }>(
      'POST',
      '/v1/payments',
      request,
      headers,
    );
    return body.payment;
  }

  async createSubscription(
    request: CreateSubscriptionRequest,
  ): Promise<SubscriptionState> {
    const body = await this.request<{ subscription: SubscriptionState }>(
      'POST',
      '/v1/subscriptions',
      request,
    );
    return body.subscription;
  }

  async updateSubscription(
    request: UpdateSubscriptionRequest,
  ): Promise<SubscriptionState> {
    const { subscriptionId, ...payload } = request;
    const body = await this.request<{ subscription: SubscriptionState }>(
      'PATCH',
      `/v1/subscriptions/${subscriptionId}`,
      payload,
    );
    return body.subscription;
  }

  async cancelSubscription(subscriptionId: string): Promise<SubscriptionState> {
    const body = await this.request<{ subscription: SubscriptionState }>(
      'POST',
      `/v1/subscriptions/${subscriptionId}/cancel`,
    );
    return body.subscription;
  }

  async getSubscriptionState(
    subscriptionId: string,
  ): Promise<SubscriptionState> {
    const body = await this.request<{ subscription: SubscriptionState }>(
      'GET',
      `/v1/subscriptions/${subscriptionId}`,
    );
    return body.subscription;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Simulator-Key': this.apiKey,
          ...extraHeaders,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await response.text();
      let parsed: T & ErrorBody;
      try {
        parsed = (text ? JSON.parse(text) : {}) as T & ErrorBody;
      } catch {
        parsed = { error: { message: text } } as T & ErrorBody;
      }
      if (!response.ok) {
        throw mapProviderError(response.status, parsed);
      }
      return parsed;
    } catch (err) {
      if (err instanceof AppError) {
        throw err;
      }
      throw new AppError(
        502,
        'PAYMENT_PROVIDER_ERROR',
        'Payment simulator request failed',
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

function mapProviderError(status: number, body: ErrorBody): AppError {
  const code = body.error?.code ?? 'PAYMENT_PROVIDER_ERROR';
  const message = body.error?.message ?? 'Payment simulator request failed';
  if (status === 400) {
    return AppError.badRequest(code, message);
  }
  if (status === 401) {
    return AppError.unauthorized(code, message);
  }
  if (status === 403) {
    return AppError.forbidden(code, message);
  }
  if (status === 404) {
    return AppError.notFound(code, message);
  }
  if (status === 409) {
    return AppError.conflict(code, message);
  }
  return new AppError(502, 'PAYMENT_PROVIDER_ERROR', message);
}

export function getPaymentGateway(): PaymentGateway {
  return new SimulatorPaymentGateway();
}

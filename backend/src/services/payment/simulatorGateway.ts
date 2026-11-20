import { env } from '../../config/env';
import {
  ProviderRejectedError,
  ProviderUnavailableError,
  type CreateCustomerRequest,
  type CreateCustomerResponse,
  type CreateSubscriptionRequest,
  type CreateSubscriptionResponse,
  type PaymentGateway,
} from './paymentGateway';

type ErrorBody = {
  error?: { code?: string; message?: string };
};

const REQUEST_TIMEOUT_MS = 10_000;

const REJECTED_CODES = new Set([
  'UNKNOWN_TOKEN',
  'RAW_CREDENTIALS_REJECTED',
  'TOKEN_REQUIRED',
]);

export class SimulatorPaymentGateway implements PaymentGateway {
  constructor(
    private readonly baseUrl: string = env.SIMULATOR_URL,
    private readonly apiKey: string = env.SIMULATOR_API_KEY,
  ) {}

  async createCustomer(
    request: CreateCustomerRequest,
  ): Promise<CreateCustomerResponse> {
    const body = await this.request<{ customer: CreateCustomerResponse }>(
      'POST',
      '/v1/customers',
      { email: request.email, name: request.name },
      { 'Idempotency-Key': request.idempotencyKey },
    );
    return body.customer;
  }

  async createSubscription(
    request: CreateSubscriptionRequest,
  ): Promise<CreateSubscriptionResponse> {
    const body = await this.request<{ subscription: CreateSubscriptionResponse }>(
      'POST',
      '/v1/subscriptions',
      {
        customerId: request.providerCustomerId,
        amount: request.amount,
        currency: request.currency,
        planPriceId: request.planPriceId,
        token: request.paymentToken,
        interval: request.interval,
        metadata: request.metadata,
      },
      { 'Idempotency-Key': request.idempotencyKey },
    );
    return body.subscription;
  }

  private async request<T>(
    method: string,
    path: string,
    body: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Simulator-Key': this.apiKey,
          ...extraHeaders,
        },
        body: JSON.stringify(body),
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
      if (
        err instanceof ProviderRejectedError ||
        err instanceof ProviderUnavailableError
      ) {
        throw err;
      }
      throw new ProviderUnavailableError('Payment simulator request failed');
    } finally {
      clearTimeout(timer);
    }
  }
}

function mapProviderError(status: number, body: ErrorBody): Error {
  const code = body.error?.code ?? 'PAYMENT_PROVIDER_ERROR';
  const message = body.error?.message ?? 'Payment simulator request failed';
  if (status >= 500) {
    return new ProviderUnavailableError(message);
  }
  if (REJECTED_CODES.has(code) || status === 400) {
    return new ProviderRejectedError(message);
  }
  return new ProviderUnavailableError(message);
}

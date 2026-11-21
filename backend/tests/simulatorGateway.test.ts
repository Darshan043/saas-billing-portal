import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../src/lib/errors';
import { SimulatorPaymentGateway } from '../src/modules/payments/simulatorPaymentGateway';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('SimulatorPaymentGateway', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates a customer and a payment through the PaymentGateway interface', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get('X-Simulator-Key')).toBe('test-key-123');
      if (String(url).endsWith('/v1/customers')) {
        return jsonResponse(201, {
          customer: {
            id: '11111111-1111-1111-1111-111111111111',
            email: 'a@b.test',
            name: 'Ada',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        });
      }
      return jsonResponse(201, {
        payment: {
          id: '22222222-2222-2222-2222-222222222222',
          customerId: '11111111-1111-1111-1111-111111111111',
          amount: 1000,
          currency: 'USD',
          status: 'succeeded',
          errorCode: null,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const gateway = new SimulatorPaymentGateway(
      'http://simulator:4100',
      'test-key-123',
      1000,
    );
    const customer = await gateway.createCustomer({
      email: 'a@b.test',
      name: 'Ada',
    });
    const payment = await gateway.createPayment({
      customerId: customer.id,
      amount: 1000,
      currency: 'USD',
      token: 'tok_sim_visa_ok',
    });
    expect(payment.status).toBe('succeeded');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('maps declined and insufficient-funds responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(201, {
          payment: {
            id: '22222222-2222-2222-2222-222222222222',
            customerId: '11111111-1111-1111-1111-111111111111',
            amount: 1000,
            currency: 'USD',
            status: 'declined',
            errorCode: 'CARD_DECLINED',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        }),
      ),
    );
    const gateway = new SimulatorPaymentGateway(
      'http://simulator:4100',
      'test-key-123',
      1000,
    );
    const payment = await gateway.createPayment({
      customerId: '11111111-1111-1111-1111-111111111111',
      amount: 1000,
      currency: 'USD',
      token: 'tok_sim_declined',
    });
    expect(payment.status).toBe('declined');
  });

  it('maps simulator 400 errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(400, {
          error: { code: 'UNKNOWN_TOKEN', message: 'Unknown simulator token' },
        }),
      ),
    );
    const gateway = new SimulatorPaymentGateway(
      'http://simulator:4100',
      'test-key-123',
      1000,
    );
    await expect(
      gateway.createPayment({
        customerId: '11111111-1111-1111-1111-111111111111',
        amount: 1000,
        currency: 'USD',
        token: 'nope',
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'UNKNOWN_TOKEN',
    } satisfies Partial<AppError>);
  });

  it('maps network failures to a provider error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );
    const gateway = new SimulatorPaymentGateway(
      'http://simulator:4100',
      'test-key-123',
      1000,
    );
    await expect(
      gateway.getSubscriptionState('11111111-1111-1111-1111-111111111111'),
    ).rejects.toMatchObject({
      statusCode: 502,
      code: 'PAYMENT_PROVIDER_ERROR',
    });
  });

  it('creates, updates, cancels, and reads a subscription', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method;
        const subscription = {
          id: '33333333-3333-3333-3333-333333333333',
          customerId: '11111111-1111-1111-1111-111111111111',
          status: method === 'POST' && String(url).includes('/cancel')
            ? 'canceled'
            : 'active',
          amount: 2000,
          currency: 'USD',
          planPriceId: 'price_1',
          canceledAt: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        };
        return jsonResponse(200, { subscription });
      }),
    );
    const gateway = new SimulatorPaymentGateway(
      'http://simulator:4100',
      'test-key-123',
      1000,
    );
    const created = await gateway.createSubscription({
      customerId: '11111111-1111-1111-1111-111111111111',
      amount: 2000,
      currency: 'USD',
    });
    const updated = await gateway.updateSubscription({
      subscriptionId: created.id,
      amount: 2000,
    });
    const canceled = await gateway.cancelSubscription(created.id);
    const state = await gateway.getSubscriptionState(created.id);
    expect(updated.id).toBe(created.id);
    expect(canceled.status).toBe('canceled');
    expect(state.id).toBe(created.id);
  });
});

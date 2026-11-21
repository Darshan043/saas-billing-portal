import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { periodDates } from '../src/lib/period';
import { prisma } from '../src/lib/prisma';
import { assertTestDatabase, TEST_DATABASE_NAME } from './dbSafety';
import {
  api,
  clearSimulatorData,
  createTestCustomer,
  importApp,
  stubWebhookFetch,
} from './helpers';

function deliveredEventTypes(
  fetchMock: ReturnType<typeof stubWebhookFetch>,
): string[] {
  return fetchMock.mock.calls
    .filter(([input]) => String(input).includes('/webhooks/payments'))
    .map(([, init]) => {
      const payload = JSON.parse(String(init?.body ?? '{}')) as { type?: string };
      return payload.type ?? '';
    });
}

function deliveredPayloads(
  fetchMock: ReturnType<typeof stubWebhookFetch>,
): Array<Record<string, unknown>> {
  return fetchMock.mock.calls
    .filter(([input]) => String(input).includes('/webhooks/payments'))
    .map(([, init]) => JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
}

async function expectTestDatabase(): Promise<void> {
  assertTestDatabase(process.env.DATABASE_URL);
  const rows = await prisma.$queryRaw<Array<{ current_database: string }>>`
    SELECT current_database()
  `;
  expect(rows[0]?.current_database).toBe(TEST_DATABASE_NAME);
}

describe('subscriptions', () => {
  beforeEach(async () => {
    await expectTestDatabase();
    await clearSimulatorData();
    stubWebhookFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await prisma.$disconnect();
  });

  it('creates, updates, retrieves, and cancels a subscription', async () => {
    const app = await importApp();
    const customerId = (await createTestCustomer(app)).body.customer.id;
    const created = await api(app).post('/v1/subscriptions').send({
      customerId,
      amount: 999,
      currency: 'USD',
      planPriceId: 'price_sim_starter',
    });
    expect(created.status).toBe(201);
    expect(created.body.subscription.status).toBe('active');

    const updated = await api(app)
      .patch(`/v1/subscriptions/${created.body.subscription.id}`)
      .send({ amount: 1999, planPriceId: 'price_sim_pro' });
    expect(updated.status).toBe(200);
    expect(updated.body.subscription.amount).toBe(1999);
    expect(updated.body.subscription.planPriceId).toBe('price_sim_pro');

    const got = await api(app).get(
      `/v1/subscriptions/${created.body.subscription.id}`,
    );
    expect(got.body.subscription.amount).toBe(1999);

    const canceled = await api(app).post(
      `/v1/subscriptions/${created.body.subscription.id}/cancel`,
    );
    expect(canceled.status).toBe(200);
    expect(canceled.body.subscription.status).toBe('canceled');
    expect(canceled.body.subscription.canceledAt).toBeTruthy();
  });

  it('returns 404 for an unknown subscription id', async () => {
    const app = await importApp();
    const res = await api(app).get(
      '/v1/subscriptions/11111111-1111-1111-1111-111111111111',
    );
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SUBSCRIPTION_NOT_FOUND');
  });

  it('rejects an invalid subscription id', async () => {
    const app = await importApp();
    const res = await api(app).get('/v1/subscriptions/not-a-uuid');
    expect(res.status).toBe(400);
  });

  it('emits subscription.activated only after a successful first payment', async () => {
    const fetchMock = stubWebhookFetch();
    const app = await importApp();
    const customerId = (await createTestCustomer(app)).body.customer.id;
    const metadata = {
      subscriptionId: crypto.randomUUID(),
      organizationId: crypto.randomUUID(),
    };

    const created = await api(app).post('/v1/subscriptions').send({
      customerId,
      amount: 900,
      currency: 'USD',
      planPriceId: 'price_sim_starter',
      token: 'tok_sim_visa_ok',
      interval: 'MONTH',
      metadata,
    });

    expect(created.status).toBe(201);
    expect(created.body.subscription.metadata).toEqual(metadata);
    expect(created.body.subscription.interval).toBe('MONTH');

    const types = deliveredEventTypes(fetchMock);
    const fromCreate = types.slice(types.indexOf('subscription.created'));
    expect(fromCreate[0]).toBe('subscription.created');
    expect(fromCreate).toContain('payment.succeeded');
    expect(fromCreate.at(-1)).toBe('subscription.activated');
    expect(
      types.filter((type) => type === 'subscription.activated'),
    ).toHaveLength(1);

    const createdEvent = deliveredPayloads(fetchMock).find(
      (event) => event.type === 'subscription.created',
    );
    const activated = deliveredPayloads(fetchMock).find(
      (event) => event.type === 'subscription.activated',
    );
    expect(createdEvent?.data).toMatchObject({ metadata });
    const data = activated?.data as {
      metadata: typeof metadata;
      currentPeriodStart: string;
      currentPeriodEnd: string;
    };
    expect(data.metadata).toEqual(metadata);
    const expected = periodDates('MONTH', new Date(data.currentPeriodStart));
    expect(data.currentPeriodEnd).toBe(expected.currentPeriodEnd.toISOString());
  });

  it('does not emit subscription.activated for a declined first payment', async () => {
    const fetchMock = stubWebhookFetch();
    const app = await importApp();
    const customerId = (await createTestCustomer(app)).body.customer.id;
    const metadata = {
      subscriptionId: crypto.randomUUID(),
      organizationId: crypto.randomUUID(),
    };

    const created = await api(app).post('/v1/subscriptions').send({
      customerId,
      amount: 900,
      currency: 'USD',
      token: 'tok_sim_declined',
      metadata,
    });
    expect(created.status).toBe(201);

    const types = deliveredEventTypes(fetchMock);
    expect(types).toContain('subscription.created');
    expect(types).toContain('payment.declined');
    expect(types).not.toContain('subscription.activated');

    const declined = deliveredPayloads(fetchMock).find(
      (event) => event.type === 'payment.declined',
    );
    expect(declined?.data).toMatchObject({
      errorCode: 'CARD_DECLINED',
      subscriptionId: created.body.subscription.id,
      metadata,
    });
  });

  it('includes metadata on insufficient-funds first-payment events', async () => {
    const fetchMock = stubWebhookFetch();
    const app = await importApp();
    const customerId = (await createTestCustomer(app)).body.customer.id;
    const metadata = {
      subscriptionId: crypto.randomUUID(),
      organizationId: crypto.randomUUID(),
    };

    const created = await api(app).post('/v1/subscriptions').send({
      customerId,
      amount: 2900,
      currency: 'USD',
      token: 'tok_sim_insufficient_funds',
      interval: 'YEAR',
      metadata,
    });
    expect(created.status).toBe(201);

    const types = deliveredEventTypes(fetchMock);
    expect(types).not.toContain('subscription.activated');
    const failed = deliveredPayloads(fetchMock).find(
      (event) => event.type === 'payment.insufficient_funds',
    );
    expect(failed?.data).toMatchObject({
      errorCode: 'INSUFFICIENT_FUNDS',
      subscriptionId: created.body.subscription.id,
      metadata,
    });
  });

  it('adds one year for YEAR interval period dates', () => {
    const start = new Date('2026-01-31T12:00:00.000Z');
    const { currentPeriodEnd } = periodDates('YEAR', start);
    expect(currentPeriodEnd.toISOString()).toBe('2027-01-31T12:00:00.000Z');
  });

  it('clamps month-end overflow to the last day of the target month', () => {
    const jan312026 = new Date('2026-01-31T12:00:00.000Z');
    expect(periodDates('MONTH', jan312026).currentPeriodEnd.toISOString()).toBe(
      '2026-02-28T12:00:00.000Z',
    );

    const jan312024 = new Date('2024-01-31T12:00:00.000Z');
    expect(periodDates('MONTH', jan312024).currentPeriodEnd.toISOString()).toBe(
      '2024-02-29T12:00:00.000Z',
    );

    const feb292024 = new Date('2024-02-29T12:00:00.000Z');
    expect(periodDates('YEAR', feb292024).currentPeriodEnd.toISOString()).toBe(
      '2025-02-28T12:00:00.000Z',
    );
  });
});

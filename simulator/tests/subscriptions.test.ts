import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { assertTestDatabase, TEST_DATABASE_NAME } from './dbSafety';
import {
  api,
  clearSimulatorData,
  createTestCustomer,
  importApp,
  stubWebhookFetch,
} from './helpers';

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
});

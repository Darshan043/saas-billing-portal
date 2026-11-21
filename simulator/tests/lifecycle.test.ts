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

function deliveredPayloads(
  fetchMock: ReturnType<typeof stubWebhookFetch>,
): Array<Record<string, unknown>> {
  return fetchMock.mock.calls
    .filter(([input]) => String(input).includes('/webhooks/payments'))
    .map(
      ([, init]) =>
        JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
    );
}

async function expectTestDatabase(): Promise<void> {
  assertTestDatabase(process.env.DATABASE_URL);
  const rows = await prisma.$queryRaw<Array<{ current_database: string }>>`
    SELECT current_database()
  `;
  expect(rows[0]?.current_database).toBe(TEST_DATABASE_NAME);
}

async function createActiveSub(app: Awaited<ReturnType<typeof importApp>>) {
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
  return { customerId, metadata, subscription: created.body.subscription };
}

describe('subscription lifecycle additions', () => {
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

  it('charges a prorated change-plan once per idempotency key and echoes metadata', async () => {
    const fetchMock = stubWebhookFetch();
    const app = await importApp();
    const { metadata, subscription } = await createActiveSub(app);
    fetchMock.mockClear();

    const description =
      'Upgrade from Starter to Pro (Monthly): prorated charge';
    const body = {
      planPriceId: 'price_sim_pro',
      amount: 2900,
      currency: 'USD',
      chargeAmount: 400,
      description,
      metadata: {
        ...metadata,
        reason: 'plan_upgrade',
        description,
        fromPlanPriceId: 'price_sim_starter',
        toPlanPriceId: 'price_sim_pro',
      },
    };
    const headers = { 'Idempotency-Key': 'sub-upgrade-test-1' };
    const first = await api(app)
      .post(`/v1/subscriptions/${subscription.id}/change-plan`)
      .set(headers)
      .send(body);
    expect(first.status).toBe(200);
    expect(first.body.subscription.planPriceId).toBe('price_sim_pro');
    expect(first.body.subscription.amount).toBe(2900);
    expect(first.body.subscription.status).toBe('active');

    const events = deliveredPayloads(fetchMock);
    const payments = events.filter((event) => event.type === 'payment.succeeded');
    expect(payments).toHaveLength(1);
    expect(payments[0]?.data).toMatchObject({
      amount: 400,
      description,
      metadata: {
        ...metadata,
        reason: 'plan_upgrade',
        description,
      },
    });
    expect(events.some((event) => event.type === 'subscription.updated')).toBe(
      true,
    );
    expect(events.some((event) => event.type === 'subscription.cancelled')).toBe(
      false,
    );

    fetchMock.mockClear();
    const second = await api(app)
      .post(`/v1/subscriptions/${subscription.id}/change-plan`)
      .set(headers)
      .send(body);
    expect(second.status).toBe(200);
    expect(second.body.subscription.planPriceId).toBe('price_sim_pro');
    expect(deliveredPayloads(fetchMock)).toHaveLength(0);
    expect(await prisma.payment.count()).toBe(2);
  });

  it('does not update the plan when the prorated charge is declined', async () => {
    const app = await importApp();
    const { subscription } = await createActiveSub(app);
    const res = await api(app)
      .post(`/v1/subscriptions/${subscription.id}/change-plan`)
      .send({
        planPriceId: 'price_sim_pro',
        amount: 2900,
        currency: 'USD',
        chargeAmount: 400,
        token: 'tok_sim_declined',
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PAYMENT_REJECTED');
    const stored = await prisma.subscription.findUniqueOrThrow({
      where: { id: subscription.id },
    });
    expect(stored.planPriceId).toBe('price_sim_starter');
    expect(stored.amount).toBe(900);
  });

  it('schedules and undoes cancel-at-period-end without ending the subscription', async () => {
    const fetchMock = stubWebhookFetch();
    const app = await importApp();
    const { subscription } = await createActiveSub(app);
    fetchMock.mockClear();

    const scheduled = await api(app)
      .post(`/v1/subscriptions/${subscription.id}/cancel-at-period-end`)
      .send({ value: true });
    expect(scheduled.status).toBe(200);
    expect(scheduled.body.subscription.status).toBe('active');
    expect(scheduled.body.subscription.cancelAtPeriodEnd).toBe(true);
    expect(scheduled.body.subscription.canceledAt).toBeNull();
    const afterSchedule = deliveredPayloads(fetchMock);
    expect(
      afterSchedule.some((event) => event.type === 'subscription.cancelled'),
    ).toBe(false);
    expect(
      afterSchedule.some((event) => event.type === 'subscription.updated'),
    ).toBe(true);

    fetchMock.mockClear();
    const undone = await api(app)
      .post(`/v1/subscriptions/${subscription.id}/cancel-at-period-end`)
      .send({ value: false });
    expect(undone.body.subscription.cancelAtPeriodEnd).toBe(false);
    expect(undone.body.subscription.status).toBe('active');
    expect(
      deliveredPayloads(fetchMock).some(
        (event) => event.type === 'subscription.cancelled',
      ),
    ).toBe(false);
  });

  it('pauses and resumes, keeping cancel as an ended event', async () => {
    const fetchMock = stubWebhookFetch();
    const app = await importApp();
    const { subscription } = await createActiveSub(app);

    const paused = await api(app).post(
      `/v1/subscriptions/${subscription.id}/pause`,
    );
    expect(paused.status).toBe(200);
    expect(paused.body.subscription.status).toBe('paused');
    expect(paused.body.subscription.pausedAt).toBeTruthy();

    const resumed = await api(app)
      .post(`/v1/subscriptions/${subscription.id}/resume`)
      .send({ currentPeriodEnd: '2026-12-31T00:00:00.000Z' });
    expect(resumed.status).toBe(200);
    expect(resumed.body.subscription.status).toBe('active');
    expect(resumed.body.subscription.pausedAt).toBeNull();
    expect(resumed.body.subscription.currentPeriodEnd).toBe(
      '2026-12-31T00:00:00.000Z',
    );

    fetchMock.mockClear();
    const canceled = await api(app).post(
      `/v1/subscriptions/${subscription.id}/cancel`,
    );
    expect(canceled.body.subscription.status).toBe('canceled');
    const types = deliveredPayloads(fetchMock).map((event) => event.type);
    expect(types).toContain('subscription.cancelled');
    expect(
      deliveredPayloads(fetchMock).find(
        (event) => event.type === 'subscription.cancelled',
      )?.data,
    ).toMatchObject({ status: 'canceled' });
  });
});

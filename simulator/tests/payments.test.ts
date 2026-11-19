import request from 'supertest';
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

describe('payments', () => {
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

  it('charges tok_sim_visa_ok as succeeded', async () => {
    const app = await importApp();
    const customerRes = await createTestCustomer(app);
    const customerId = customerRes.body.customer.id;
    const res = await api(app).post('/v1/payments').send({
      customerId,
      amount: 2599,
      currency: 'usd',
      token: 'tok_sim_visa_ok',
    });
    expect(res.status).toBe(201);
    expect(res.body.payment.status).toBe('succeeded');
    expect(res.body.payment.amount).toBe(2599);
    expect(res.body.payment.currency).toBe('USD');
    expect(res.body.payment.errorCode).toBeNull();
  });

  it('declines tok_sim_declined', async () => {
    const app = await importApp();
    const customerId = (await createTestCustomer(app)).body.customer.id;
    const res = await api(app).post('/v1/payments').send({
      customerId,
      amount: 1000,
      currency: 'USD',
      token: 'tok_sim_declined',
    });
    expect(res.status).toBe(201);
    expect(res.body.payment.status).toBe('declined');
    expect(res.body.payment.errorCode).toBe('CARD_DECLINED');
  });

  it('returns insufficient funds for tok_sim_insufficient_funds', async () => {
    const app = await importApp();
    const customerId = (await createTestCustomer(app)).body.customer.id;
    const res = await api(app).post('/v1/payments').send({
      customerId,
      amount: 1000,
      currency: 'USD',
      token: 'tok_sim_insufficient_funds',
    });
    expect(res.status).toBe(201);
    expect(res.body.payment.status).toBe('insufficient_funds');
    expect(res.body.payment.errorCode).toBe('INSUFFICIENT_FUNDS');
  });

  it('rejects unknown tokens', async () => {
    const app = await importApp();
    const customerId = (await createTestCustomer(app)).body.customer.id;
    const res = await api(app).post('/v1/payments').send({
      customerId,
      amount: 1000,
      currency: 'USD',
      token: 'tok_live_unknown',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNKNOWN_TOKEN');
  });

  it('rejects raw card numbers', async () => {
    const app = await importApp();
    const customerId = (await createTestCustomer(app)).body.customer.id;
    const res = await api(app).post('/v1/payments').send({
      customerId,
      amount: 1000,
      currency: 'USD',
      token: '4242424242424242',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('RAW_CREDENTIALS_REJECTED');
  });

  it('rejects CVV fields', async () => {
    const app = await importApp();
    const res = await api(app)
      .post('/v1/customers')
      .send({ email: 'cvv@simulator.test', name: 'No', cvv: '123' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('RAW_CREDENTIALS_REJECTED');
  });

  it('rejects invalid amounts', async () => {
    const app = await importApp();
    const customerId = (await createTestCustomer(app)).body.customer.id;
    const floatRes = await api(app).post('/v1/payments').send({
      customerId,
      amount: 10.5,
      currency: 'USD',
      token: 'tok_sim_visa_ok',
    });
    expect(floatRes.status).toBe(400);
    const zeroRes = await api(app).post('/v1/payments').send({
      customerId,
      amount: 0,
      currency: 'USD',
      token: 'tok_sim_visa_ok',
    });
    expect(zeroRes.status).toBe(400);
  });

  it('rejects invalid currency', async () => {
    const app = await importApp();
    const customerId = (await createTestCustomer(app)).body.customer.id;
    const res = await api(app).post('/v1/payments').send({
      customerId,
      amount: 1000,
      currency: 'BTC',
      token: 'tok_sim_visa_ok',
    });
    expect(res.status).toBe(400);
  });

  it('returns the original payment for a reused idempotency key', async () => {
    const app = await importApp();
    const customerId = (await createTestCustomer(app)).body.customer.id;
    const body = {
      customerId,
      amount: 1500,
      currency: 'USD',
      token: 'tok_sim_visa_ok',
      idempotencyKey: 'pay-1',
    };
    const first = await api(app).post('/v1/payments').send(body);
    const second = await api(app).post('/v1/payments').send(body);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.payment.id).toBe(first.body.payment.id);
    const count = await prisma.payment.count();
    expect(count).toBe(1);
  });

  it('requires an API key', async () => {
    const app = await importApp();
    const res = await request(app).post('/v1/payments').send({});
    expect(res.status).toBe(401);
  });

  it('retrieves and lists payments', async () => {
    const app = await importApp();
    const customerId = (await createTestCustomer(app)).body.customer.id;
    const created = await api(app).post('/v1/payments').send({
      customerId,
      amount: 500,
      currency: 'EUR',
      token: 'tok_sim_visa_ok',
    });
    const got = await api(app).get(`/v1/payments/${created.body.payment.id}`);
    expect(got.status).toBe(200);
    expect(got.body.payment.currency).toBe('EUR');
    const list = await api(app).get('/v1/payments').query({ customerId });
    expect(list.body.payments).toHaveLength(1);
  });

  it('persists simulator records independently', async () => {
    const app = await importApp();
    const customerId = (await createTestCustomer(app)).body.customer.id;
    await api(app).post('/v1/payments').send({
      customerId,
      amount: 700,
      currency: 'USD',
      token: 'tok_sim_visa_ok',
    });
    const tables = await prisma.$queryRaw<Array<{ relname: string }>>`
      SELECT relname FROM pg_class
      WHERE relname IN ('sim_payments', 'organizations', 'users')
        AND relkind = 'r'
    `;
    const names = tables.map((row) => row.relname);
    expect(names).toContain('sim_payments');
    expect(names).not.toContain('organizations');
    expect(names).not.toContain('users');
  });
});

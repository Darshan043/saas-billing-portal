import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { assertTestDatabase, TEST_DATABASE_NAME } from './dbSafety';
import {
  api,
  clearSimulatorData,
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

describe('customers', () => {
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

  it('returns the original customer for a reused Idempotency-Key', async () => {
    const app = await importApp();
    const organizationId = crypto.randomUUID();
    const key = `customer-create-${organizationId}`;
    const body = {
      email: `idem-${organizationId.slice(0, 8)}@simulator.test`,
      name: 'Idempotent Customer',
    };

    const first = await api(app)
      .post('/v1/customers')
      .set('Idempotency-Key', key)
      .send(body);
    const second = await api(app)
      .post('/v1/customers')
      .set('Idempotency-Key', key)
      .send(body);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.customer.id).toBe(first.body.customer.id);
    expect(await prisma.customer.count()).toBe(1);
    expect(await prisma.webhookEvent.count({ where: { type: 'customer.created' } })).toBe(
      1,
    );
  });

  it('rejects a reused key with different customer details', async () => {
    const app = await importApp();
    const key = `customer-create-${crypto.randomUUID()}`;
    const first = await api(app)
      .post('/v1/customers')
      .set('Idempotency-Key', key)
      .send({ email: 'same-key@simulator.test', name: 'First' });
    expect(first.status).toBe(201);

    const second = await api(app)
      .post('/v1/customers')
      .set('Idempotency-Key', key)
      .send({ email: 'other-key@simulator.test', name: 'Second' });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('rejects a concurrent request that reuses a key with different details', async () => {
    const app = await importApp();
    const key = `customer-create-${crypto.randomUUID()}`;
    const [first, second] = await Promise.all([
      api(app)
        .post('/v1/customers')
        .set('Idempotency-Key', key)
        .send({ email: 'concurrent-a@simulator.test', name: 'Customer A' }),
      api(app)
        .post('/v1/customers')
        .set('Idempotency-Key', key)
        .send({ email: 'concurrent-b@simulator.test', name: 'Customer B' }),
    ]);

    const created = first.status === 201 ? first : second;
    const rejected = first.status === 409 ? first : second;
    expect(created.status).toBe(201);
    expect(rejected.status).toBe(409);
    expect(rejected.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(await prisma.customer.count()).toBe(1);
    const stored = await prisma.customer.findFirstOrThrow();
    expect(stored.email).toBe(created.body.customer.email);
    expect(stored.name).toBe(created.body.customer.name);
  });

  it('creates one customer when concurrent requests share a key', async () => {
    const app = await importApp();
    const organizationId = crypto.randomUUID();
    const key = `customer-create-${organizationId}`;
    const body = {
      email: `race-${organizationId.slice(0, 8)}@simulator.test`,
      name: 'Race Customer',
    };

    const [first, second] = await Promise.all([
      api(app).post('/v1/customers').set('Idempotency-Key', key).send(body),
      api(app).post('/v1/customers').set('Idempotency-Key', key).send(body),
    ]);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.customer.id).toBe(second.body.customer.id);
    expect(await prisma.customer.count()).toBe(1);
  });
});

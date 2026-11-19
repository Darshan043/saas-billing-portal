import { WebhookEventStatus } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { env } from '../src/config/env';
import { prisma } from '../src/lib/prisma';
import { signPayload } from '../src/lib/webhookHmac';
import { assertTestDatabase, TEST_DATABASE_NAME } from './dbSafety';
import { importApp } from './helpers';

async function expectTestDatabase(): Promise<void> {
  assertTestDatabase(process.env.DATABASE_URL);
  const rows = await prisma.$queryRaw<Array<{ current_database: string }>>`
    SELECT current_database()
  `;
  expect(rows[0]?.current_database).toBe(TEST_DATABASE_NAME);
}

function eventPayload(id = crypto.randomUUID()) {
  return {
    id,
    type: 'payment.succeeded' as const,
    createdAt: new Date().toISOString(),
    objectId: crypto.randomUUID(),
    data: { paymentId: 'pay_sim', amount: 1000, currency: 'USD' },
  };
}

function signedHeaders(rawBody: string, eventId: string, timestamp?: string) {
  const ts = timestamp ?? Math.floor(Date.now() / 1000).toString();
  return {
    timestamp: ts,
    headers: {
      'Content-Type': 'application/json',
      'X-Simulator-Event-Id': eventId,
      'X-Simulator-Timestamp': ts,
      'X-Simulator-Signature': `v1=${signPayload(env.WEBHOOK_SIGNING_SECRET, ts, rawBody)}`,
    },
  };
}

describe('payment webhooks', () => {
  beforeEach(async () => {
    await expectTestDatabase();
    await prisma.auditLog.deleteMany();
    await prisma.webhookEvent.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('accepts a valid signed webhook once and acknowledges duplicates', async () => {
    const app = await importApp();
    const payload = eventPayload();
    const rawBody = JSON.stringify(payload);
    const { headers } = signedHeaders(rawBody, payload.id);
    const first = await request(app)
      .post('/webhooks/payments')
      .set(headers)
      .send(rawBody);
    expect(first.status).toBe(200);
    expect(first.body.duplicate).toBe(false);

    const second = await request(app)
      .post('/webhooks/payments')
      .set(headers)
      .send(rawBody);
    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);

    const stored = await prisma.webhookEvent.findMany();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.duplicateCount).toBe(1);
    expect(stored[0]?.status).toBe(WebhookEventStatus.PROCESSED);
    expect(stored[0]?.signatureValid).toBe(true);

    const billingPayments = await prisma.payment.count();
    const billingSubscriptions = await prisma.subscription.count();
    expect(billingPayments).toBe(0);
    expect(billingSubscriptions).toBe(0);
  });

  it('rejects an invalid signature', async () => {
    const app = await importApp();
    const payload = eventPayload();
    const rawBody = JSON.stringify(payload);
    const { headers } = signedHeaders(rawBody, payload.id);
    const res = await request(app)
      .post('/webhooks/payments')
      .set({ ...headers, 'X-Simulator-Signature': 'v1=' + 'ab'.repeat(32) })
      .send(rawBody);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('WEBHOOK_SIGNATURE_INVALID');
    const stored = await prisma.webhookEvent.findMany();
    expect(stored[0]?.signatureValid).toBe(false);
    expect(stored[0]?.providerEventId).toBeNull();
  });

  it('rejects a missing signature', async () => {
    const app = await importApp();
    const payload = eventPayload();
    const res = await request(app)
      .post('/webhooks/payments')
      .set({
        'Content-Type': 'application/json',
        'X-Simulator-Event-Id': payload.id,
        'X-Simulator-Timestamp': Math.floor(Date.now() / 1000).toString(),
      })
      .send(JSON.stringify(payload));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('WEBHOOK_HEADERS_REQUIRED');
  });

  it('rejects an expired timestamp', async () => {
    const app = await importApp();
    const payload = eventPayload();
    const rawBody = JSON.stringify(payload);
    const stale = (Math.floor(Date.now() / 1000) - 10_000).toString();
    const { headers } = signedHeaders(rawBody, payload.id, stale);
    const res = await request(app)
      .post('/webhooks/payments')
      .set(headers)
      .send(rawBody);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('WEBHOOK_TIMESTAMP_EXPIRED');
  });

  it('does not create BillingHub business records for simulator events', async () => {
    const app = await importApp();
    const payload = eventPayload();
    const rawBody = JSON.stringify(payload);
    const { headers } = signedHeaders(rawBody, payload.id);
    await request(app)
      .post('/webhooks/payments')
      .set(headers)
      .send(rawBody);
    const simTables = await prisma.$queryRaw<Array<{ relname: string }>>`
      SELECT relname FROM pg_class
      WHERE relname IN ('sim_payments', 'sim_customers', 'webhook_events')
        AND relkind = 'r'
    `;
    const names = simTables.map((row) => row.relname);
    expect(names).toContain('webhook_events');
    expect(names).not.toContain('sim_payments');
    expect(names).not.toContain('sim_customers');
  });
});

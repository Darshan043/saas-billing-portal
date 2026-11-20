import { WebhookEventStatus } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { env } from '../src/config/env';
import { prisma } from '../src/lib/prisma';
import { computeWebhookSignature } from '../src/lib/webhookSignature';
import { assertTestDatabase, TEST_DATABASE_NAME } from './dbSafety';
import {
  TEST_PASSWORD,
  createTestUser,
  importApp,
} from './helpers';

async function expectTestDatabase(): Promise<void> {
  assertTestDatabase(process.env.DATABASE_URL);
  const rows = await prisma.$queryRaw<Array<{ current_database: string }>>`
    SELECT current_database()
  `;
  expect(rows[0]?.current_database).toBe(TEST_DATABASE_NAME);
}

function eventPayload(id = crypto.randomUUID(), type = 'payment.succeeded') {
  return {
    id,
    type,
    createdAt: new Date().toISOString(),
    objectId: crypto.randomUUID(),
    data: { paymentId: 'pay_sim', amount: 1000, currency: 'USD' },
  };
}

function signedHeaders(rawBody: string, timestamp?: string) {
  const ts = timestamp ?? Math.floor(Date.now() / 1000).toString();
  return {
    timestamp: ts,
    headers: {
      'Content-Type': 'application/json',
      'X-Simulator-Timestamp': ts,
      'X-Simulator-Signature': `v1=${computeWebhookSignature(env.WEBHOOK_SIGNING_SECRET, ts, rawBody)}`,
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

  it('stores a valid signed event as RECEIVED', async () => {
    const app = await importApp();
    const payload = eventPayload();
    const rawBody = JSON.stringify(payload);
    const { headers } = signedHeaders(rawBody);
    const res = await request(app)
      .post('/webhooks/payments')
      .set(headers)
      .send(rawBody);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, duplicate: false });
    expect(JSON.stringify(res.body)).not.toContain(env.WEBHOOK_SIGNING_SECRET);

    const stored = await prisma.webhookEvent.findMany();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.providerEventId).toBe(payload.id);
    expect(stored[0]?.status).toBe(WebhookEventStatus.RECEIVED);
    expect(stored[0]?.signatureValid).toBe(true);
    expect(stored[0]?.duplicateCount).toBe(0);
    expect(stored[0]?.rawBody).toBeNull();
    expect(stored[0]?.payload).toMatchObject(payload);
  });

  it('treats the same event sent 5 times as one row with four duplicates', async () => {
    const app = await importApp();
    const payload = eventPayload();
    const rawBody = JSON.stringify(payload);
    const { headers } = signedHeaders(rawBody);

    const responses = [];
    for (let i = 0; i < 5; i += 1) {
      responses.push(
        await request(app)
          .post('/webhooks/payments')
          .set(headers)
          .send(rawBody),
      );
    }

    expect(responses.every((res) => res.status === 200)).toBe(true);
    expect(responses[0]?.body).toEqual({ received: true, duplicate: false });
    expect(
      responses.slice(1).every((res) => res.body.duplicate === true),
    ).toBe(true);

    const stored = await prisma.webhookEvent.findMany();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.duplicateCount).toBe(4);
    expect(stored[0]?.status).toBe(WebhookEventStatus.RECEIVED);
  });

  it('counts concurrent duplicate deliveries with the unique constraint', async () => {
    const app = await importApp();
    const payload = eventPayload();
    const rawBody = JSON.stringify(payload);
    const { headers } = signedHeaders(rawBody);

    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(app).post('/webhooks/payments').set(headers).send(rawBody),
      ),
    );

    expect(responses.every((res) => res.status === 200)).toBe(true);
    expect(responses.every((res) => res.body.received === true)).toBe(true);
    expect(responses.filter((res) => res.body.duplicate === false)).toHaveLength(
      1,
    );
    expect(responses.filter((res) => res.body.duplicate === true)).toHaveLength(
      9,
    );

    const stored = await prisma.webhookEvent.findMany();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.duplicateCount).toBe(9);
    expect(stored[0]?.status).toBe(WebhookEventStatus.RECEIVED);
  });

  it('rejects a tampered body and does not create a RECEIVED row', async () => {
    const app = await importApp();
    const payload = eventPayload();
    const rawBody = JSON.stringify(payload);
    const { headers } = signedHeaders(rawBody);
    const tampered = rawBody.replace('1000', '1001');
    const res = await request(app)
      .post('/webhooks/payments')
      .set(headers)
      .send(tampered);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_SIGNATURE');
    expect(res.body.error.message).toBe(
      'Webhook signature verification failed',
    );
    expect(JSON.stringify(res.body)).not.toContain(env.WEBHOOK_SIGNING_SECRET);

    const stored = await prisma.webhookEvent.findMany();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.status).toBe(WebhookEventStatus.REJECTED);
    expect(stored[0]?.signatureValid).toBe(false);
    expect(stored[0]?.providerEventId).toBeNull();
    expect(
      await prisma.webhookEvent.count({
        where: { providerEventId: payload.id },
      }),
    ).toBe(0);
  });

  it('rejects a missing signature header', async () => {
    const app = await importApp();
    const payload = eventPayload();
    const rawBody = JSON.stringify(payload);
    const res = await request(app)
      .post('/webhooks/payments')
      .set('Content-Type', 'application/json')
      .set(
        'X-Simulator-Timestamp',
        Math.floor(Date.now() / 1000).toString(),
      )
      .send(rawBody);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_SIGNATURE');
  });

  it('rejects an expired timestamp', async () => {
    const app = await importApp();
    const payload = eventPayload();
    const rawBody = JSON.stringify(payload);
    const stale = (Math.floor(Date.now() / 1000) - 10_000).toString();
    const { headers } = signedHeaders(rawBody, stale);
    const res = await request(app)
      .post('/webhooks/payments')
      .set(headers)
      .send(rawBody);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_SIGNATURE');
  });

  it('rejects a signature from the wrong secret', async () => {
    const app = await importApp();
    const payload = eventPayload();
    const rawBody = JSON.stringify(payload);
    const ts = Math.floor(Date.now() / 1000).toString();
    const res = await request(app)
      .post('/webhooks/payments')
      .set('Content-Type', 'application/json')
      .set('X-Simulator-Timestamp', ts)
      .set(
        'X-Simulator-Signature',
        `v1=${computeWebhookSignature('wrong-secret-value-xx', ts, rawBody)}`,
      )
      .send(rawBody);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_SIGNATURE');
  });

  it('rejects valid signatures with invalid JSON or a missing event id', async () => {
    const app = await importApp();
    const ts = Math.floor(Date.now() / 1000).toString();
    const invalidJson = '{"id":';
    const invalidJsonRes = await request(app)
      .post('/webhooks/payments')
      .set('Content-Type', 'application/json')
      .set('X-Simulator-Timestamp', ts)
      .set(
        'X-Simulator-Signature',
        `v1=${computeWebhookSignature(env.WEBHOOK_SIGNING_SECRET, ts, invalidJson)}`,
      )
      .send(invalidJson);
    expect(invalidJsonRes.status).toBe(400);
    expect(invalidJsonRes.body.error.code).toBe('INVALID_PAYLOAD');

    const missingId = JSON.stringify({
      type: 'payment.succeeded',
      data: { ok: true },
    });
    const missingIdRes = await request(app)
      .post('/webhooks/payments')
      .set('Content-Type', 'application/json')
      .set('X-Simulator-Timestamp', ts)
      .set(
        'X-Simulator-Signature',
        `v1=${computeWebhookSignature(env.WEBHOOK_SIGNING_SECRET, ts, missingId)}`,
      )
      .send(missingId);
    expect(missingIdRes.status).toBe(400);
    expect(missingIdRes.body.error.code).toBe('INVALID_PAYLOAD');

    const rejected = await prisma.webhookEvent.findMany({
      where: { status: WebhookEventStatus.REJECTED },
    });
    expect(rejected).toHaveLength(2);
    expect(rejected.every((row) => row.signatureValid)).toBe(true);
    expect(rejected.every((row) => row.providerEventId === null)).toBe(true);
  });

  it('stores two different events as two rows', async () => {
    const app = await importApp();
    const first = eventPayload();
    const second = eventPayload();
    for (const payload of [first, second]) {
      const rawBody = JSON.stringify(payload);
      const { headers } = signedHeaders(rawBody);
      const res = await request(app)
        .post('/webhooks/payments')
        .set(headers)
        .send(rawBody);
      expect(res.status).toBe(200);
      expect(res.body.duplicate).toBe(false);
    }
    expect(await prisma.webhookEvent.count()).toBe(2);
  });

  it('stores an unknown event type with status RECEIVED', async () => {
    const app = await importApp();
    const payload = eventPayload(crypto.randomUUID(), 'billing.future_event');
    const rawBody = JSON.stringify(payload);
    const { headers } = signedHeaders(rawBody);
    const res = await request(app)
      .post('/webhooks/payments')
      .set(headers)
      .send(rawBody);
    expect(res.status).toBe(200);
    const stored = await prisma.webhookEvent.findFirstOrThrow();
    expect(stored.type).toBe('billing.future_event');
    expect(stored.status).toBe(WebhookEventStatus.RECEIVED);
  });

  it('rejects a body larger than 1mb', async () => {
    const app = await importApp();
    const huge = 'x'.repeat(1024 * 1024 + 1);
    const res = await request(app)
      .post('/webhooks/payments')
      .set('Content-Type', 'application/json')
      .send(huge);
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('truncates rejected rawBody to 10,000 characters', async () => {
    const app = await importApp();
    const rawBody = `{"broken":"${'a'.repeat(12_000)}"`;
    const { headers } = signedHeaders(rawBody);
    const res = await request(app)
      .post('/webhooks/payments')
      .set({ ...headers, 'X-Simulator-Signature': 'v1=' + 'ab'.repeat(32) })
      .send(rawBody);
    expect(res.status).toBe(400);
    const stored = await prisma.webhookEvent.findFirstOrThrow();
    expect(stored.status).toBe(WebhookEventStatus.REJECTED);
    expect(stored.rawBody).toHaveLength(10_000);
  });

  it('still parses JSON on POST /auth/login and accepts webhooks without a cookie', async () => {
    const app = await importApp();
    const email = `webhook-login-${crypto.randomUUID()}@example.com`;
    await createTestUser({ email, withOrganization: true });
    const loginRes = await request(app).post('/auth/login').send({
      email,
      password: TEST_PASSWORD,
    });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.user.email).toBe(email);

    const payload = eventPayload();
    const rawBody = JSON.stringify(payload);
    const { headers } = signedHeaders(rawBody);
    const webhookRes = await request(app)
      .post('/webhooks/payments')
      .set(headers)
      .send(rawBody);
    expect(webhookRes.status).toBe(200);
    expect(webhookRes.body).toEqual({ received: true, duplicate: false });
    expect(JSON.stringify(webhookRes.body)).not.toContain(
      env.WEBHOOK_SIGNING_SECRET,
    );
  });
});

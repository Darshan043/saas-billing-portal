import { DeliveryReason, DeliveryStatus, WebhookStatus } from '@prisma/client';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../src/config/env';
import { parseSignatureHeader, signPayload } from '../src/lib/hmac';
import { prisma } from '../src/lib/prisma';
import {
  duplicateEvent,
  emitEvent,
  processDueEvents,
  replayEvent,
} from '../src/modules/webhooks/webhook.service';
import { assertTestDatabase, TEST_DATABASE_NAME } from './dbSafety';
import {
  api,
  clearSimulatorData,
  control,
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

describe('webhooks', () => {
  beforeEach(async () => {
    await expectTestDatabase();
    await clearSimulatorData();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await prisma.$disconnect();
  });

  it('signs deliveries with HMAC-SHA256 and stable event ids', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      const timestamp = headers.get('X-Simulator-Timestamp') ?? '';
      const eventId = headers.get('X-Simulator-Event-Id') ?? '';
      const signature = parseSignatureHeader(
        headers.get('X-Simulator-Signature') ?? undefined,
      );
      const rawBody = String(init?.body ?? '');
      const expected = signPayload(env.WEBHOOK_SIGNING_SECRET, timestamp, rawBody);
      expect(signature).toBe(expected);
      expect(eventId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      const payload = JSON.parse(rawBody) as { id: string; type: string };
      expect(payload.id).toBe(eventId);
      expect(payload.type).toBeTruthy();
      expect(url).toBe(env.BACKEND_WEBHOOK_URL);
      return new Response('{"ok":true}', { status: 200 });
    });
    stubWebhookFetch(async (url, init) => fetchMock(url, init));

    const app = await importApp();
    const customerId = (await createTestCustomer(app)).body.customer.id;
    await api(app).post('/v1/payments').send({
      customerId,
      amount: 1000,
      currency: 'USD',
      token: 'tok_sim_visa_ok',
    });
    expect(fetchMock).toHaveBeenCalled();
    const events = await prisma.webhookEvent.findMany();
    expect(events.some((event) => event.type === 'payment.succeeded')).toBe(
      true,
    );
    expect(events.every((event) => event.status === WebhookStatus.DELIVERED)).toBe(
      true,
    );
  });

  it('records failed delivery and retries until success', async () => {
    let calls = 0;
    stubWebhookFetch(async () => {
      calls += 1;
      if (calls === 1) {
        return new Response('nope', { status: 500 });
      }
      return new Response('{"ok":true}', { status: 200 });
    });
    const eventId = await emitEvent('payment.declined', 'obj-1', {
      paymentId: 'obj-1',
    });
    const afterFirst = await prisma.webhookEvent.findUniqueOrThrow({
      where: { id: eventId },
    });
    expect(afterFirst.status).toBe(WebhookStatus.PENDING);
    expect(afterFirst.attempts).toBe(1);
    expect(afterFirst.nextRetryAt).toBeTruthy();

    await prisma.webhookEvent.update({
      where: { id: eventId },
      data: { nextRetryAt: new Date(Date.now() - 1000) },
    });
    await processDueEvents();
    const afterRetry = await prisma.webhookEvent.findUniqueOrThrow({
      where: { id: eventId },
    });
    expect(afterRetry.status).toBe(WebhookStatus.DELIVERED);
    expect(afterRetry.attempts).toBe(2);
    const deliveries = await prisma.webhookDelivery.findMany({
      where: { eventId },
      orderBy: { attemptNumber: 'asc' },
    });
    expect(deliveries).toHaveLength(2);
    expect(deliveries[0]?.reason).toBe(DeliveryReason.INITIAL);
    expect(deliveries[1]?.reason).toBe(DeliveryReason.RETRY);
  });

  it('stops after the maximum retry count', async () => {
    stubWebhookFetch(async () => new Response('down', { status: 503 }));
    const eventId = await emitEvent('invoice.payment_failed', 'obj-2', {});
    for (let i = 0; i < env.WEBHOOK_MAX_ATTEMPTS; i += 1) {
      await prisma.webhookEvent.update({
        where: { id: eventId },
        data: { nextRetryAt: new Date(Date.now() - 1000) },
      });
      await processDueEvents();
    }
    const failed = await prisma.webhookEvent.findUniqueOrThrow({
      where: { id: eventId },
    });
    expect(failed.status).toBe(WebhookStatus.FAILED);
    expect(failed.attempts).toBe(env.WEBHOOK_MAX_ATTEMPTS);
    const extra = await processDueEvents();
    expect(extra).toBe(0);
  });

  it('keeps the event after a failed delivery', async () => {
    stubWebhookFetch(async () => {
      throw new Error('network down');
    });
    const eventId = await emitEvent('customer.created', 'cust-1', {});
    const persisted = await prisma.webhookEvent.findUnique({
      where: { id: eventId },
    });
    expect(persisted).toBeTruthy();
    expect(persisted?.status).toBe(WebhookStatus.PENDING);
    const deliveries = await prisma.webhookDelivery.findMany({
      where: { eventId },
    });
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.status).toBe(DeliveryStatus.FAILED);
  });

  it('replays an event with the same id and records a new attempt', async () => {
    stubWebhookFetch();
    const eventId = await emitEvent('subscription.created', 'sub-1', {});
    await replayEvent(eventId);
    const deliveries = await prisma.webhookDelivery.findMany({
      where: { eventId },
      orderBy: { attemptNumber: 'asc' },
    });
    expect(deliveries.map((item) => item.reason)).toEqual([
      DeliveryReason.INITIAL,
      DeliveryReason.REPLAY,
    ]);
    const event = await prisma.webhookEvent.findUniqueOrThrow({
      where: { id: eventId },
    });
    expect(event.id).toBe(eventId);
  });

  it('sends a duplicate delivery with the same event id', async () => {
    stubWebhookFetch();
    const eventId = await emitEvent('subscription.updated', 'sub-2', {});
    await duplicateEvent(eventId);
    const deliveries = await prisma.webhookDelivery.findMany({
      where: { eventId },
    });
    expect(deliveries.some((item) => item.reason === DeliveryReason.DUPLICATE)).toBe(
      true,
    );
  });

  it('forces the next delivery to fail without changing payment records', async () => {
    stubWebhookFetch();
    const app = await importApp();
    const customerId = (await createTestCustomer(app)).body.customer.id;
    const payment = await api(app).post('/v1/payments').send({
      customerId,
      amount: 2200,
      currency: 'USD',
      token: 'tok_sim_visa_ok',
    });
    const fail = await control(app).post('/sim/events/fail-next').send({});
    expect(fail.status).toBe(200);
    const event = await prisma.webhookEvent.findFirstOrThrow({
      where: { type: 'payment.succeeded' },
    });
    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: { nextRetryAt: new Date(Date.now() - 1000), status: 'PENDING' },
    });
    await processDueEvents();
    const deliveries = await prisma.webhookDelivery.findMany({
      where: { eventId: event.id },
    });
    expect(
      deliveries.some((item) => item.status === DeliveryStatus.FORCED_FAIL),
    ).toBe(true);
    const unchanged = await prisma.payment.findUniqueOrThrow({
      where: { id: payment.body.payment.id },
    });
    expect(unchanged.status).toBe('SUCCEEDED');
    expect(unchanged.amount).toBe(2200);
  });

  it('protects manual controls with the control token', async () => {
    const app = await importApp();
    const res = await api(app).post('/sim/events/fail-next').send({});
    expect(res.status).toBe(401);
  });
});

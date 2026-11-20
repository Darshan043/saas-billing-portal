import {
  BillingInterval,
  MembershipRole,
  PaymentStatus,
  SubscriptionStatus,
  UserRole,
  WebhookEventStatus,
} from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../src/config/env';
import { createRegistry } from '../src/jobs/handlers';
import { registerCheckoutHandlers } from '../src/jobs/handlers/checkout';
import { registerInvoiceHandlers } from '../src/jobs/handlers/paymentSucceeded';
import { registerStubHandlers } from '../src/jobs/handlers/stubs';
import { createWebhookProcessor } from '../src/jobs/webhookProcessor';
import { enqueueWebhookEvent } from '../src/jobs/enqueue';
import { prisma } from '../src/lib/prisma';
import { computeWebhookSignature } from '../src/lib/webhookSignature';
import { assertTestDatabase, TEST_DATABASE_NAME } from './dbSafety';
import {
  clearTestPlans,
  clearTestUsersAndOrgs,
  createTestUser,
  importApp,
  loginAs,
} from './helpers';

vi.mock('../src/jobs/enqueue', () => ({
  enqueueWebhookEvent: vi.fn().mockResolvedValue('job-id'),
}));

async function expectTestDatabase(): Promise<void> {
  assertTestDatabase(process.env.DATABASE_URL);
  const rows = await prisma.$queryRaw<Array<{ current_database: string }>>`
    SELECT current_database()
  `;
  expect(rows[0]?.current_database).toBe(TEST_DATABASE_NAME);
}

function invoiceRegistry() {
  const registry = createRegistry();
  registerStubHandlers(registry);
  registerCheckoutHandlers(registry);
  registerInvoiceHandlers(registry);
  return registry;
}

function signedHeaders(rawBody: string) {
  const ts = Math.floor(Date.now() / 1000).toString();
  return {
    'Content-Type': 'application/json',
    'X-Simulator-Timestamp': ts,
    'X-Simulator-Signature': `v1=${computeWebhookSignature(env.WEBHOOK_SIGNING_SECRET, ts, rawBody)}`,
  };
}

function assertNoProviderIds(value: unknown): void {
  const json = JSON.stringify(value);
  expect(json).not.toContain('providerPaymentId');
  expect(json).not.toContain('providerInvoiceId');
  expect(json).not.toContain('providerCustomerId');
}

async function cookieFor(emailAddress: string): Promise<string> {
  const app = await importApp();
  const { cookie } = await loginAs(app, emailAddress);
  expect(cookie).toBeTruthy();
  return cookie as string;
}

async function seedPlan() {
  const plan = await prisma.plan.create({
    data: {
      name: `Plan ${crypto.randomUUID()}`,
      description: 'Test plan',
      features: ['A'],
      usageLimit: 10,
      isActive: true,
      sortOrder: 1,
    },
  });
  const month = await prisma.planPrice.create({
    data: {
      planId: plan.id,
      interval: BillingInterval.MONTH,
      amount: 2900,
      currency: 'USD',
      isActive: true,
    },
  });
  return month;
}

async function processSucceeded(input: {
  organizationId: string;
  subscriptionId: string;
  amount: number;
  paymentId?: string;
}) {
  const processWebhookEvent = createWebhookProcessor(invoiceRegistry());
  const event = await prisma.webhookEvent.create({
    data: {
      type: 'payment.succeeded',
      payload: {
        id: crypto.randomUUID(),
        type: 'payment.succeeded',
        createdAt: new Date().toISOString(),
        objectId: crypto.randomUUID(),
        data: {
          paymentId: input.paymentId ?? crypto.randomUUID(),
          amount: input.amount,
          currency: 'USD',
          metadata: {
            subscriptionId: input.subscriptionId,
            organizationId: input.organizationId,
          },
        },
      },
      signatureValid: true,
      status: WebhookEventStatus.RECEIVED,
    },
  });
  await processWebhookEvent(event.id);
}

describe('invoices and payments API', () => {
  beforeEach(async () => {
    await expectTestDatabase();
    await clearTestUsersAndOrgs();
    await clearTestPlans();
    vi.mocked(enqueueWebhookEvent).mockClear();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('stores one webhook row for 10 identical signed bodies and one invoice after process', async () => {
    const app = await importApp();
    const { organization } = await createTestUser({
      email: `api-${crypto.randomUUID()}@example.test`,
      withOrganization: true,
    });
    const month = await seedPlan();
    const subscription = await prisma.subscription.create({
      data: {
        organizationId: organization!.id,
        planPriceId: month.id,
        status: SubscriptionStatus.PENDING,
      },
    });
    const payload = {
      id: crypto.randomUUID(),
      type: 'payment.succeeded',
      createdAt: new Date().toISOString(),
      objectId: crypto.randomUUID(),
      data: {
        paymentId: crypto.randomUUID(),
        amount: 2900,
        currency: 'USD',
        metadata: {
          subscriptionId: subscription.id,
          organizationId: organization!.id,
        },
      },
    };
    const rawBody = JSON.stringify(payload);
    const headers = signedHeaders(rawBody);
    for (let i = 0; i < 10; i += 1) {
      const res = await request(app)
        .post('/webhooks/payments')
        .set(headers)
        .send(rawBody);
      expect(res.status).toBe(200);
    }
    const rows = await prisma.webhookEvent.findMany({
      where: { providerEventId: payload.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.duplicateCount).toBe(9);

    const processWebhookEvent = createWebhookProcessor(invoiceRegistry());
    await processWebhookEvent(rows[0]!.id);
    expect(await prisma.invoice.count()).toBe(1);
    expect(await prisma.payment.count()).toBe(1);
  });

  it('lists only my invoices newest first and rejects bad pagination', async () => {
    const app = await importApp();
    const mine = await createTestUser({
      email: `api-${crypto.randomUUID()}@example.test`,
      withOrganization: true,
    });
    const other = await createTestUser({
      email: `api-${crypto.randomUUID()}@example.test`,
      withOrganization: true,
    });
    const month = await seedPlan();
    const mySub = await prisma.subscription.create({
      data: {
        organizationId: mine.organization!.id,
        planPriceId: month.id,
        status: SubscriptionStatus.PENDING,
      },
    });
    const otherSub = await prisma.subscription.create({
      data: {
        organizationId: other.organization!.id,
        planPriceId: month.id,
        status: SubscriptionStatus.PENDING,
      },
    });
    await processSucceeded({
      organizationId: other.organization!.id,
      subscriptionId: otherSub.id,
      amount: 100,
    });
    await processSucceeded({
      organizationId: mine.organization!.id,
      subscriptionId: mySub.id,
      amount: 200,
    });
    await processSucceeded({
      organizationId: mine.organization!.id,
      subscriptionId: mySub.id,
      amount: 300,
    });
    const cookie = await cookieFor(mine.user.email);
    const res = await request(app)
      .get('/invoices?page=1&pageSize=10')
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.totalItems).toBe(2);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(10);
    expect(res.body.totalPages).toBe(1);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0].total).toBe(300);
    expect(res.body.items[1].total).toBe(200);
    assertNoProviderIds(res.body);

    const badSize = await request(app)
      .get('/invoices?pageSize=51')
      .set('Cookie', cookie);
    expect(badSize.status).toBe(400);
    const badPage = await request(app)
      .get('/invoices?page=0')
      .set('Cookie', cookie);
    expect(badPage.status).toBe(400);
  });

  it('returns invoice detail, 400 for a bad id, and 404 for unknown or foreign ids', async () => {
    const app = await importApp();
    const mine = await createTestUser({
      email: `api-${crypto.randomUUID()}@example.test`,
      withOrganization: true,
    });
    const other = await createTestUser({
      email: `api-${crypto.randomUUID()}@example.test`,
      withOrganization: true,
    });
    const month = await seedPlan();
    const mySub = await prisma.subscription.create({
      data: {
        organizationId: mine.organization!.id,
        planPriceId: month.id,
        status: SubscriptionStatus.PENDING,
      },
    });
    const otherSub = await prisma.subscription.create({
      data: {
        organizationId: other.organization!.id,
        planPriceId: month.id,
        status: SubscriptionStatus.PENDING,
      },
    });
    await processSucceeded({
      organizationId: mine.organization!.id,
      subscriptionId: mySub.id,
      amount: 2900,
    });
    await processSucceeded({
      organizationId: other.organization!.id,
      subscriptionId: otherSub.id,
      amount: 500,
    });
    const mineInvoice = await prisma.invoice.findFirstOrThrow({
      where: { organizationId: mine.organization!.id },
    });
    const otherInvoice = await prisma.invoice.findFirstOrThrow({
      where: { organizationId: other.organization!.id },
    });
    const cookie = await cookieFor(mine.user.email);

    const detail = await request(app)
      .get(`/invoices/${mineInvoice.id}`)
      .set('Cookie', cookie);
    expect(detail.status).toBe(200);
    expect(detail.body.invoice.displayNumber).toBe('INV-000001');
    expect(detail.body.invoice.items).toHaveLength(1);
    expect(detail.body.invoice.organization.name).toBe(mine.organization!.name);
    expect(detail.body.invoice.payment.status).toBe('SUCCEEDED');
    assertNoProviderIds(detail.body);

    const malformed = await request(app)
      .get('/invoices/not-a-uuid')
      .set('Cookie', cookie);
    expect(malformed.status).toBe(400);
    const foreign = await request(app)
      .get(`/invoices/${otherInvoice.id}`)
      .set('Cookie', cookie);
    expect(foreign.status).toBe(404);
    const missing = await request(app)
      .get(`/invoices/${crypto.randomUUID()}`)
      .set('Cookie', cookie);
    expect(missing.status).toBe(404);
  });

  it('isolates invoices, payments, detail, and PDF across organizations', async () => {
    const app = await importApp();
    const a = await createTestUser({
      email: `api-${crypto.randomUUID()}@example.test`,
      withOrganization: true,
    });
    const b = await createTestUser({
      email: `api-${crypto.randomUUID()}@example.test`,
      withOrganization: true,
    });
    const month = await seedPlan();
    const subA = await prisma.subscription.create({
      data: {
        organizationId: a.organization!.id,
        planPriceId: month.id,
        status: SubscriptionStatus.PENDING,
      },
    });
    const subB = await prisma.subscription.create({
      data: {
        organizationId: b.organization!.id,
        planPriceId: month.id,
        status: SubscriptionStatus.PENDING,
      },
    });
    await processSucceeded({
      organizationId: a.organization!.id,
      subscriptionId: subA.id,
      amount: 111,
    });
    await processSucceeded({
      organizationId: b.organization!.id,
      subscriptionId: subB.id,
      amount: 222,
    });
    const invoiceB = await prisma.invoice.findFirstOrThrow({
      where: { organizationId: b.organization!.id },
    });
    const cookieA = await cookieFor(a.user.email);
    const invoices = await request(app).get('/invoices').set('Cookie', cookieA);
    expect(invoices.body.items).toHaveLength(1);
    expect(invoices.body.items[0].total).toBe(111);
    const payments = await request(app).get('/payments').set('Cookie', cookieA);
    expect(payments.body.items).toHaveLength(1);
    expect(payments.body.items[0].amount).toBe(111);
    expect(
      (
        await request(app)
          .get(`/invoices/${invoiceB.id}`)
          .set('Cookie', cookieA)
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .get(`/invoices/${invoiceB.id}/pdf`)
          .set('Cookie', cookieA)
      ).status,
    ).toBe(404);
  });

  it('downloads a PDF and rejects unauthenticated or foreign access', async () => {
    const app = await importApp();
    const mine = await createTestUser({
      email: `api-${crypto.randomUUID()}@example.test`,
      withOrganization: true,
    });
    const other = await createTestUser({
      email: `api-${crypto.randomUUID()}@example.test`,
      withOrganization: true,
    });
    const month = await seedPlan();
    const mySub = await prisma.subscription.create({
      data: {
        organizationId: mine.organization!.id,
        planPriceId: month.id,
        status: SubscriptionStatus.PENDING,
      },
    });
    const otherSub = await prisma.subscription.create({
      data: {
        organizationId: other.organization!.id,
        planPriceId: month.id,
        status: SubscriptionStatus.PENDING,
      },
    });
    await processSucceeded({
      organizationId: mine.organization!.id,
      subscriptionId: mySub.id,
      amount: 2900,
    });
    await processSucceeded({
      organizationId: other.organization!.id,
      subscriptionId: otherSub.id,
      amount: 500,
    });
    const mineInvoice = await prisma.invoice.findFirstOrThrow({
      where: { organizationId: mine.organization!.id },
    });
    const otherInvoice = await prisma.invoice.findFirstOrThrow({
      where: { organizationId: other.organization!.id },
    });
    const cookie = await cookieFor(mine.user.email);
    const res = await request(app)
      .get(`/invoices/${mineInvoice.id}/pdf`)
      .set('Cookie', cookie)
      .buffer()
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => {
          chunks.push(chunk as Buffer);
        });
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.headers['content-disposition']).toContain(
      'filename="invoice-INV-000001.pdf"',
    );
    expect(Buffer.from(res.body).subarray(0, 4).toString()).toBe('%PDF');

    const anon = await request(app).get(`/invoices/${mineInvoice.id}/pdf`);
    expect(anon.status).toBe(401);
    const foreign = await request(app)
      .get(`/invoices/${otherInvoice.id}/pdf`)
      .set('Cookie', cookie);
    expect(foreign.status).toBe(404);
  });

  it('lists FAILED payments with no invoice and paid ones with a link', async () => {
    const app = await importApp();
    const { user, organization } = await createTestUser({
      email: `api-${crypto.randomUUID()}@example.test`,
      withOrganization: true,
    });
    const month = await seedPlan();
    const subscription = await prisma.subscription.create({
      data: {
        organizationId: organization!.id,
        planPriceId: month.id,
        status: SubscriptionStatus.PENDING,
      },
    });
    await prisma.payment.create({
      data: {
        organizationId: organization!.id,
        subscriptionId: subscription.id,
        providerPaymentId: crypto.randomUUID(),
        status: PaymentStatus.FAILED,
        amount: 900,
        currency: 'USD',
        failureMessage: 'Card declined',
      },
    });
    await processSucceeded({
      organizationId: organization!.id,
      subscriptionId: subscription.id,
      amount: 2900,
    });
    const cookie = await cookieFor(user.email);
    const res = await request(app).get('/payments').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    const failed = res.body.items.find(
      (item: { status: string }) => item.status === 'FAILED',
    );
    const paid = res.body.items.find(
      (item: { status: string }) => item.status === 'SUCCEEDED',
    );
    expect(failed.failureMessage).toBe('Card declined');
    expect(failed.invoice).toBeNull();
    expect(paid.invoice.displayNumber).toBe('INV-000001');
    assertNoProviderIds(res.body);
  });

  it('enforces auth and lets MEMBER read', async () => {
    const app = await importApp();
    const anon = await request(app).get('/invoices');
    expect(anon.status).toBe(401);
    const admin = await createTestUser({
      email: `api-${crypto.randomUUID()}@example.test`,
      role: UserRole.ADMIN,
    });
    const adminCookie = await cookieFor(admin.user.email);
    const adminRes = await request(app)
      .get('/invoices')
      .set('Cookie', adminCookie);
    expect(adminRes.status).toBe(403);

    const member = await createTestUser({
      email: `api-${crypto.randomUUID()}@example.test`,
      withOrganization: true,
      membershipRole: MembershipRole.MEMBER,
    });
    const month = await seedPlan();
    const sub = await prisma.subscription.create({
      data: {
        organizationId: member.organization!.id,
        planPriceId: month.id,
        status: SubscriptionStatus.PENDING,
      },
    });
    await processSucceeded({
      organizationId: member.organization!.id,
      subscriptionId: sub.id,
      amount: 900,
    });
    const memberCookie = await cookieFor(member.user.email);
    const memberRes = await request(app)
      .get('/invoices')
      .set('Cookie', memberCookie);
    expect(memberRes.status).toBe(200);
    expect(memberRes.body.totalItems).toBe(1);
  });
});

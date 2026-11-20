import {
  AuditSource,
  BillingInterval,
  MembershipRole,
  PaymentStatus,
  SubscriptionStatus,
  UserRole,
  WebhookEventStatus,
} from '@prisma/client';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRegistry } from '../src/jobs/handlers';
import {
  handlePaymentFailed,
  handleSubscriptionActivated,
  registerCheckoutHandlers,
} from '../src/jobs/handlers/checkout';
import { registerStubHandlers } from '../src/jobs/handlers/stubs';
import { createWebhookProcessor } from '../src/jobs/webhookProcessor';
import { prisma } from '../src/lib/prisma';
import { setPaymentGateway } from '../src/services/payment/paymentGateway';
import { SimulatorPaymentGateway } from '../src/services/payment/simulatorGateway';
import { assertTestDatabase, TEST_DATABASE_NAME } from './dbSafety';
import { FakePaymentGateway } from './fakeGateway';
import {
  clearTestPlans,
  clearTestUsersAndOrgs,
  createTestUser,
  importApp,
  loginAs,
} from './helpers';

async function expectTestDatabase(): Promise<void> {
  assertTestDatabase(process.env.DATABASE_URL);
  const rows = await prisma.$queryRaw<Array<{ current_database: string }>>`
    SELECT current_database()
  `;
  expect(rows[0]?.current_database).toBe(TEST_DATABASE_NAME);
}

function email(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}@example.test`;
}

async function seedPlan(options?: {
  name?: string;
  isActive?: boolean;
  priceActive?: boolean;
  monthlyAmount?: number;
}) {
  const plan = await prisma.plan.create({
    data: {
      name: options?.name ?? `Plan ${crypto.randomUUID()}`,
      description: 'Test plan',
      features: ['Feature A', 'Feature B'],
      usageLimit: 100,
      isActive: options?.isActive ?? true,
      sortOrder: 1,
    },
  });
  const month = await prisma.planPrice.create({
    data: {
      planId: plan.id,
      interval: BillingInterval.MONTH,
      amount: options?.monthlyAmount ?? 900,
      currency: 'USD',
      isActive: options?.priceActive ?? true,
    },
  });
  const year = await prisma.planPrice.create({
    data: {
      planId: plan.id,
      interval: BillingInterval.YEAR,
      amount: 9000,
      currency: 'USD',
      isActive: true,
    },
  });
  return { plan, month, year };
}

async function cookieFor(emailAddress: string): Promise<string> {
  const app = await importApp();
  const { cookie } = await loginAs(app, emailAddress);
  expect(cookie).toBeTruthy();
  return cookie as string;
}

function checkoutRegistry() {
  const registry = createRegistry();
  registerStubHandlers(registry);
  registerCheckoutHandlers(registry);
  return registry;
}

function simulatorPayload(
  type: string,
  data: Record<string, unknown>,
): Record<string, unknown> {
  return {
    id: crypto.randomUUID(),
    type,
    createdAt: new Date().toISOString(),
    objectId:
      (typeof data.subscriptionId === 'string' && data.subscriptionId) ||
      (typeof data.paymentId === 'string' && data.paymentId) ||
      crypto.randomUUID(),
    data,
  };
}

async function insertWebhookEvent(
  type: string,
  data: Record<string, unknown>,
) {
  return prisma.webhookEvent.create({
    data: {
      type,
      payload: simulatorPayload(type, data),
      signatureValid: true,
      status: WebhookEventStatus.RECEIVED,
    },
  });
}

describe('subscriptions checkout', () => {
  let gateway: FakePaymentGateway;

  beforeEach(async () => {
    await expectTestDatabase();
    await clearTestUsersAndOrgs();
    await clearTestPlans();
    await importApp();
    gateway = new FakePaymentGateway();
    setPaymentGateway(gateway);
  });

  afterEach(() => {
    setPaymentGateway(new SimulatorPaymentGateway());
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('POST /subscriptions succeeds as PENDING and never activates in the request', async () => {
    const app = await importApp();
    const { user, organization } = await createTestUser({
      email: email('owner'),
      withOrganization: true,
    });
    const { month } = await seedPlan({ monthlyAmount: 900 });
    const cookie = await cookieFor(user.email);

    const res = await request(app)
      .post('/subscriptions')
      .set('Cookie', cookie)
      .send({
        planPriceId: month.id,
        paymentToken: 'tok_sim_visa_ok',
      });

    expect(res.status).toBe(201);
    expect(res.body.subscription.status).toBe('PENDING');
    expect(res.body.subscription.amount).toBe(900);
    expect(res.body.subscription.interval).toBe('MONTH');
    expect(res.body.subscription.providerSubscriptionId).toBeUndefined();

    const stored = await prisma.subscription.findUniqueOrThrow({
      where: { id: res.body.subscription.id },
    });
    expect(stored.status).toBe(SubscriptionStatus.PENDING);
    expect(stored.providerSubscriptionId).toBe(
      `sub_sub-create-${stored.id}`,
    );

    const audits = await prisma.auditLog.findMany({
      where: {
        subscriptionId: stored.id,
        action: 'subscription.created',
      },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]?.source).toBe(AuditSource.CUSTOMER);
    expect(audits[0]?.actorUserId).toBe(user.id);

    expect(gateway.createSubscriptionCalls).toHaveLength(1);
    expect(gateway.createSubscriptionCalls[0]).toMatchObject({
      amount: 900,
      currency: 'USD',
      interval: 'MONTH',
      planPriceId: month.id,
      idempotencyKey: `sub-create-${stored.id}`,
      metadata: {
        subscriptionId: stored.id,
        organizationId: organization!.id,
      },
    });

    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: organization!.id },
    });
    expect(org.providerCustomerId).toBe(`cus_${organization!.id}`);
    expect(gateway.createCustomerCalls[0]?.idempotencyKey).toBe(
      `customer-create-${organization!.id}`,
    );
  });

  it('ignores client amount, status, and organizationId and uses the database price', async () => {
    const app = await importApp();
    const { user, organization } = await createTestUser({
      email: email('owner'),
      withOrganization: true,
    });
    const other = await createTestUser({
      email: email('other'),
      withOrganization: true,
    });
    const { month } = await seedPlan({ monthlyAmount: 2500 });
    const cookie = await cookieFor(user.email);

    const res = await request(app)
      .post('/subscriptions')
      .set('Cookie', cookie)
      .send({
        planPriceId: month.id,
        paymentToken: 'tok_sim_visa_ok',
        amount: 1,
        status: 'ACTIVE',
        organizationId: other.organization!.id,
      });

    expect(res.status).toBe(201);
    expect(res.body.subscription.status).toBe('PENDING');
    expect(res.body.subscription.amount).toBe(2500);
    const stored = await prisma.subscription.findUniqueOrThrow({
      where: { id: res.body.subscription.id },
    });
    expect(stored.organizationId).toBe(organization!.id);
    expect(stored.status).toBe(SubscriptionStatus.PENDING);
    expect(gateway.createSubscriptionCalls[0]?.amount).toBe(2500);
  });

  it('rejects missing planPriceId, malformed tokens, and unknown or inactive plans', async () => {
    const app = await importApp();
    const { user } = await createTestUser({
      email: email('owner'),
      withOrganization: true,
    });
    const { month } = await seedPlan();
    const inactivePlan = await seedPlan({
      name: `Inactive ${crypto.randomUUID()}`,
      isActive: false,
    });
    const inactivePrice = await seedPlan({
      name: `Retired ${crypto.randomUUID()}`,
      priceActive: false,
    });
    const cookie = await cookieFor(user.email);

    const missing = await request(app)
      .post('/subscriptions')
      .set('Cookie', cookie)
      .send({ paymentToken: 'tok_sim_visa_ok' });
    expect(missing.status).toBe(400);

    const malformed = await request(app)
      .post('/subscriptions')
      .set('Cookie', cookie)
      .send({ planPriceId: month.id, paymentToken: 'not-a-token' });
    expect(malformed.status).toBe(400);

    const cardLike = await request(app)
      .post('/subscriptions')
      .set('Cookie', cookie)
      .send({
        planPriceId: month.id,
        paymentToken: '4242424242424242',
      });
    expect(cardLike.status).toBe(400);

    const unknownToken = await request(app)
      .post('/subscriptions')
      .set('Cookie', cookie)
      .send({
        planPriceId: month.id,
        paymentToken: 'tok_sim_unknown',
      });
    expect(unknownToken.status).toBe(400);
    expect(unknownToken.body.error.code).toBe('INVALID_PAYMENT_TOKEN');

    const unknownPlan = await request(app)
      .post('/subscriptions')
      .set('Cookie', cookie)
      .send({
        planPriceId: crypto.randomUUID(),
        paymentToken: 'tok_sim_visa_ok',
      });
    expect(unknownPlan.status).toBe(404);
    expect(unknownPlan.body.error.code).toBe('PLAN_NOT_AVAILABLE');

    const inactive = await request(app)
      .post('/subscriptions')
      .set('Cookie', cookie)
      .send({
        planPriceId: inactivePlan.month.id,
        paymentToken: 'tok_sim_visa_ok',
      });
    expect(inactive.status).toBe(404);
    expect(inactive.body.error.code).toBe('PLAN_NOT_AVAILABLE');

    const retired = await request(app)
      .post('/subscriptions')
      .set('Cookie', cookie)
      .send({
        planPriceId: inactivePrice.month.id,
        paymentToken: 'tok_sim_visa_ok',
      });
    expect(retired.status).toBe(404);
    expect(retired.body.error.code).toBe('PLAN_NOT_AVAILABLE');
  });

  it('enforces authentication and OWNER-only checkout', async () => {
    const app = await importApp();
    const { month } = await seedPlan();
    const body = {
      planPriceId: month.id,
      paymentToken: 'tok_sim_visa_ok',
    };

    const anon = await request(app).post('/subscriptions').send(body);
    expect(anon.status).toBe(401);

    const admin = await createTestUser({
      email: email('admin'),
      role: UserRole.ADMIN,
    });
    const adminCookie = await cookieFor(admin.user.email);
    const adminRes = await request(app)
      .post('/subscriptions')
      .set('Cookie', adminCookie)
      .send(body);
    expect(adminRes.status).toBe(403);
    expect(adminRes.body.error.code).toBe('ORGANIZATION_REQUIRED');

    const member = await createTestUser({
      email: email('member'),
      withOrganization: true,
      membershipRole: MembershipRole.MEMBER,
    });
    const memberCookie = await cookieFor(member.user.email);
    const memberRes = await request(app)
      .post('/subscriptions')
      .set('Cookie', memberCookie)
      .send(body);
    expect(memberRes.status).toBe(403);

    const noOrg = await createTestUser({ email: email('solo') });
    const noOrgCookie = await cookieFor(noOrg.user.email);
    const noOrgRes = await request(app)
      .post('/subscriptions')
      .set('Cookie', noOrgCookie)
      .send(body);
    expect(noOrgRes.status).toBe(403);
    expect(noOrgRes.body.error.code).toBe('ORGANIZATION_REQUIRED');
  });

  it('blocks existing ACTIVE/recent PENDING and auto-cancels stale PENDING', async () => {
    const app = await importApp();
    const { user, organization } = await createTestUser({
      email: email('owner'),
      withOrganization: true,
    });
    const { month } = await seedPlan();
    const cookie = await cookieFor(user.email);

    await prisma.subscription.create({
      data: {
        organizationId: organization!.id,
        planPriceId: month.id,
        status: SubscriptionStatus.ACTIVE,
      },
    });
    const exists = await request(app)
      .post('/subscriptions')
      .set('Cookie', cookie)
      .send({
        planPriceId: month.id,
        paymentToken: 'tok_sim_visa_ok',
      });
    expect(exists.status).toBe(409);
    expect(exists.body.error.code).toBe('SUBSCRIPTION_ALREADY_EXISTS');

    await prisma.subscription.updateMany({
      where: { organizationId: organization!.id },
      data: { status: SubscriptionStatus.CANCELED, canceledAt: new Date() },
    });
    const recent = await prisma.subscription.create({
      data: {
        organizationId: organization!.id,
        planPriceId: month.id,
        status: SubscriptionStatus.PENDING,
      },
    });
    const pending = await request(app)
      .post('/subscriptions')
      .set('Cookie', cookie)
      .send({
        planPriceId: month.id,
        paymentToken: 'tok_sim_visa_ok',
      });
    expect(pending.status).toBe(409);
    expect(pending.body.error.code).toBe('SUBSCRIPTION_PENDING');

    await prisma.subscription.update({
      where: { id: recent.id },
      data: { createdAt: new Date(Date.now() - 16 * 60 * 1000) },
    });
    const retry = await request(app)
      .post('/subscriptions')
      .set('Cookie', cookie)
      .send({
        planPriceId: month.id,
        paymentToken: 'tok_sim_visa_ok',
      });
    expect(retry.status).toBe(201);
    expect(retry.body.subscription.status).toBe('PENDING');
    expect(retry.body.subscription.id).not.toBe(recent.id);

    const stale = await prisma.subscription.findUniqueOrThrow({
      where: { id: recent.id },
    });
    expect(stale.status).toBe(SubscriptionStatus.CANCELED);
    const timeoutAudit = await prisma.auditLog.findFirst({
      where: {
        subscriptionId: recent.id,
        action: 'subscription.checkout_canceled',
      },
    });
    expect(timeoutAudit?.source).toBe(AuditSource.SYSTEM);
    expect(timeoutAudit?.afterState).toMatchObject({
      reason: 'pending timeout',
    });
  });

  it('double submit creates exactly one non-canceled subscription', async () => {
    const app = await importApp();
    const { user, organization } = await createTestUser({
      email: email('owner'),
      withOrganization: true,
    });
    const { month } = await seedPlan();
    const cookie = await cookieFor(user.email);
    const body = {
      planPriceId: month.id,
      paymentToken: 'tok_sim_visa_ok',
    };

    const [first, second] = await Promise.all([
      request(app).post('/subscriptions').set('Cookie', cookie).send(body),
      request(app).post('/subscriptions').set('Cookie', cookie).send(body),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);
    const rows = await prisma.subscription.findMany({
      where: {
        organizationId: organization!.id,
        status: { not: SubscriptionStatus.CANCELED },
      },
    });
    expect(rows).toHaveLength(1);
  });

  it('cancels PENDING on gateway reject or unavailability and then allows retry', async () => {
    const app = await importApp();
    const { user, organization } = await createTestUser({
      email: email('owner'),
      withOrganization: true,
    });
    const { month } = await seedPlan();
    const cookie = await cookieFor(user.email);
    const body = {
      planPriceId: month.id,
      paymentToken: 'tok_sim_visa_ok',
    };

    gateway.behavior = 'rejected';
    const rejected = await request(app)
      .post('/subscriptions')
      .set('Cookie', cookie)
      .send(body);
    expect(rejected.status).toBe(402);
    expect(rejected.body.error.code).toBe('PAYMENT_REJECTED');
    const canceled = await prisma.subscription.findFirstOrThrow({
      where: { organizationId: organization!.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(canceled.status).toBe(SubscriptionStatus.CANCELED);
    const cancelAudit = await prisma.auditLog.findFirst({
      where: {
        subscriptionId: canceled.id,
        action: 'subscription.checkout_canceled',
      },
    });
    expect(cancelAudit).not.toBeNull();

    gateway.behavior = 'unavailable';
    const unavailable = await request(app)
      .post('/subscriptions')
      .set('Cookie', cookie)
      .send(body);
    expect(unavailable.status).toBe(502);
    expect(unavailable.body.error.code).toBe('PAYMENT_PROVIDER_UNAVAILABLE');

    gateway.behavior = 'success';
    const retry = await request(app)
      .post('/subscriptions')
      .set('Cookie', cookie)
      .send(body);
    expect(retry.status).toBe(201);
    expect(retry.body.subscription.status).toBe('PENDING');
  });

  it('GET /subscriptions/current returns the latest row, failureReason, and org isolation', async () => {
    const app = await importApp();
    const first = await createTestUser({
      email: email('first'),
      withOrganization: true,
    });
    const second = await createTestUser({
      email: email('second'),
      withOrganization: true,
    });
    const { month } = await seedPlan();
    const firstCookie = await cookieFor(first.user.email);
    const secondCookie = await cookieFor(second.user.email);

    const empty = await request(app)
      .get('/subscriptions/current')
      .set('Cookie', firstCookie);
    expect(empty.status).toBe(200);
    expect(empty.body.subscription).toBeNull();

    const created = await request(app)
      .post('/subscriptions')
      .set('Cookie', firstCookie)
      .send({
        planPriceId: month.id,
        paymentToken: 'tok_sim_visa_ok',
      });
    expect(created.status).toBe(201);

    const current = await request(app)
      .get('/subscriptions/current')
      .set('Cookie', firstCookie);
    expect(current.status).toBe(200);
    expect(current.body.subscription.id).toBe(created.body.subscription.id);
    expect(current.body.subscription.failureReason).toBeNull();
    expect(current.body.subscription.providerSubscriptionId).toBeUndefined();

    gateway.behavior = 'rejected';
    await prisma.subscription.update({
      where: { id: created.body.subscription.id },
      data: {
        status: SubscriptionStatus.CANCELED,
        canceledAt: new Date(),
      },
    });
    const failed = await request(app)
      .post('/subscriptions')
      .set('Cookie', firstCookie)
      .send({
        planPriceId: month.id,
        paymentToken: 'tok_sim_visa_ok',
      });
    expect(failed.status).toBe(402);
    const failedCurrent = await request(app)
      .get('/subscriptions/current')
      .set('Cookie', firstCookie);
    expect(failedCurrent.body.subscription.status).toBe('CANCELED');
    expect(failedCurrent.body.subscription.failureReason).toBe('Card declined');

    const other = await request(app)
      .get('/subscriptions/current')
      .set('Cookie', secondCookie);
    expect(other.status).toBe(200);
    expect(other.body.subscription).toBeNull();
  });

  it('subscription.activated activates PENDING once and ignores duplicates, canceled, and unknown ids', async () => {
    const { organization } = await createTestUser({
      email: email('owner'),
      withOrganization: true,
    });
    const { month } = await seedPlan();
    const pending = await prisma.subscription.create({
      data: {
        organizationId: organization!.id,
        planPriceId: month.id,
        status: SubscriptionStatus.PENDING,
      },
    });
    const processWebhookEvent = createWebhookProcessor(checkoutRegistry());
    const periodStart = '2026-01-01T00:00:00.000Z';
    const periodEnd = '2026-02-01T00:00:00.000Z';
    const data = {
      subscriptionId: 'sim-sub-1',
      customerId: 'sim-cus-1',
      amount: 900,
      currency: 'USD',
      status: 'active',
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      metadata: {
        subscriptionId: pending.id,
        organizationId: organization!.id,
      },
    };

    const event = await insertWebhookEvent('subscription.activated', data);
    await processWebhookEvent(event.id);
    await processWebhookEvent(event.id);

    const activated = await prisma.subscription.findUniqueOrThrow({
      where: { id: pending.id },
    });
    expect(activated.status).toBe(SubscriptionStatus.ACTIVE);
    expect(activated.providerSubscriptionId).toBe('sim-sub-1');
    expect(activated.currentPeriodStart?.toISOString()).toBe(periodStart);
    expect(activated.currentPeriodEnd?.toISOString()).toBe(periodEnd);
    const audits = await prisma.auditLog.findMany({
      where: {
        subscriptionId: pending.id,
        action: 'subscription.activated',
      },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]?.source).toBe(AuditSource.WEBHOOK);
    expect(audits[0]?.webhookEventId).toBe(event.id);

    const replay = await insertWebhookEvent('subscription.activated', data);
    await processWebhookEvent(replay.id);
    expect(
      await prisma.auditLog.count({
        where: {
          subscriptionId: pending.id,
          action: 'subscription.activated',
        },
      }),
    ).toBe(1);

    const canceledOrg = await createTestUser({
      email: email('canceled'),
      withOrganization: true,
    });
    const canceled = await prisma.subscription.create({
      data: {
        organizationId: canceledOrg.organization!.id,
        planPriceId: month.id,
        status: SubscriptionStatus.CANCELED,
        canceledAt: new Date(),
      },
    });
    const late = await insertWebhookEvent('subscription.activated', {
      ...data,
      metadata: {
        subscriptionId: canceled.id,
        organizationId: canceledOrg.organization!.id,
      },
    });
    await processWebhookEvent(late.id);
    const stillCanceled = await prisma.subscription.findUniqueOrThrow({
      where: { id: canceled.id },
    });
    expect(stillCanceled.status).toBe(SubscriptionStatus.CANCELED);

    const unknown = await insertWebhookEvent('subscription.activated', {
      subscriptionId: crypto.randomUUID(),
      metadata: { subscriptionId: crypto.randomUUID() },
    });
    await processWebhookEvent(unknown.id);
    const unknownStored = await prisma.webhookEvent.findUniqueOrThrow({
      where: { id: unknown.id },
    });
    expect(unknownStored.status).toBe(WebhookEventStatus.PROCESSED);
  });

  it('payment failure on PENDING records one FAILED payment and cancels; ACTIVE is unchanged', async () => {
    const { organization } = await createTestUser({
      email: email('owner'),
      withOrganization: true,
    });
    const { month } = await seedPlan();
    const pending = await prisma.subscription.create({
      data: {
        organizationId: organization!.id,
        planPriceId: month.id,
        status: SubscriptionStatus.PENDING,
        providerSubscriptionId: 'sim-sub-fail',
      },
    });
    const processWebhookEvent = createWebhookProcessor(checkoutRegistry());
    const paymentId = crypto.randomUUID();
    const data = {
      paymentId,
      customerId: 'sim-cus-1',
      amount: 900,
      currency: 'USD',
      status: 'declined',
      errorCode: 'CARD_DECLINED',
      subscriptionId: 'sim-sub-fail',
      metadata: {
        subscriptionId: pending.id,
        organizationId: organization!.id,
      },
    };

    const event = await insertWebhookEvent('payment.declined', data);
    await processWebhookEvent(event.id);
    await processWebhookEvent(event.id);

    const payments = await prisma.payment.findMany({
      where: { providerPaymentId: paymentId },
    });
    expect(payments).toHaveLength(1);
    expect(payments[0]?.status).toBe(PaymentStatus.FAILED);
    expect(payments[0]?.failureCode).toBe('CARD_DECLINED');
    expect(payments[0]?.invoiceId).toBeNull();

    const canceled = await prisma.subscription.findUniqueOrThrow({
      where: { id: pending.id },
    });
    expect(canceled.status).toBe(SubscriptionStatus.CANCELED);
    expect(
      await prisma.auditLog.count({
        where: {
          subscriptionId: pending.id,
          action: 'subscription.payment_failed',
        },
      }),
    ).toBe(1);

    const activeOrg = await createTestUser({
      email: email('active'),
      withOrganization: true,
    });
    const active = await prisma.subscription.create({
      data: {
        organizationId: activeOrg.organization!.id,
        planPriceId: month.id,
        status: SubscriptionStatus.ACTIVE,
      },
    });
    const activeEvent = await insertWebhookEvent('payment.insufficient_funds', {
      paymentId: crypto.randomUUID(),
      amount: 900,
      currency: 'USD',
      errorCode: 'INSUFFICIENT_FUNDS',
      metadata: {
        subscriptionId: active.id,
        organizationId: activeOrg.organization!.id,
      },
    });
    await processWebhookEvent(activeEvent.id);
    const stillActive = await prisma.subscription.findUniqueOrThrow({
      where: { id: active.id },
    });
    expect(stillActive.status).toBe(SubscriptionStatus.ACTIVE);
    expect(
      await prisma.payment.count({
        where: { subscriptionId: active.id },
      }),
    ).toBe(0);
  });

  it('full flow: checkout stays PENDING until the activation handler runs', async () => {
    const app = await importApp();
    const { user, organization } = await createTestUser({
      email: email('owner'),
      withOrganization: true,
    });
    const { month } = await seedPlan();
    const cookie = await cookieFor(user.email);
    const created = await request(app)
      .post('/subscriptions')
      .set('Cookie', cookie)
      .send({
        planPriceId: month.id,
        paymentToken: 'tok_sim_visa_ok',
      });
    expect(created.status).toBe(201);
    expect(created.body.subscription.status).toBe('PENDING');

    const processWebhookEvent = createWebhookProcessor(checkoutRegistry());
    const event = await insertWebhookEvent('subscription.activated', {
      subscriptionId: gateway.createSubscriptionCalls[0]
        ? `sub_${gateway.createSubscriptionCalls[0].idempotencyKey}`
        : 'sim-sub',
      currentPeriodStart: '2026-03-01T00:00:00.000Z',
      currentPeriodEnd: '2026-04-01T00:00:00.000Z',
      metadata: {
        subscriptionId: created.body.subscription.id,
        organizationId: organization!.id,
      },
    });
    await processWebhookEvent(event.id);

    const current = await request(app)
      .get('/subscriptions/current')
      .set('Cookie', cookie);
    expect(current.body.subscription.status).toBe('ACTIVE');
    expect(current.body.subscription.currentPeriodEnd).toBe(
      '2026-04-01T00:00:00.000Z',
    );
  });

  it('checkout handlers replace the stubs; payment.succeeded stays a stub', async () => {
    const registry = checkoutRegistry();
    expect(registry.get('subscription.activated')).toBe(
      handleSubscriptionActivated,
    );
    expect(registry.get('payment.declined')).toBe(handlePaymentFailed);
    expect(registry.get('payment.insufficient_funds')).toBe(
      handlePaymentFailed,
    );
    expect(registry.get('payment.succeeded')).not.toBe(handlePaymentFailed);
    expect(registry.get('payment.succeeded')).not.toBe(
      handleSubscriptionActivated,
    );

    const { organization } = await createTestUser({
      email: email('stub'),
      withOrganization: true,
    });
    const { month } = await seedPlan();
    const pending = await prisma.subscription.create({
      data: {
        organizationId: organization!.id,
        planPriceId: month.id,
        status: SubscriptionStatus.PENDING,
      },
    });
    const processWebhookEvent = createWebhookProcessor(registry);
    const event = await insertWebhookEvent('payment.succeeded', {
      paymentId: crypto.randomUUID(),
      amount: 900,
      currency: 'USD',
      metadata: {
        subscriptionId: pending.id,
        organizationId: organization!.id,
      },
    });
    await processWebhookEvent(event.id);
    const stillPending = await prisma.subscription.findUniqueOrThrow({
      where: { id: pending.id },
    });
    expect(stillPending.status).toBe(SubscriptionStatus.PENDING);
    expect(await prisma.payment.count()).toBe(0);
  });
});

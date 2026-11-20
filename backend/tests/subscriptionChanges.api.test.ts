import {
  AuditSource,
  BillingInterval,
  MembershipRole,
  SubscriptionStatus,
  UserRole,
} from '@prisma/client';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetNow, setNow } from '../src/lib/clock';
import { prorateUpgrade } from '../src/lib/proration';
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

const PERIOD_START = new Date('2026-01-01T00:00:00.000Z');
const PERIOD_END = new Date('2026-02-01T00:00:00.000Z');
const NOW = new Date('2026-01-16T00:00:00.000Z');

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

async function cookieFor(emailAddress: string): Promise<string> {
  const app = await importApp();
  const { cookie } = await loginAs(app, emailAddress);
  expect(cookie).toBeTruthy();
  return cookie as string;
}

async function seedPlans() {
  const starter = await prisma.plan.create({
    data: {
      name: `Starter ${crypto.randomUUID()}`,
      description: 'Starter',
      features: ['a'],
      usageLimit: 100,
      isActive: true,
      sortOrder: 1,
    },
  });
  const pro = await prisma.plan.create({
    data: {
      name: `Pro ${crypto.randomUUID()}`,
      description: 'Pro',
      features: ['b'],
      usageLimit: 1000,
      isActive: true,
      sortOrder: 2,
    },
  });
  const starterMonth = await prisma.planPrice.create({
    data: {
      planId: starter.id,
      interval: BillingInterval.MONTH,
      amount: 900,
      currency: 'USD',
      isActive: true,
    },
  });
  const starterYear = await prisma.planPrice.create({
    data: {
      planId: starter.id,
      interval: BillingInterval.YEAR,
      amount: 9000,
      currency: 'USD',
      isActive: true,
    },
  });
  const proMonth = await prisma.planPrice.create({
    data: {
      planId: pro.id,
      interval: BillingInterval.MONTH,
      amount: 2900,
      currency: 'USD',
      isActive: true,
    },
  });
  const euroPlan = await prisma.plan.create({
    data: {
      name: `Euro ${crypto.randomUUID()}`,
      description: 'Euro',
      features: ['c'],
      usageLimit: 100,
      isActive: true,
      sortOrder: 3,
    },
  });
  const businessMonth = await prisma.planPrice.create({
    data: {
      planId: euroPlan.id,
      interval: BillingInterval.MONTH,
      amount: 9900,
      currency: 'EUR',
      isActive: true,
    },
  });
  return { starter, pro, starterMonth, starterYear, proMonth, businessMonth };
}

async function createActive(
  organizationId: string,
  planPriceId: string,
  extra?: { status?: SubscriptionStatus; pendingPlanPriceId?: string | null },
) {
  return prisma.subscription.create({
    data: {
      organizationId,
      planPriceId,
      status: extra?.status ?? SubscriptionStatus.ACTIVE,
      currentPeriodStart: PERIOD_START,
      currentPeriodEnd: PERIOD_END,
      providerSubscriptionId: `sim_${crypto.randomUUID()}`,
      pendingPlanPriceId: extra?.pendingPlanPriceId ?? null,
    },
  });
}

describe('subscription changes API', () => {
  let gateway: FakePaymentGateway;

  beforeEach(async () => {
    await expectTestDatabase();
    await clearTestUsersAndOrgs();
    await clearTestPlans();
    await importApp();
    gateway = new FakePaymentGateway();
    setPaymentGateway(gateway);
    setNow(() => NOW);
  });

  afterEach(() => {
    resetNow();
    setPaymentGateway(new SimulatorPaymentGateway());
  });

  afterAll(async () => {
    resetNow();
    await prisma.$disconnect();
  });

  it('enforces auth and OWNER on mutating endpoints and preview', async () => {
    const app = await importApp();
    const { starterMonth, proMonth } = await seedPlans();
    const owner = await createTestUser({
      email: email('owner'),
      withOrganization: true,
    });
    await createActive(owner.organization!.id, starterMonth.id);
    const ownerCookie = await cookieFor(owner.user.email);
    const paths: Array<{ method: 'get' | 'post' | 'delete'; path: string; body?: object }> =
      [
        {
          method: 'get',
          path: `/subscriptions/current/change-preview?planPriceId=${proMonth.id}`,
        },
        {
          method: 'post',
          path: '/subscriptions/current/change-plan',
          body: { planPriceId: proMonth.id },
        },
        { method: 'delete', path: '/subscriptions/current/scheduled-change' },
        { method: 'post', path: '/subscriptions/current/pause' },
        { method: 'post', path: '/subscriptions/current/resume' },
        {
          method: 'post',
          path: '/subscriptions/current/cancel',
          body: { when: 'AT_PERIOD_END' },
        },
        { method: 'post', path: '/subscriptions/current/undo-cancel' },
      ];

    for (const item of paths) {
      const anon = await request(app)[item.method](item.path).send(item.body);
      expect(anon.status, item.path).toBe(401);
    }

    const admin = await createTestUser({
      email: email('admin'),
      role: UserRole.ADMIN,
    });
    const adminCookie = await cookieFor(admin.user.email);
    const noOrg = await createTestUser({ email: email('noorg') });
    const noOrgCookie = await cookieFor(noOrg.user.email);
    const memberUser = await createTestUser({ email: email('member') });
    await prisma.membership.create({
      data: {
        userId: memberUser.user.id,
        organizationId: owner.organization!.id,
        role: MembershipRole.MEMBER,
      },
    });
    const memberCookie = await cookieFor(memberUser.user.email);

    for (const item of paths) {
      const adminRes = await request(app)
        [item.method](item.path)
        .set('Cookie', adminCookie)
        .send(item.body);
      expect(adminRes.status, `admin ${item.path}`).toBe(403);
      const missingOrg = await request(app)
        [item.method](item.path)
        .set('Cookie', noOrgCookie)
        .send(item.body);
      expect(missingOrg.status, `no-org ${item.path}`).toBe(403);
      const memberRes = await request(app)
        [item.method](item.path)
        .set('Cookie', memberCookie)
        .send(item.body);
      expect(memberRes.status, `member ${item.path}`).toBe(403);
    }

    const preview = await request(app)
      .get(`/subscriptions/current/change-preview?planPriceId=${proMonth.id}`)
      .set('Cookie', ownerCookie);
    expect(preview.status).toBe(200);
  });

  it('upgrades immediately with a deterministic idempotency key and unchanged period', async () => {
    const app = await importApp();
    const { starterMonth, proMonth, starter } = await seedPlans();
    const { user, organization } = await createTestUser({
      email: email('up'),
      withOrganization: true,
    });
    const sub = await createActive(organization!.id, starterMonth.id, {
      pendingPlanPriceId: proMonth.id,
    });
    const cookie = await cookieFor(user.email);
    const expected = prorateUpgrade({
      oldAmount: 900,
      newAmount: 2900,
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      now: NOW,
    });

    const res = await request(app)
      .post('/subscriptions/current/change-plan')
      .set('Cookie', cookie)
      .send({
        planPriceId: proMonth.id,
        amount: 1,
        status: 'CANCELED',
        organizationId: crypto.randomUUID(),
      });
    expect(res.status).toBe(200);
    expect(res.body.kind).toBe('UPGRADE');
    expect(res.body.chargeAmount).toBe(expected.chargeAmount);
    expect(res.body.subscription.planPriceId).toBe(proMonth.id);
    expect(res.body.subscription.usageLimit).toBe(1000);
    expect(res.body.subscription.currentPeriodStart).toBe(
      PERIOD_START.toISOString(),
    );
    expect(res.body.subscription.currentPeriodEnd).toBe(
      PERIOD_END.toISOString(),
    );
    expect(res.body.subscription.pendingChange).toBeNull();

    expect(gateway.changePlanCalls).toHaveLength(1);
    const call = gateway.changePlanCalls[0];
    expect(call?.idempotencyKey).toBe(
      `sub-upgrade-${sub.id}-${proMonth.id}-${Math.floor(PERIOD_END.getTime() / 1000)}`,
    );
    expect(call?.chargeAmount).toBe(expected.chargeAmount);
    expect(call?.metadata.description).toContain(`Upgrade from ${starter.name} to`);
    expect(call?.metadata.reason).toBe('plan_upgrade');

    const stored = await prisma.subscription.findUniqueOrThrow({
      where: { id: sub.id },
    });
    expect(stored.planPriceId).toBe(proMonth.id);
    expect(stored.pendingPlanPriceId).toBeNull();
    expect(stored.currentPeriodEnd).toEqual(PERIOD_END);

    const audits = await prisma.auditLog.findMany({
      where: { subscriptionId: sub.id, action: 'subscription.upgraded' },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]?.source).toBe(AuditSource.CUSTOMER);
    expect(audits[0]?.actorUserId).toBe(user.id);
  });

  it('maps provider upgrade failures and allows a later retry', async () => {
    const app = await importApp();
    const { starterMonth, proMonth } = await seedPlans();
    const { user, organization } = await createTestUser({
      email: email('fail'),
      withOrganization: true,
    });
    const sub = await createActive(organization!.id, starterMonth.id);
    const cookie = await cookieFor(user.email);

    gateway.methodBehavior.changeSubscriptionPlan = 'rejected';
    const declined = await request(app)
      .post('/subscriptions/current/change-plan')
      .set('Cookie', cookie)
      .send({ planPriceId: proMonth.id });
    expect(declined.status).toBe(402);
    expect(declined.body.error.code).toBe('PAYMENT_REJECTED');
    expect(
      (await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } }))
        .planPriceId,
    ).toBe(starterMonth.id);
    expect(
      await prisma.auditLog.count({
        where: { subscriptionId: sub.id, action: 'subscription.upgraded' },
      }),
    ).toBe(0);

    gateway.methodBehavior.changeSubscriptionPlan = 'unavailable';
    const down = await request(app)
      .post('/subscriptions/current/change-plan')
      .set('Cookie', cookie)
      .send({ planPriceId: proMonth.id });
    expect(down.status).toBe(502);
    expect(down.body.error.code).toBe('PAYMENT_PROVIDER_UNAVAILABLE');

    gateway.methodBehavior = {};
    const ok = await request(app)
      .post('/subscriptions/current/change-plan')
      .set('Cookie', cookie)
      .send({ planPriceId: proMonth.id });
    expect(ok.status).toBe(200);
    expect(ok.body.subscription.planPriceId).toBe(proMonth.id);
  });

  it('serializes two parallel upgrades to one provider charge', async () => {
    const app = await importApp();
    const { starterMonth, proMonth } = await seedPlans();
    const { user, organization } = await createTestUser({
      email: email('par'),
      withOrganization: true,
    });
    await createActive(organization!.id, starterMonth.id);
    const cookie = await cookieFor(user.email);
    const body = { planPriceId: proMonth.id };
    const [first, second] = await Promise.all([
      request(app)
        .post('/subscriptions/current/change-plan')
        .set('Cookie', cookie)
        .send(body),
      request(app)
        .post('/subscriptions/current/change-plan')
        .set('Cookie', cookie)
        .send(body),
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 400]);
    const failed = first.status === 400 ? first : second;
    expect(failed.body.error.code).toBe('NO_CHANGE');
    expect(gateway.changePlanCalls).toHaveLength(1);
    expect(
      await prisma.auditLog.count({
        where: {
          organizationId: organization!.id,
          action: 'subscription.upgraded',
        },
      }),
    ).toBe(1);
  });

  it('keeps a consistent state when upgrade and pause race', async () => {
    const app = await importApp();
    const { starterMonth, proMonth } = await seedPlans();
    const { user, organization } = await createTestUser({
      email: email('race'),
      withOrganization: true,
    });
    await createActive(organization!.id, starterMonth.id);
    const cookie = await cookieFor(user.email);
    await Promise.all([
      request(app)
        .post('/subscriptions/current/change-plan')
        .set('Cookie', cookie)
        .send({ planPriceId: proMonth.id }),
      request(app).post('/subscriptions/current/pause').set('Cookie', cookie),
    ]);
    const stored = await prisma.subscription.findFirstOrThrow({
      where: { organizationId: organization!.id },
    });
    expect(
      stored.status === SubscriptionStatus.ACTIVE ||
        stored.status === SubscriptionStatus.PAUSED,
    ).toBe(true);
    if (stored.status === SubscriptionStatus.PAUSED) {
      expect(
        stored.planPriceId === starterMonth.id ||
          stored.planPriceId === proMonth.id,
      ).toBe(true);
    }
  });

  it('schedules a downgrade without a provider call', async () => {
    const app = await importApp();
    const { starterMonth, proMonth } = await seedPlans();
    const { user, organization } = await createTestUser({
      email: email('down'),
      withOrganization: true,
    });
    const sub = await createActive(organization!.id, proMonth.id);
    const cookie = await cookieFor(user.email);
    const first = await request(app)
      .post('/subscriptions/current/change-plan')
      .set('Cookie', cookie)
      .send({ planPriceId: starterMonth.id });
    expect(first.status).toBe(200);
    expect(first.body.kind).toBe('DOWNGRADE');
    expect(first.body.subscription.planPriceId).toBe(proMonth.id);
    expect(first.body.subscription.pendingChange.planPriceId).toBe(
      starterMonth.id,
    );
    expect(gateway.changePlanCalls).toHaveLength(0);
    expect(
      await prisma.auditLog.count({
        where: { action: 'subscription.downgrade_scheduled' },
      }),
    ).toBe(1);

    const same = await request(app)
      .post('/subscriptions/current/change-plan')
      .set('Cookie', cookie)
      .send({ planPriceId: starterMonth.id });
    expect(same.status).toBe(400);
    expect(same.body.error.code).toBe('NO_CHANGE');

    const { starterMonth: other } = await seedPlans();
    const replaced = await request(app)
      .post('/subscriptions/current/change-plan')
      .set('Cookie', cookie)
      .send({ planPriceId: other.id });
    expect(replaced.status).toBe(200);
    expect(replaced.body.subscription.pendingChange.planPriceId).toBe(other.id);

    const undone = await request(app)
      .delete('/subscriptions/current/scheduled-change')
      .set('Cookie', cookie);
    expect(undone.status).toBe(200);
    expect(undone.body.subscription.pendingChange).toBeNull();
    expect(
      (await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } }))
        .planPriceId,
    ).toBe(proMonth.id);

    const empty = await request(app)
      .delete('/subscriptions/current/scheduled-change')
      .set('Cookie', cookie);
    expect(empty.status).toBe(409);
  });

  it('rejects invalid plan changes', async () => {
    const app = await importApp();
    const { starterMonth, starterYear, businessMonth } = await seedPlans();
    const { user, organization } = await createTestUser({
      email: email('val'),
      withOrganization: true,
    });
    await createActive(organization!.id, starterMonth.id);
    const cookie = await cookieFor(user.email);

    const unknown = await request(app)
      .post('/subscriptions/current/change-plan')
      .set('Cookie', cookie)
      .send({ planPriceId: crypto.randomUUID() });
    expect(unknown.status).toBe(404);

    const interval = await request(app)
      .post('/subscriptions/current/change-plan')
      .set('Cookie', cookie)
      .send({ planPriceId: starterYear.id });
    expect(interval.status).toBe(400);
    expect(interval.body.error.code).toBe('INTERVAL_CHANGE_NOT_SUPPORTED');

    const same = await request(app)
      .post('/subscriptions/current/change-plan')
      .set('Cookie', cookie)
      .send({ planPriceId: starterMonth.id });
    expect(same.status).toBe(400);
    expect(same.body.error.code).toBe('NO_CHANGE');

    const currency = await request(app)
      .post('/subscriptions/current/change-plan')
      .set('Cookie', cookie)
      .send({ planPriceId: businessMonth.id });
    expect(currency.status).toBe(400);
    expect(currency.body.error.code).toBe('CURRENCY_MISMATCH');

    const bad = await request(app)
      .post('/subscriptions/current/change-plan')
      .set('Cookie', cookie)
      .send({ planPriceId: 'not-a-uuid' });
    expect(bad.status).toBe(400);
  });

  it('pauses and resumes with an extended period', async () => {
    const app = await importApp();
    const { starterMonth, proMonth } = await seedPlans();
    const { user, organization } = await createTestUser({
      email: email('pause'),
      withOrganization: true,
    });
    await createActive(organization!.id, starterMonth.id);
    const cookie = await cookieFor(user.email);

    setNow(() => new Date('2026-01-10T00:00:00.000Z'));
    const paused = await request(app)
      .post('/subscriptions/current/pause')
      .set('Cookie', cookie);
    expect(paused.status).toBe(200);
    expect(paused.body.subscription.status).toBe('PAUSED');
    expect(paused.body.subscription.pausedAt).toBe(
      '2026-01-10T00:00:00.000Z',
    );
    expect(gateway.pauseCalls).toHaveLength(1);

    const again = await request(app)
      .post('/subscriptions/current/pause')
      .set('Cookie', cookie);
    expect(again.status).toBe(409);

    const change = await request(app)
      .post('/subscriptions/current/change-plan')
      .set('Cookie', cookie)
      .send({ planPriceId: proMonth.id });
    expect(change.status).toBe(409);
    expect(change.body.error.code).toBe('SUBSCRIPTION_PAUSED');

    const cape = await request(app)
      .post('/subscriptions/current/cancel')
      .set('Cookie', cookie)
      .send({ when: 'AT_PERIOD_END' });
    expect(cape.status).toBe(409);

    setNow(() => new Date('2026-01-12T12:00:00.000Z'));
    const resumed = await request(app)
      .post('/subscriptions/current/resume')
      .set('Cookie', cookie);
    expect(resumed.status).toBe(200);
    expect(resumed.body.subscription.status).toBe('ACTIVE');
    expect(resumed.body.subscription.pausedAt).toBeNull();
    expect(resumed.body.subscription.currentPeriodEnd).toBe(
      '2026-02-03T12:00:00.000Z',
    );
    expect(gateway.resumeCalls[0]?.newPeriodEnd.toISOString()).toBe(
      '2026-02-03T12:00:00.000Z',
    );

    const resumeAgain = await request(app)
      .post('/subscriptions/current/resume')
      .set('Cookie', cookie);
    expect(resumeAgain.status).toBe(409);
  });

  it('schedules cancel at period end and can undo it', async () => {
    const app = await importApp();
    const { starterMonth, proMonth } = await seedPlans();
    const { user, organization } = await createTestUser({
      email: email('cape'),
      withOrganization: true,
    });
    await createActive(organization!.id, starterMonth.id, {
      pendingPlanPriceId: proMonth.id,
    });
    const cookie = await cookieFor(user.email);

    const scheduled = await request(app)
      .post('/subscriptions/current/cancel')
      .set('Cookie', cookie)
      .send({ when: 'AT_PERIOD_END' });
    expect(scheduled.status).toBe(200);
    expect(scheduled.body.subscription.status).toBe('ACTIVE');
    expect(scheduled.body.subscription.cancelAtPeriodEnd).toBe(true);
    expect(scheduled.body.subscription.pendingChange).toBeNull();
    expect(gateway.setCancelAtPeriodEndCalls[0]?.value).toBe(true);

    const blocked = await request(app)
      .post('/subscriptions/current/change-plan')
      .set('Cookie', cookie)
      .send({ planPriceId: proMonth.id });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('CANCELLATION_SCHEDULED');

    const undone = await request(app)
      .post('/subscriptions/current/undo-cancel')
      .set('Cookie', cookie);
    expect(undone.body.subscription.cancelAtPeriodEnd).toBe(false);
    expect(gateway.setCancelAtPeriodEndCalls[1]?.value).toBe(false);
  });

  it('cancels immediately and then allows a new checkout', async () => {
    const app = await importApp();
    const { starterMonth } = await seedPlans();
    const { user, organization } = await createTestUser({
      email: email('now'),
      withOrganization: true,
    });
    await createActive(organization!.id, starterMonth.id);
    const cookie = await cookieFor(user.email);

    const canceled = await request(app)
      .post('/subscriptions/current/cancel')
      .set('Cookie', cookie)
      .send({ when: 'IMMEDIATELY' });
    expect(canceled.status).toBe(200);
    expect(canceled.body.subscription.status).toBe('CANCELED');
    expect(canceled.body.subscription.canceledAt).toBeTruthy();
    expect(canceled.body.subscription.endedAt).toBeTruthy();
    expect(gateway.cancelNowCalls).toHaveLength(1);

    const pause = await request(app)
      .post('/subscriptions/current/pause')
      .set('Cookie', cookie);
    expect(pause.status).toBe(404);
    expect(pause.body.error.code).toBe('NO_ACTIVE_SUBSCRIPTION');

    const created = await request(app)
      .post('/subscriptions')
      .set('Cookie', cookie)
      .send({
        planPriceId: starterMonth.id,
        paymentToken: 'tok_sim_visa_ok',
      });
    expect(created.status).toBe(201);
    expect(created.body.subscription.status).toBe('PENDING');
  });

  it('returns capabilities, pendingChange, and a read-only preview', async () => {
    const app = await importApp();
    const { starterMonth, proMonth } = await seedPlans();
    const { user, organization } = await createTestUser({
      email: email('view'),
      withOrganization: true,
    });
    const cookie = await cookieFor(user.email);

    await prisma.subscription.create({
      data: {
        organizationId: organization!.id,
        planPriceId: starterMonth.id,
        status: SubscriptionStatus.PENDING,
      },
    });
    const pending = await request(app)
      .get('/subscriptions/current')
      .set('Cookie', cookie);
    expect(pending.body.subscription.capabilities.canChangePlan).toBe(false);
    await prisma.subscription.deleteMany({
      where: { organizationId: organization!.id },
    });

    await createActive(organization!.id, starterMonth.id);
    const active = await request(app)
      .get('/subscriptions/current')
      .set('Cookie', cookie);
    expect(active.body.subscription.capabilities.canChangePlan).toBe(true);
    expect(active.body.subscription.planPriceId).toBe(starterMonth.id);
    expect(active.body.subscription.usageLimit).toBe(100);

    const preview = await request(app)
      .get(`/subscriptions/current/change-preview?planPriceId=${proMonth.id}`)
      .set('Cookie', cookie);
    expect(preview.status).toBe(200);
    expect(preview.body.kind).toBe('UPGRADE');
    expect(preview.body.proration.chargeAmount).toBe(
      prorateUpgrade({
        oldAmount: 900,
        newAmount: 2900,
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        now: NOW,
      }).chargeAmount,
    );
    expect(gateway.changePlanCalls).toHaveLength(0);
    expect(
      (await prisma.subscription.findFirstOrThrow({
        where: { organizationId: organization!.id },
      })).planPriceId,
    ).toBe(starterMonth.id);

    await prisma.subscription.updateMany({
      where: { organizationId: organization!.id },
      data: { pendingPlanPriceId: proMonth.id },
    });
    const scheduled = await request(app)
      .get('/subscriptions/current')
      .set('Cookie', cookie);
    expect(scheduled.body.subscription.pendingChange.planPriceId).toBe(
      proMonth.id,
    );
    expect(scheduled.body.subscription.capabilities.canUndoScheduledChange).toBe(
      true,
    );

    await prisma.subscription.updateMany({
      where: { organizationId: organization!.id },
      data: { pendingPlanPriceId: null, cancelAtPeriodEnd: true },
    });
    const canceling = await request(app)
      .get('/subscriptions/current')
      .set('Cookie', cookie);
    expect(canceling.body.subscription.capabilities.canUndoCancel).toBe(true);
    expect(canceling.body.subscription.capabilities.canChangePlan).toBe(false);

    await prisma.subscription.updateMany({
      where: { organizationId: organization!.id },
      data: {
        cancelAtPeriodEnd: false,
        status: SubscriptionStatus.PAUSED,
        pausedAt: NOW,
      },
    });
    const paused = await request(app)
      .get('/subscriptions/current')
      .set('Cookie', cookie);
    expect(paused.body.subscription.capabilities.canResume).toBe(true);
    expect(paused.body.subscription.capabilities.canPause).toBe(false);

    await prisma.subscription.updateMany({
      where: { organizationId: organization!.id },
      data: { status: SubscriptionStatus.PAST_DUE, pausedAt: null },
    });
    const pastDue = await request(app)
      .get('/subscriptions/current')
      .set('Cookie', cookie);
    expect(pastDue.body.subscription.capabilities.canChangePlan).toBe(false);
    expect(pastDue.body.subscription.capabilities.canCancelNow).toBe(true);

    await prisma.subscription.updateMany({
      where: { organizationId: organization!.id },
      data: {
        status: SubscriptionStatus.CANCELED,
        canceledAt: NOW,
        endedAt: NOW,
      },
    });
    const canceled = await request(app)
      .get('/subscriptions/current')
      .set('Cookie', cookie);
    expect(canceled.body.subscription.capabilities.canChangePlan).toBe(false);
    expect(canceled.body.subscription.capabilities.canCancelNow).toBe(false);
  });

  it('isolates organizations from each other', async () => {
    const app = await importApp();
    const { starterMonth, proMonth } = await seedPlans();
    const a = await createTestUser({
      email: email('a'),
      withOrganization: true,
    });
    const b = await createTestUser({
      email: email('b'),
      withOrganization: true,
    });
    await createActive(a.organization!.id, starterMonth.id);
    const bSub = await createActive(b.organization!.id, proMonth.id);
    const aCookie = await cookieFor(a.user.email);

    const current = await request(app)
      .get('/subscriptions/current')
      .set('Cookie', aCookie);
    expect(current.body.subscription.planPriceId).toBe(starterMonth.id);
    expect(current.body.subscription.id).not.toBe(bSub.id);

    await request(app)
      .post('/subscriptions/current/change-plan')
      .set('Cookie', aCookie)
      .send({ planPriceId: proMonth.id });
    const bStored = await prisma.subscription.findUniqueOrThrow({
      where: { id: bSub.id },
    });
    expect(bStored.planPriceId).toBe(proMonth.id);
    expect(bStored.status).toBe(SubscriptionStatus.ACTIVE);
  });
});

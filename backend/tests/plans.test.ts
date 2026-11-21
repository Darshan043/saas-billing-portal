import { BillingInterval, UserRole } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { billingIntervalSchema } from '../src/modules/plans/plans.schemas';
import { assertTestDatabase, TEST_DATABASE_NAME } from './dbSafety';
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

function createBody(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Pro',
    description: 'For growing teams.',
    features: ['Advanced analytics', 'Priority support', 'API access'],
    usageLimit: 1000,
    currency: 'USD',
    monthlyAmount: 99900,
    yearlyAmount: 999900,
    ...overrides,
  };
}

async function seedPlan(options?: {
  name?: string;
  isActive?: boolean;
  monthlyAmount?: number;
  yearlyAmount?: number;
}) {
  const plan = await prisma.plan.create({
    data: {
      name: options?.name ?? 'Seeded',
      description: 'Seeded plan',
      features: ['Feature A'],
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
      isActive: true,
    },
  });
  const year = await prisma.planPrice.create({
    data: {
      planId: plan.id,
      interval: BillingInterval.YEAR,
      amount: options?.yearlyAmount ?? 9000,
      currency: 'USD',
      isActive: true,
    },
  });
  return { plan, month, year };
}

describe('plans', () => {
  beforeEach(async () => {
    await expectTestDatabase();
    await clearTestUsersAndOrgs();
    await clearTestPlans();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('GET /plans is public and returns only active plans with current prices', async () => {
    const app = await importApp();
    const active = await seedPlan({ name: 'Active Plan', monthlyAmount: 500, yearlyAmount: 5000 });
    await seedPlan({ name: 'Inactive Plan', isActive: false });

    await prisma.planPrice.update({
      where: { id: active.month.id },
      data: { isActive: false, retiredAt: new Date() },
    });
    const currentMonth = await prisma.planPrice.create({
      data: {
        planId: active.plan.id,
        interval: BillingInterval.MONTH,
        amount: 700,
        currency: 'USD',
        isActive: true,
      },
    });

    const res = await request(app).get('/plans?organizationId=not-trusted');
    expect(res.status).toBe(200);
    expect(res.body.plans).toHaveLength(1);
    expect(res.body.plans[0].name).toBe('Active Plan');
    expect(res.body.plans[0].isActive).toBeUndefined();
    expect(res.body.plans[0].features).toEqual(['Feature A']);
    expect(res.body.plans[0].usageLimit).toBe(100);

    const intervals = res.body.plans[0].prices.map(
      (price: { interval: string }) => price.interval,
    );
    expect(intervals.sort()).toEqual(['MONTH', 'YEAR']);
    expect(
      res.body.plans[0].prices.find((price: { interval: string }) => price.interval === 'MONTH'),
    ).toMatchObject({
      id: currentMonth.id,
      amount: 700,
      currency: 'USD',
    });
    expect(
      res.body.plans[0].prices.find((price: { interval: string }) => price.interval === 'YEAR'),
    ).toMatchObject({ amount: 5000, currency: 'USD' });
    expect(JSON.stringify(res.body)).not.toContain(active.month.id);
    expect(JSON.stringify(res.body)).not.toContain('providerPriceId');
  });

  it('admin can create, list, edit, and deactivate plans; customers and guests cannot', async () => {
    const app = await importApp();
    const admin = await createTestUser({
      email: 'admin@example.com',
      name: 'Admin',
      role: UserRole.ADMIN,
    });
    const customer = await createTestUser({
      email: 'cust@example.com',
      name: 'Customer',
      withOrganization: true,
    });
    const adminLogin = await loginAs(app, admin.user.email);
    const customerLogin = await loginAs(app, customer.user.email);

    const created = await request(app)
      .post('/admin/plans')
      .set('Cookie', adminLogin.cookie ?? '')
      .send(createBody());
    expect(created.status).toBe(201);
    expect(created.body.plan).toMatchObject({
      name: 'Pro',
      usageLimit: 1000,
      isActive: true,
    });
    expect(created.body.plan.prices).toHaveLength(2);

    const listed = await request(app)
      .get('/admin/plans')
      .set('Cookie', adminLogin.cookie ?? '');
    expect(listed.status).toBe(200);
    expect(listed.body.plans).toHaveLength(1);

    const patched = await request(app)
      .patch(`/admin/plans/${created.body.plan.id}`)
      .set('Cookie', adminLogin.cookie ?? '')
      .send({ name: 'Pro Plus', usageLimit: 2000 });
    expect(patched.status).toBe(200);
    expect(patched.body.plan.name).toBe('Pro Plus');
    expect(patched.body.plan.usageLimit).toBe(2000);

    const deactivated = await request(app)
      .patch(`/admin/plans/${created.body.plan.id}`)
      .set('Cookie', adminLogin.cookie ?? '')
      .send({ isActive: false });
    expect(deactivated.status).toBe(200);
    expect(deactivated.body.plan.isActive).toBe(false);

    const adminSeesInactive = await request(app)
      .get('/admin/plans')
      .set('Cookie', adminLogin.cookie ?? '');
    expect(adminSeesInactive.body.plans[0].isActive).toBe(false);

    const publicAfter = await request(app).get('/plans');
    expect(publicAfter.body.plans).toHaveLength(0);

    const customerCreate = await request(app)
      .post('/admin/plans')
      .set('Cookie', customerLogin.cookie ?? '')
      .send(createBody({ name: 'Hacker Plan' }));
    expect(customerCreate.status).toBe(403);

    const customerEdit = await request(app)
      .patch(`/admin/plans/${created.body.plan.id}`)
      .set('Cookie', customerLogin.cookie ?? '')
      .send({ name: 'Hacked' });
    expect(customerEdit.status).toBe(403);

    const customerDeactivate = await request(app)
      .patch(`/admin/plans/${created.body.plan.id}`)
      .set('Cookie', customerLogin.cookie ?? '')
      .send({ isActive: false });
    expect(customerDeactivate.status).toBe(403);

    const guestCreate = await request(app).post('/admin/plans').send(createBody());
    expect(guestCreate.status).toBe(401);
    const guestList = await request(app).get('/admin/plans');
    expect(guestList.status).toBe(401);
    const guestPatch = await request(app)
      .patch(`/admin/plans/${created.body.plan.id}`)
      .send({ isActive: false });
    expect(guestPatch.status).toBe(401);
  });

  it('rejects invalid create and update payloads', async () => {
    const app = await importApp();
    const admin = await createTestUser({
      email: 'admin@example.com',
      role: UserRole.ADMIN,
    });
    const { cookie } = await loginAs(app, admin.user.email);

    const zeroPrice = await request(app)
      .post('/admin/plans')
      .set('Cookie', cookie ?? '')
      .send(createBody({ monthlyAmount: 0 }));
    expect(zeroPrice.status).toBe(400);
    expect(zeroPrice.body.error.code).toBe('VALIDATION_ERROR');
    expect(zeroPrice.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'monthlyAmount' })]),
    );

    const negative = await request(app)
      .post('/admin/plans')
      .set('Cookie', cookie ?? '')
      .send(createBody({ yearlyAmount: -100 }));
    expect(negative.status).toBe(400);
    expect(negative.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'yearlyAmount' })]),
    );

    const missingLimit = await request(app)
      .post('/admin/plans')
      .set('Cookie', cookie ?? '')
      .send(createBody({ usageLimit: undefined, name: 'No Limit' }));
    expect(missingLimit.status).toBe(400);
    expect(missingLimit.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'usageLimit' })]),
    );

    const badLimit = await request(app)
      .post('/admin/plans')
      .set('Cookie', cookie ?? '')
      .send(createBody({ usageLimit: 0, name: 'Zero Limit' }));
    expect(badLimit.status).toBe(400);

    const blankName = await request(app)
      .post('/admin/plans')
      .set('Cookie', cookie ?? '')
      .send(createBody({ name: '   ' }));
    expect(blankName.status).toBe(400);
    expect(blankName.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'name' })]),
    );

    const badFeatures = await request(app)
      .post('/admin/plans')
      .set('Cookie', cookie ?? '')
      .send(createBody({ features: 'not-an-array', name: 'Bad Features' }));
    expect(badFeatures.status).toBe(400);
    expect(badFeatures.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'features' })]),
    );

    const emptyFeatures = await request(app)
      .post('/admin/plans')
      .set('Cookie', cookie ?? '')
      .send(createBody({ features: [], name: 'Empty Features' }));
    expect(emptyFeatures.status).toBe(400);

    const badInterval = await request(app)
      .post('/admin/plans')
      .set('Cookie', cookie ?? '')
      .send(createBody({ interval: 'WEEKLY', name: 'Weekly' }));
    expect(badInterval.status).toBe(400);
    expect(badInterval.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'interval' })]),
    );
    expect(billingIntervalSchema.safeParse('WEEKLY').success).toBe(false);
    expect(billingIntervalSchema.safeParse('MONTHLY').success).toBe(true);

    const created = await request(app)
      .post('/admin/plans')
      .set('Cookie', cookie ?? '')
      .send(createBody({ name: 'Valid' }));
    expect(created.status).toBe(201);

    const emptyPatch = await request(app)
      .patch(`/admin/plans/${created.body.plan.id}`)
      .set('Cookie', cookie ?? '')
      .send({});
    expect(emptyPatch.status).toBe(400);

    const badId = await request(app)
      .patch('/admin/plans/not-a-uuid')
      .set('Cookie', cookie ?? '')
      .send({ name: 'X' });
    expect(badId.status).toBe(400);

    const duplicate = await request(app)
      .post('/admin/plans')
      .set('Cookie', cookie ?? '')
      .send(createBody({ name: 'Valid' }));
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('PLAN_NAME_EXISTS');
  });

  it('versions monthly and yearly prices independently and preserves old rows', async () => {
    const app = await importApp();
    const admin = await createTestUser({
      email: 'admin@example.com',
      role: UserRole.ADMIN,
    });
    const { cookie } = await loginAs(app, admin.user.email);

    const created = await request(app)
      .post('/admin/plans')
      .set('Cookie', cookie ?? '')
      .send(createBody({ name: 'Versioned' }));
    expect(created.status).toBe(201);
    const planId = created.body.plan.id as string;
    const originalMonth = created.body.plan.prices.find(
      (price: { interval: string }) => price.interval === 'MONTH',
    );
    const originalYear = created.body.plan.prices.find(
      (price: { interval: string }) => price.interval === 'YEAR',
    );
    expect(originalMonth.amount).toBe(99900);
    expect(originalYear.amount).toBe(999900);

    const monthPatch = await request(app)
      .patch(`/admin/plans/${planId}`)
      .set('Cookie', cookie ?? '')
      .send({ monthlyAmount: 120000 });
    expect(monthPatch.status).toBe(200);
    const newMonth = monthPatch.body.plan.prices.find(
      (price: { interval: string }) => price.interval === 'MONTH',
    );
    const yearAfterMonth = monthPatch.body.plan.prices.find(
      (price: { interval: string }) => price.interval === 'YEAR',
    );
    expect(newMonth.id).not.toBe(originalMonth.id);
    expect(newMonth.amount).toBe(120000);
    expect(yearAfterMonth.id).toBe(originalYear.id);
    expect(yearAfterMonth.amount).toBe(999900);

    const retiredMonth = await prisma.planPrice.findUnique({
      where: { id: originalMonth.id },
    });
    expect(retiredMonth?.isActive).toBe(false);
    expect(retiredMonth?.retiredAt).not.toBeNull();
    expect(retiredMonth?.amount).toBe(99900);

    const liveYear = await prisma.planPrice.findUnique({
      where: { id: originalYear.id },
    });
    expect(liveYear?.isActive).toBe(true);
    expect(liveYear?.retiredAt).toBeNull();

    const yearPatch = await request(app)
      .patch(`/admin/plans/${planId}`)
      .set('Cookie', cookie ?? '')
      .send({ yearlyAmount: 1100000 });
    expect(yearPatch.status).toBe(200);
    const newYear = yearPatch.body.plan.prices.find(
      (price: { interval: string }) => price.interval === 'YEAR',
    );
    expect(newYear.id).not.toBe(originalYear.id);
    expect(newYear.amount).toBe(1100000);

    const retiredYear = await prisma.planPrice.findUnique({
      where: { id: originalYear.id },
    });
    expect(retiredYear?.isActive).toBe(false);
    expect(retiredYear?.retiredAt).not.toBeNull();

    const publicPlans = await request(app).get('/plans');
    const publicIds = publicPlans.body.plans[0].prices.map(
      (price: { id: string }) => price.id,
    );
    expect(publicIds).toContain(newMonth.id);
    expect(publicIds).toContain(newYear.id);
    expect(publicIds).not.toContain(originalMonth.id);
    expect(publicIds).not.toContain(originalYear.id);

    const allRows = await prisma.planPrice.count({ where: { planId } });
    expect(allRows).toBe(4);
  });

  it('rolls back a failed price change so the plan is not partially updated', async () => {
    const app = await importApp();
    const admin = await createTestUser({
      email: 'admin@example.com',
      role: UserRole.ADMIN,
    });
    const { cookie } = await loginAs(app, admin.user.email);
    const created = await request(app)
      .post('/admin/plans')
      .set('Cookie', cookie ?? '')
      .send(createBody({ name: 'Atomic' }));
    const planId = created.body.plan.id as string;

    const originalTransaction = prisma.$transaction.bind(prisma);
    vi.spyOn(prisma, '$transaction').mockImplementationOnce((arg) => {
      if (typeof arg !== 'function') {
        throw new Error('expected interactive transaction');
      }
      return originalTransaction(async (tx) => {
        tx.planPrice.create = (async () => {
          throw new Error('forced price create failure');
        }) as typeof tx.planPrice.create;
        return arg(tx);
      });
    });

    const res = await request(app)
      .patch(`/admin/plans/${planId}`)
      .set('Cookie', cookie ?? '')
      .send({ name: 'Atomic Changed', monthlyAmount: 1 });
    expect(res.status).toBe(500);

    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    expect(plan?.name).toBe('Atomic');
    const prices = await prisma.planPrice.findMany({ where: { planId } });
    expect(prices).toHaveLength(2);
    expect(prices.every((price) => price.isActive)).toBe(true);
    expect(
      prices.find((price) => price.interval === BillingInterval.MONTH)?.amount,
    ).toBe(99900);
  });
});

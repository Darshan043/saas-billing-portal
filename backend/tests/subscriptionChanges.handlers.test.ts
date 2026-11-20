import {
  AuditSource,
  BillingInterval,
  InvoiceStatus,
  PaymentStatus,
  SubscriptionStatus,
  WebhookEventStatus,
} from '@prisma/client';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRegistry } from '../src/jobs/handlers';
import { registerCheckoutHandlers } from '../src/jobs/handlers/checkout';
import {
  handlePaymentSucceeded,
  registerInvoiceHandlers,
} from '../src/jobs/handlers/paymentSucceeded';
import { registerStubHandlers } from '../src/jobs/handlers/stubs';
import {
  handleSubscriptionCancelled,
  handleSubscriptionUpdated,
  registerSubscriptionChangeHandlers,
} from '../src/jobs/handlers/subscriptionChanges';
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
} from './helpers';

async function expectTestDatabase(): Promise<void> {
  assertTestDatabase(process.env.DATABASE_URL);
  const rows = await prisma.$queryRaw<Array<{ current_database: string }>>`
    SELECT current_database()
  `;
  expect(rows[0]?.current_database).toBe(TEST_DATABASE_NAME);
}

function changeRegistry() {
  const registry = createRegistry();
  registerStubHandlers(registry);
  registerCheckoutHandlers(registry);
  registerInvoiceHandlers(registry);
  registerSubscriptionChangeHandlers(registry);
  return registry;
}

function simulatorPayload(type: string, data: Record<string, unknown>) {
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
  providerEventId?: string,
) {
  const payload = simulatorPayload(type, data);
  return prisma.webhookEvent.create({
    data: {
      providerEventId: providerEventId ?? null,
      type,
      payload,
      signatureValid: true,
      status: WebhookEventStatus.RECEIVED,
    },
  });
}

async function seedPlan() {
  const plan = await prisma.plan.create({
    data: {
      name: `Plan ${crypto.randomUUID()}`,
      description: 'Test',
      features: ['a'],
      usageLimit: 100,
      isActive: true,
      sortOrder: 1,
    },
  });
  const month = await prisma.planPrice.create({
    data: {
      planId: plan.id,
      interval: BillingInterval.MONTH,
      amount: 900,
      currency: 'USD',
      isActive: true,
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
  const proMonth = await prisma.planPrice.create({
    data: {
      planId: pro.id,
      interval: BillingInterval.MONTH,
      amount: 2900,
      currency: 'USD',
      isActive: true,
    },
  });
  return { plan, month, pro, proMonth };
}

describe('subscription change handlers', () => {
  beforeEach(async () => {
    await expectTestDatabase();
    await clearTestUsersAndOrgs();
    await clearTestPlans();
  });

  afterEach(() => {
    setPaymentGateway(new SimulatorPaymentGateway());
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('replaces updated and cancelled stubs with real handlers', () => {
    const registry = changeRegistry();
    expect(registry.get('subscription.updated')).toBe(handleSubscriptionUpdated);
    expect(registry.get('subscription.cancelled')).toBe(
      handleSubscriptionCancelled,
    );
    expect(registry.get('payment.succeeded')).toBe(handlePaymentSucceeded);
    expect(registry.get('subscription.created')).not.toBeUndefined();
  });

  it('cancels from an ended subscription.cancelled event once', async () => {
    const { organization } = await createTestUser({
      email: `h-${crypto.randomUUID()}@example.test`,
      withOrganization: true,
    });
    const { month } = await seedPlan();
    const sub = await prisma.subscription.create({
      data: {
        organizationId: organization!.id,
        planPriceId: month.id,
        status: SubscriptionStatus.ACTIVE,
        providerSubscriptionId: `sim_${crypto.randomUUID()}`,
      },
    });
    const processWebhookEvent = createWebhookProcessor(changeRegistry());
    const event = await insertWebhookEvent('subscription.cancelled', {
      subscriptionId: sub.providerSubscriptionId,
      status: 'canceled',
      canceledAt: '2026-01-20T00:00:00.000Z',
      metadata: { subscriptionId: sub.id, organizationId: organization!.id },
    });
    await processWebhookEvent(event.id);
    await processWebhookEvent(event.id);
    const stored = await prisma.subscription.findUniqueOrThrow({
      where: { id: sub.id },
    });
    expect(stored.status).toBe(SubscriptionStatus.CANCELED);
    expect(
      await prisma.auditLog.count({
        where: {
          subscriptionId: sub.id,
          action: 'subscription.canceled',
          source: AuditSource.WEBHOOK,
        },
      }),
    ).toBe(1);

    const already = await prisma.subscription.update({
      where: { id: sub.id },
      data: { status: SubscriptionStatus.CANCELED },
    });
    const second = await insertWebhookEvent('subscription.cancelled', {
      subscriptionId: already.providerSubscriptionId,
      status: 'canceled',
      metadata: { subscriptionId: sub.id },
    });
    await processWebhookEvent(second.id);
    expect(
      await prisma.auditLog.count({
        where: { subscriptionId: sub.id, action: 'subscription.canceled' },
      }),
    ).toBe(1);
  });

  it('ignores a cancelled event that only schedules period-end cancel', async () => {
    const { organization } = await createTestUser({
      email: `h-${crypto.randomUUID()}@example.test`,
      withOrganization: true,
    });
    const { month } = await seedPlan();
    const sub = await prisma.subscription.create({
      data: {
        organizationId: organization!.id,
        planPriceId: month.id,
        status: SubscriptionStatus.ACTIVE,
      },
    });
    const processWebhookEvent = createWebhookProcessor(changeRegistry());
    const event = await insertWebhookEvent('subscription.cancelled', {
      subscriptionId: 'sim-unknown',
      status: 'active',
      cancelAtPeriodEnd: true,
      metadata: { subscriptionId: sub.id },
    });
    await processWebhookEvent(event.id);
    const stored = await prisma.subscription.findUniqueOrThrow({
      where: { id: sub.id },
    });
    expect(stored.status).toBe(SubscriptionStatus.ACTIVE);
    expect(stored.cancelAtPeriodEnd).toBe(false);
  });

  it('processes cancelled for an unknown subscription without error', async () => {
    const processWebhookEvent = createWebhookProcessor(changeRegistry());
    const event = await insertWebhookEvent('subscription.cancelled', {
      subscriptionId: crypto.randomUUID(),
      status: 'canceled',
    });
    await processWebhookEvent(event.id);
    const row = await prisma.webhookEvent.findUniqueOrThrow({
      where: { id: event.id },
    });
    expect(row.status).toBe(WebhookEventStatus.PROCESSED);
  });

  it('updated confirmation fills an empty provider id and does not change plan', async () => {
    const { organization } = await createTestUser({
      email: `h-${crypto.randomUUID()}@example.test`,
      withOrganization: true,
    });
    const { month, proMonth } = await seedPlan();
    const sub = await prisma.subscription.create({
      data: {
        organizationId: organization!.id,
        planPriceId: month.id,
        status: SubscriptionStatus.ACTIVE,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: new Date('2026-02-01T00:00:00.000Z'),
      },
    });
    const providerId = `sim_${crypto.randomUUID()}`;
    const processWebhookEvent = createWebhookProcessor(changeRegistry());
    const event = await insertWebhookEvent('subscription.updated', {
      subscriptionId: providerId,
      status: 'paused',
      amount: 1,
      planPriceId: proMonth.id,
      metadata: { subscriptionId: sub.id, organizationId: organization!.id },
    });
    await processWebhookEvent(event.id);
    const stored = await prisma.subscription.findUniqueOrThrow({
      where: { id: sub.id },
    });
    expect(stored.providerSubscriptionId).toBe(providerId);
    expect(stored.status).toBe(SubscriptionStatus.ACTIVE);
    expect(stored.planPriceId).toBe(month.id);
    expect(stored.cancelAtPeriodEnd).toBe(false);
  });

  it('updated handler waits for a held row lock', async () => {
    const { organization } = await createTestUser({
      email: `h-${crypto.randomUUID()}@example.test`,
      withOrganization: true,
    });
    const { month } = await seedPlan();
    const sub = await prisma.subscription.create({
      data: {
        organizationId: organization!.id,
        planPriceId: month.id,
        status: SubscriptionStatus.ACTIVE,
      },
    });
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const locker = prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`
          SELECT id FROM subscriptions WHERE id = ${sub.id}::uuid FOR UPDATE
        `;
        await held;
      },
      { timeout: 15_000 },
    );
    const processWebhookEvent = createWebhookProcessor(changeRegistry());
    const event = await insertWebhookEvent('subscription.updated', {
      subscriptionId: `sim_${crypto.randomUUID()}`,
      status: 'paused',
      metadata: { subscriptionId: sub.id },
    });
    const processed = processWebhookEvent(event.id);
    await new Promise((resolve) => setTimeout(resolve, 200));
    const mid = await prisma.webhookEvent.findUniqueOrThrow({
      where: { id: event.id },
    });
    expect(mid.status).not.toBe(WebhookEventStatus.PROCESSED);
    release();
    await locker;
    await processed;
    const done = await prisma.webhookEvent.findUniqueOrThrow({
      where: { id: event.id },
    });
    expect(done.status).toBe(WebhookEventStatus.PROCESSED);
    const stored = await prisma.subscription.findUniqueOrThrow({
      where: { id: sub.id },
    });
    expect(stored.status).toBe(SubscriptionStatus.ACTIVE);
  });

  it('uses metadata description for upgrade invoices in either processing order', async () => {
    const { organization } = await createTestUser({
      email: `h-${crypto.randomUUID()}@example.test`,
      withOrganization: true,
    });
    const { month, proMonth } = await seedPlan();
    const description =
      'Upgrade from Starter to Pro (Monthly): prorated charge for 1 Jan 2026 to 1 Feb 2026';
    const processWebhookEvent = createWebhookProcessor(changeRegistry());

    const before = await prisma.subscription.create({
      data: {
        organizationId: organization!.id,
        planPriceId: month.id,
        status: SubscriptionStatus.ACTIVE,
      },
    });
    const beforeEvent = await insertWebhookEvent('payment.succeeded', {
      paymentId: crypto.randomUUID(),
      amount: 1032,
      currency: 'USD',
      description,
      metadata: {
        subscriptionId: before.id,
        organizationId: organization!.id,
        reason: 'plan_upgrade',
        description,
      },
    });
    await processWebhookEvent(beforeEvent.id);
    const beforeItem = await prisma.invoiceItem.findFirstOrThrow({
      where: { invoice: { subscriptionId: before.id } },
    });
    expect(beforeItem.description).toBe(description);

    await prisma.subscription.update({
      where: { id: before.id },
      data: { planPriceId: proMonth.id },
    });
    const afterEvent = await insertWebhookEvent('payment.succeeded', {
      paymentId: crypto.randomUUID(),
      amount: 500,
      currency: 'USD',
      metadata: {
        subscriptionId: before.id,
        organizationId: organization!.id,
        reason: 'plan_upgrade',
        description,
      },
    });
    await processWebhookEvent(afterEvent.id);
    const afterItem = await prisma.invoiceItem.findFirstOrThrow({
      where: { amount: 500 },
    });
    expect(afterItem.description).toBe(description);
  });

  it('replays the same upgrade payment ten times as one invoice', async () => {
    const { organization } = await createTestUser({
      email: `h-${crypto.randomUUID()}@example.test`,
      withOrganization: true,
    });
    const { month } = await seedPlan();
    const sub = await prisma.subscription.create({
      data: {
        organizationId: organization!.id,
        planPriceId: month.id,
        status: SubscriptionStatus.ACTIVE,
      },
    });
    const paymentId = crypto.randomUUID();
    const processWebhookEvent = createWebhookProcessor(changeRegistry());
    const description = 'Upgrade from Starter to Pro (Monthly): prorated charge';
    for (let i = 0; i < 10; i += 1) {
      const event = await insertWebhookEvent('payment.succeeded', {
        paymentId,
        amount: 1032,
        currency: 'USD',
        metadata: {
          subscriptionId: sub.id,
          organizationId: organization!.id,
          reason: 'plan_upgrade',
          description,
        },
      });
      await processWebhookEvent(event.id);
    }
    expect(await prisma.invoice.count()).toBe(1);
    expect(await prisma.payment.count()).toBe(1);
    expect(
      (await prisma.invoice.findFirstOrThrow()).status,
    ).toBe(InvoiceStatus.PAID);
    expect(
      (await prisma.payment.findFirstOrThrow()).status,
    ).toBe(PaymentStatus.SUCCEEDED);
  });

  it('end-to-end subscribe then upgrade with two invoices', async () => {
    const gateway = new FakePaymentGateway();
    setPaymentGateway(gateway);
    await importApp();
    const { organization } = await createTestUser({
      email: `h-${crypto.randomUUID()}@example.test`,
      withOrganization: true,
    });
    const { month, proMonth } = await seedPlan();
    const processWebhookEvent = createWebhookProcessor(changeRegistry());
    const pending = await prisma.subscription.create({
      data: {
        organizationId: organization!.id,
        planPriceId: month.id,
        status: SubscriptionStatus.PENDING,
        providerSubscriptionId: `sim_${crypto.randomUUID()}`,
      },
    });
    const checkoutPay = await insertWebhookEvent('payment.succeeded', {
      paymentId: crypto.randomUUID(),
      amount: 900,
      currency: 'USD',
      metadata: {
        subscriptionId: pending.id,
        organizationId: organization!.id,
      },
    });
    await processWebhookEvent(checkoutPay.id);
    const activated = await insertWebhookEvent('subscription.activated', {
      subscriptionId: pending.providerSubscriptionId,
      currentPeriodStart: '2026-01-01T00:00:00.000Z',
      currentPeriodEnd: '2026-02-01T00:00:00.000Z',
      metadata: {
        subscriptionId: pending.id,
        organizationId: organization!.id,
      },
    });
    await processWebhookEvent(activated.id);

    await prisma.subscription.update({
      where: { id: pending.id },
      data: { planPriceId: proMonth.id },
    });
    const upgradePay = await insertWebhookEvent('payment.succeeded', {
      paymentId: crypto.randomUUID(),
      amount: 1032,
      currency: 'USD',
      metadata: {
        subscriptionId: pending.id,
        organizationId: organization!.id,
        reason: 'plan_upgrade',
        description: 'Upgrade from Starter to Pro (Monthly): prorated charge',
      },
    });
    await processWebhookEvent(upgradePay.id);

    const invoices = await prisma.invoice.findMany({
      orderBy: { number: 'asc' },
      include: { items: true },
    });
    expect(invoices).toHaveLength(2);
    expect(invoices[0]?.number).toBe(1);
    expect(invoices[1]?.number).toBe(2);
    expect(invoices[1]?.items[0]?.description).toContain('Upgrade from');
    const stored = await prisma.subscription.findUniqueOrThrow({
      where: { id: pending.id },
      include: { planPrice: { include: { plan: true } } },
    });
    expect(stored.planPrice.plan.usageLimit).toBe(1000);
  });
});

import {
  BillingInterval,
  InvoiceStatus,
  PaymentStatus,
  SubscriptionStatus,
  WebhookEventStatus,
} from '@prisma/client';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRegistry } from '../src/jobs/handlers';
import {
  handlePaymentFailed,
  handleSubscriptionActivated,
  registerCheckoutHandlers,
} from '../src/jobs/handlers/checkout';
import {
  handlePaymentSucceeded,
  paymentSucceededTestHooks,
  registerInvoiceHandlers,
} from '../src/jobs/handlers/paymentSucceeded';
import { registerStubHandlers } from '../src/jobs/handlers/stubs';
import { createWebhookProcessor } from '../src/jobs/webhookProcessor';
import { prisma } from '../src/lib/prisma';
import { formatInvoiceNumber } from '../src/lib/invoiceNumber';
import { assertTestDatabase, TEST_DATABASE_NAME } from './dbSafety';
import { clearTestPlans, clearTestUsersAndOrgs, createTestUser } from './helpers';

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

function simulatorPayload(type: string, data: Record<string, unknown>) {
  return {
    id: crypto.randomUUID(),
    type,
    createdAt: new Date().toISOString(),
    objectId:
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
      description: 'Test plan',
      features: ['Feature A'],
      usageLimit: 100,
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
  return { plan, month };
}

describe('payment.succeeded invoices', () => {
  beforeEach(async () => {
    await expectTestDatabase();
    await clearTestUsersAndOrgs();
    await clearTestPlans();
    paymentSucceededTestHooks.afterAllocate = async () => undefined;
  });

  afterEach(() => {
    paymentSucceededTestHooks.afterAllocate = async () => undefined;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates one PAID invoice, one item, and one SUCCEEDED payment', async () => {
    const { organization } = await createTestUser({
      email: `inv-${crypto.randomUUID()}@example.test`,
      withOrganization: true,
    });
    const { month, plan } = await seedPlan();
    const subscription = await prisma.subscription.create({
      data: {
        organizationId: organization!.id,
        planPriceId: month.id,
        status: SubscriptionStatus.PENDING,
      },
    });
    const processWebhookEvent = createWebhookProcessor(invoiceRegistry());
    const paymentId = crypto.randomUUID();
    const event = await insertWebhookEvent('payment.succeeded', {
      paymentId,
      customerId: crypto.randomUUID(),
      amount: 2900,
      currency: 'USD',
      subscriptionId: 'sim-sub-1',
      metadata: {
        subscriptionId: subscription.id,
        organizationId: organization!.id,
      },
    });

    await processWebhookEvent(event.id);

    const invoices = await prisma.invoice.findMany({
      where: { organizationId: organization!.id },
      include: { items: true },
    });
    expect(invoices).toHaveLength(1);
    expect(invoices[0]?.status).toBe(InvoiceStatus.PAID);
    expect(invoices[0]?.number).toBe(1);
    expect(invoices[0]?.total).toBe(2900);
    expect(invoices[0]?.currency).toBe('USD');
    expect(invoices[0]?.subscriptionId).toBe(subscription.id);
    expect(invoices[0]?.items).toHaveLength(1);
    expect(invoices[0]?.items[0]?.description).toContain(plan.name);
    expect(invoices[0]?.items[0]?.description).toContain('Monthly');

    const payments = await prisma.payment.findMany({
      where: { organizationId: organization!.id },
    });
    expect(payments).toHaveLength(1);
    expect(payments[0]?.status).toBe(PaymentStatus.SUCCEEDED);
    expect(payments[0]?.invoiceId).toBe(invoices[0]?.id);
    expect(payments[0]?.subscriptionId).toBe(subscription.id);
    expect(payments[0]?.providerPaymentId).toBe(paymentId);

    const stored = await prisma.webhookEvent.findUniqueOrThrow({
      where: { id: event.id },
    });
    expect(stored.status).toBe(WebhookEventStatus.PROCESSED);
    expect(formatInvoiceNumber(1)).toBe('INV-000001');
  });

  it('processing the same event twice consumes one invoice number', async () => {
    const { organization } = await createTestUser({
      email: `inv-${crypto.randomUUID()}@example.test`,
      withOrganization: true,
    });
    const { month } = await seedPlan();
    const subscription = await prisma.subscription.create({
      data: {
        organizationId: organization!.id,
        planPriceId: month.id,
        status: SubscriptionStatus.PENDING,
      },
    });
    const processWebhookEvent = createWebhookProcessor(invoiceRegistry());
    const event = await insertWebhookEvent('payment.succeeded', {
      paymentId: crypto.randomUUID(),
      amount: 2900,
      currency: 'USD',
      metadata: {
        subscriptionId: subscription.id,
        organizationId: organization!.id,
      },
    });

    await processWebhookEvent(event.id);
    await processWebhookEvent(event.id);

    expect(await prisma.invoice.count()).toBe(1);
    expect(await prisma.invoiceItem.count()).toBe(1);
    expect(await prisma.payment.count()).toBe(1);
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: organization!.id },
    });
    expect(org.nextInvoiceNumber).toBe(2);
  });

  it('different event ids with the same provider payment id create one invoice', async () => {
    const { organization } = await createTestUser({
      email: `inv-${crypto.randomUUID()}@example.test`,
      withOrganization: true,
    });
    const { month } = await seedPlan();
    const subscription = await prisma.subscription.create({
      data: {
        organizationId: organization!.id,
        planPriceId: month.id,
        status: SubscriptionStatus.PENDING,
      },
    });
    const processWebhookEvent = createWebhookProcessor(invoiceRegistry());
    const paymentId = crypto.randomUUID();
    const data = {
      paymentId,
      amount: 2900,
      currency: 'USD',
      metadata: {
        subscriptionId: subscription.id,
        organizationId: organization!.id,
      },
    };

    const first = await insertWebhookEvent('payment.succeeded', data);
    const second = await insertWebhookEvent('payment.succeeded', data);
    await processWebhookEvent(first.id);
    await processWebhookEvent(second.id);

    expect(await prisma.invoice.count()).toBe(1);
    expect(await prisma.payment.count()).toBe(1);

    const parallelOrg = await createTestUser({
      email: `inv-${crypto.randomUUID()}@example.test`,
      withOrganization: true,
    });
    const parallelSub = await prisma.subscription.create({
      data: {
        organizationId: parallelOrg.organization!.id,
        planPriceId: month.id,
        status: SubscriptionStatus.PENDING,
      },
    });
    const parallelPaymentId = crypto.randomUUID();
    const parallelData = {
      paymentId: parallelPaymentId,
      amount: 1500,
      currency: 'USD',
      metadata: {
        subscriptionId: parallelSub.id,
        organizationId: parallelOrg.organization!.id,
      },
    };
    const events = await Promise.all(
      Array.from({ length: 10 }, () =>
        insertWebhookEvent('payment.succeeded', parallelData),
      ),
    );
    await Promise.all(events.map((event) => processWebhookEvent(event.id)));

    expect(
      await prisma.invoice.count({
        where: { organizationId: parallelOrg.organization!.id },
      }),
    ).toBe(1);
    expect(
      await prisma.payment.count({
        where: { organizationId: parallelOrg.organization!.id },
      }),
    ).toBe(1);
    const parallel = await prisma.organization.findUniqueOrThrow({
      where: { id: parallelOrg.organization!.id },
    });
    expect(parallel.nextInvoiceNumber).toBe(2);
    for (const event of events) {
      const stored = await prisma.webhookEvent.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(stored.status).toBe(WebhookEventStatus.PROCESSED);
    }
  });

  it('upgrades an existing FAILED payment to SUCCEEDED with an invoice', async () => {
    const { organization } = await createTestUser({
      email: `inv-${crypto.randomUUID()}@example.test`,
      withOrganization: true,
    });
    const { month } = await seedPlan();
    const subscription = await prisma.subscription.create({
      data: {
        organizationId: organization!.id,
        planPriceId: month.id,
        status: SubscriptionStatus.CANCELED,
        canceledAt: new Date(),
      },
    });
    const paymentId = crypto.randomUUID();
    const failed = await prisma.payment.create({
      data: {
        organizationId: organization!.id,
        subscriptionId: subscription.id,
        providerPaymentId: paymentId,
        status: PaymentStatus.FAILED,
        amount: 2900,
        currency: 'USD',
        failureCode: 'CARD_DECLINED',
        failureMessage: 'Card declined',
      },
    });
    const processWebhookEvent = createWebhookProcessor(invoiceRegistry());
    const event = await insertWebhookEvent('payment.succeeded', {
      paymentId,
      amount: 2900,
      currency: 'USD',
      metadata: {
        subscriptionId: subscription.id,
        organizationId: organization!.id,
      },
    });
    await processWebhookEvent(event.id);

    expect(await prisma.payment.count()).toBe(1);
    const updated = await prisma.payment.findUniqueOrThrow({
      where: { id: failed.id },
    });
    expect(updated.status).toBe(PaymentStatus.SUCCEEDED);
    expect(updated.invoiceId).not.toBeNull();
    expect(updated.failureCode).toBeNull();
    expect(updated.failureMessage).toBeNull();
    expect(await prisma.invoice.count()).toBe(1);
  });

  it('numbers invoices per organization starting at 1', async () => {
    const first = await createTestUser({
      email: `inv-${crypto.randomUUID()}@example.test`,
      withOrganization: true,
    });
    const second = await createTestUser({
      email: `inv-${crypto.randomUUID()}@example.test`,
      withOrganization: true,
    });
    const { month } = await seedPlan();
    const firstSub = await prisma.subscription.create({
      data: {
        organizationId: first.organization!.id,
        planPriceId: month.id,
        status: SubscriptionStatus.PENDING,
      },
    });
    const secondSub = await prisma.subscription.create({
      data: {
        organizationId: second.organization!.id,
        planPriceId: month.id,
        status: SubscriptionStatus.PENDING,
      },
    });
    const processWebhookEvent = createWebhookProcessor(invoiceRegistry());
    await processWebhookEvent(
      (
        await insertWebhookEvent('payment.succeeded', {
          paymentId: crypto.randomUUID(),
          amount: 100,
          currency: 'USD',
          metadata: {
            subscriptionId: firstSub.id,
            organizationId: first.organization!.id,
          },
        })
      ).id,
    );
    await processWebhookEvent(
      (
        await insertWebhookEvent('payment.succeeded', {
          paymentId: crypto.randomUUID(),
          amount: 200,
          currency: 'USD',
          metadata: {
            subscriptionId: firstSub.id,
            organizationId: first.organization!.id,
          },
        })
      ).id,
    );
    await processWebhookEvent(
      (
        await insertWebhookEvent('payment.succeeded', {
          paymentId: crypto.randomUUID(),
          amount: 300,
          currency: 'USD',
          metadata: {
            subscriptionId: secondSub.id,
            organizationId: second.organization!.id,
          },
        })
      ).id,
    );

    const firstNumbers = (
      await prisma.invoice.findMany({
        where: { organizationId: first.organization!.id },
        orderBy: { number: 'asc' },
      })
    ).map((row) => row.number);
    expect(firstNumbers).toEqual([1, 2]);
    const secondInvoice = await prisma.invoice.findFirstOrThrow({
      where: { organizationId: second.organization!.id },
    });
    expect(secondInvoice.number).toBe(1);
  });

  it('rolls back the invoice number when the handler throws after allocate', async () => {
    const { organization } = await createTestUser({
      email: `inv-${crypto.randomUUID()}@example.test`,
      withOrganization: true,
    });
    const { month } = await seedPlan();
    const subscription = await prisma.subscription.create({
      data: {
        organizationId: organization!.id,
        planPriceId: month.id,
        status: SubscriptionStatus.PENDING,
      },
    });
    const processWebhookEvent = createWebhookProcessor(invoiceRegistry());
    paymentSucceededTestHooks.afterAllocate = async () => {
      throw new Error('forced after allocate');
    };
    const failedEvent = await insertWebhookEvent('payment.succeeded', {
      paymentId: crypto.randomUUID(),
      amount: 2900,
      currency: 'USD',
      metadata: {
        subscriptionId: subscription.id,
        organizationId: organization!.id,
      },
    });
    await expect(processWebhookEvent(failedEvent.id)).rejects.toThrow(
      'forced after allocate',
    );
    expect(await prisma.invoice.count()).toBe(0);
    expect(await prisma.payment.count()).toBe(0);
    const afterFail = await prisma.organization.findUniqueOrThrow({
      where: { id: organization!.id },
    });
    expect(afterFail.nextInvoiceNumber).toBe(1);

    paymentSucceededTestHooks.afterAllocate = async () => undefined;
    await processWebhookEvent(
      (
        await insertWebhookEvent('payment.succeeded', {
          paymentId: crypto.randomUUID(),
          amount: 2900,
          currency: 'USD',
          metadata: {
            subscriptionId: subscription.id,
            organizationId: organization!.id,
          },
        })
      ).id,
    );
    const invoice = await prisma.invoice.findFirstOrThrow({
      where: { organizationId: organization!.id },
    });
    expect(invoice.number).toBe(1);
  });

  it('works before and after subscription.activated and does not change status', async () => {
    const { organization } = await createTestUser({
      email: `inv-${crypto.randomUUID()}@example.test`,
      withOrganization: true,
    });
    const { month } = await seedPlan();
    const before = await prisma.subscription.create({
      data: {
        organizationId: organization!.id,
        planPriceId: month.id,
        status: SubscriptionStatus.PENDING,
      },
    });
    const processWebhookEvent = createWebhookProcessor(invoiceRegistry());
    await processWebhookEvent(
      (
        await insertWebhookEvent('payment.succeeded', {
          paymentId: crypto.randomUUID(),
          amount: 900,
          currency: 'USD',
          metadata: {
            subscriptionId: before.id,
            organizationId: organization!.id,
          },
        })
      ).id,
    );
    const stillPending = await prisma.subscription.findUniqueOrThrow({
      where: { id: before.id },
    });
    expect(stillPending.status).toBe(SubscriptionStatus.PENDING);
    await processWebhookEvent(
      (
        await insertWebhookEvent('subscription.activated', {
          subscriptionId: 'sim-before',
          currentPeriodStart: '2026-01-01T00:00:00.000Z',
          currentPeriodEnd: '2026-02-01T00:00:00.000Z',
          metadata: {
            subscriptionId: before.id,
            organizationId: organization!.id,
          },
        })
      ).id,
    );
    expect(
      (await prisma.subscription.findUniqueOrThrow({ where: { id: before.id } }))
        .status,
    ).toBe(SubscriptionStatus.ACTIVE);

    const after = await prisma.subscription.create({
      data: {
        organizationId: (
          await createTestUser({
            email: `inv-${crypto.randomUUID()}@example.test`,
            withOrganization: true,
          })
        ).organization!.id,
        planPriceId: month.id,
        status: SubscriptionStatus.PENDING,
      },
    });
    const afterOrgId = after.organizationId;
    await processWebhookEvent(
      (
        await insertWebhookEvent('subscription.activated', {
          subscriptionId: 'sim-after',
          currentPeriodStart: '2026-03-01T00:00:00.000Z',
          currentPeriodEnd: '2026-04-01T00:00:00.000Z',
          metadata: {
            subscriptionId: after.id,
            organizationId: afterOrgId,
          },
        })
      ).id,
    );
    await processWebhookEvent(
      (
        await insertWebhookEvent('payment.succeeded', {
          paymentId: crypto.randomUUID(),
          amount: 900,
          currency: 'USD',
          metadata: {
            subscriptionId: after.id,
            organizationId: afterOrgId,
          },
        })
      ).id,
    );
    expect(
      (await prisma.subscription.findUniqueOrThrow({ where: { id: after.id } }))
        .status,
    ).toBe(SubscriptionStatus.ACTIVE);
    expect(await prisma.invoice.count({ where: { subscriptionId: after.id } })).toBe(
      1,
    );
    expect(await prisma.invoice.count({ where: { subscriptionId: before.id } })).toBe(
      1,
    );

    const invoiceBefore = await prisma.invoice.findFirstOrThrow({
      where: { subscriptionId: before.id },
    });
    expect(invoiceBefore.periodEnd).toBeNull();
    expect(invoiceBefore.periodStart.getTime()).toBe(
      invoiceBefore.issuedAt.getTime(),
    );

    const invoiceAfter = await prisma.invoice.findFirstOrThrow({
      where: { subscriptionId: after.id },
    });
    expect(invoiceAfter.periodStart.toISOString()).toBe(
      '2026-03-01T00:00:00.000Z',
    );
    expect(invoiceAfter.periodEnd?.toISOString()).toBe(
      '2026-04-01T00:00:00.000Z',
    );
  });

  it('prefers event period dates, then subscription period, and does not invent a cycle', async () => {
    const { organization } = await createTestUser({
      email: `inv-${crypto.randomUUID()}@example.test`,
      withOrganization: true,
    });
    const { month } = await seedPlan();
    const processWebhookEvent = createWebhookProcessor(invoiceRegistry());

    const fromEvent = await prisma.subscription.create({
      data: {
        organizationId: organization!.id,
        planPriceId: month.id,
        status: SubscriptionStatus.PENDING,
        currentPeriodStart: new Date('2026-05-01T00:00:00.000Z'),
        currentPeriodEnd: new Date('2026-06-01T00:00:00.000Z'),
      },
    });
    await processWebhookEvent(
      (
        await insertWebhookEvent('payment.succeeded', {
          paymentId: crypto.randomUUID(),
          amount: 400,
          currency: 'USD',
          currentPeriodStart: '2026-07-01T00:00:00.000Z',
          currentPeriodEnd: '2026-08-01T00:00:00.000Z',
          metadata: {
            subscriptionId: fromEvent.id,
            organizationId: organization!.id,
          },
        })
      ).id,
    );
    const eventInvoice = await prisma.invoice.findFirstOrThrow({
      where: { subscriptionId: fromEvent.id },
    });
    expect(eventInvoice.periodStart.toISOString()).toBe(
      '2026-07-01T00:00:00.000Z',
    );
    expect(eventInvoice.periodEnd?.toISOString()).toBe(
      '2026-08-01T00:00:00.000Z',
    );

    const otherOrg = await createTestUser({
      email: `inv-${crypto.randomUUID()}@example.test`,
      withOrganization: true,
    });
    const fromSub = await prisma.subscription.create({
      data: {
        organizationId: otherOrg.organization!.id,
        planPriceId: month.id,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: new Date('2026-09-01T00:00:00.000Z'),
        currentPeriodEnd: new Date('2026-10-01T00:00:00.000Z'),
      },
    });
    await processWebhookEvent(
      (
        await insertWebhookEvent('payment.succeeded', {
          paymentId: crypto.randomUUID(),
          amount: 500,
          currency: 'USD',
          metadata: {
            subscriptionId: fromSub.id,
            organizationId: otherOrg.organization!.id,
          },
        })
      ).id,
    );
    const subInvoice = await prisma.invoice.findFirstOrThrow({
      where: { subscriptionId: fromSub.id },
    });
    expect(subInvoice.periodStart.toISOString()).toBe(
      '2026-09-01T00:00:00.000Z',
    );
    expect(subInvoice.periodEnd?.toISOString()).toBe(
      '2026-10-01T00:00:00.000Z',
    );

    const missingOrg = await createTestUser({
      email: `inv-${crypto.randomUUID()}@example.test`,
      withOrganization: true,
    });
    const pending = await prisma.subscription.create({
      data: {
        organizationId: missingOrg.organization!.id,
        planPriceId: month.id,
        status: SubscriptionStatus.PENDING,
      },
    });
    expect(pending.currentPeriodStart).toBeNull();
    expect(pending.currentPeriodEnd).toBeNull();
    await processWebhookEvent(
      (
        await insertWebhookEvent('payment.succeeded', {
          paymentId: crypto.randomUUID(),
          amount: 600,
          currency: 'USD',
          metadata: {
            subscriptionId: pending.id,
            organizationId: missingOrg.organization!.id,
          },
        })
      ).id,
    );
    const pendingInvoice = await prisma.invoice.findFirstOrThrow({
      where: { subscriptionId: pending.id },
    });
    expect(pendingInvoice.periodEnd).toBeNull();
    expect(pendingInvoice.periodStart.getTime()).toBe(
      pendingInvoice.issuedAt.getTime(),
    );
    const stillPending = await prisma.subscription.findUniqueOrThrow({
      where: { id: pending.id },
    });
    expect(stillPending.currentPeriodStart).toBeNull();
    expect(stillPending.currentPeriodEnd).toBeNull();
    expect(stillPending.status).toBe(SubscriptionStatus.PENDING);
  });

  it('unknown organization is processed with no rows; malformed data fails', async () => {
    const processWebhookEvent = createWebhookProcessor(invoiceRegistry());
    const unknown = await insertWebhookEvent('payment.succeeded', {
      paymentId: crypto.randomUUID(),
      amount: 100,
      currency: 'USD',
      metadata: { organizationId: crypto.randomUUID() },
    });
    await processWebhookEvent(unknown.id);
    expect(
      (await prisma.webhookEvent.findUniqueOrThrow({ where: { id: unknown.id } }))
        .status,
    ).toBe(WebhookEventStatus.PROCESSED);
    expect(await prisma.invoice.count()).toBe(0);
    expect(await prisma.payment.count()).toBe(0);

    const malformed = await insertWebhookEvent('payment.succeeded', {
      paymentId: crypto.randomUUID(),
      currency: 'USD',
    });
    await expect(processWebhookEvent(malformed.id)).rejects.toThrow(
      /missing required fields/,
    );
    const failed = await prisma.webhookEvent.findUniqueOrThrow({
      where: { id: malformed.id },
    });
    expect(failed.status).toBe(WebhookEventStatus.FAILED);
    expect(failed.lastError).toMatch(/missing required fields/);
  });

  it('registers a real payment.succeeded handler and keeps other stubs', async () => {
    const registry = invoiceRegistry();
    expect(registry.get('payment.succeeded')).toBe(handlePaymentSucceeded);
    expect(registry.get('subscription.activated')).toBe(
      handleSubscriptionActivated,
    );
    expect(registry.get('payment.declined')).toBe(handlePaymentFailed);
    expect(registry.get('invoice.created')).not.toBe(handlePaymentSucceeded);
    expect(registry.get('invoice.payment_succeeded')).not.toBe(
      handlePaymentSucceeded,
    );
  });
});

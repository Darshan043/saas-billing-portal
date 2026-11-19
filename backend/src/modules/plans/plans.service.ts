import {
  BillingInterval,
  Prisma,
  type Plan,
  type PlanPrice,
} from '@prisma/client';
import { AppError } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import type { CreatePlanInput, UpdatePlanInput } from './plans.schemas';

export type PublicPrice = {
  id: string;
  interval: BillingInterval;
  amount: number;
  currency: string;
};

export type PublicPlan = {
  id: string;
  name: string;
  description: string;
  features: string[];
  usageLimit: number;
  prices: PublicPrice[];
};

export type AdminPlan = PublicPlan & {
  isActive: boolean;
  usageMetric: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

function isUniqueConstraint(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
  );
}

export function featuresFromJson(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
}

function toPublicPrice(price: PlanPrice): PublicPrice {
  return {
    id: price.id,
    interval: price.interval,
    amount: price.amount,
    currency: price.currency,
  };
}

function toPublicPlan(plan: Plan, prices: PlanPrice[]): PublicPlan {
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description,
    features: featuresFromJson(plan.features),
    usageLimit: plan.usageLimit,
    prices: prices.map(toPublicPrice),
  };
}

function toAdminPlan(plan: Plan, prices: PlanPrice[]): AdminPlan {
  return {
    ...toPublicPlan(plan, prices),
    isActive: plan.isActive,
    usageMetric: plan.usageMetric,
    sortOrder: plan.sortOrder,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
}

const planOrderBy = [{ sortOrder: 'asc' as const }, { name: 'asc' as const }];

export async function listPublicPlans(): Promise<PublicPlan[]> {
  const plans = await prisma.plan.findMany({
    where: { isActive: true },
    include: {
      prices: {
        where: { isActive: true, retiredAt: null },
        orderBy: { interval: 'asc' },
      },
    },
    orderBy: planOrderBy,
  });
  return plans.map((plan) => toPublicPlan(plan, plan.prices));
}

export async function listAdminPlans(): Promise<AdminPlan[]> {
  const plans = await prisma.plan.findMany({
    include: {
      prices: {
        where: { isActive: true, retiredAt: null },
        orderBy: { interval: 'asc' },
      },
    },
    orderBy: planOrderBy,
  });
  return plans.map((plan) => toAdminPlan(plan, plan.prices));
}

export async function getAdminPlan(id: string): Promise<AdminPlan> {
  const plan = await prisma.plan.findUnique({
    where: { id },
    include: {
      prices: {
        where: { isActive: true, retiredAt: null },
        orderBy: { interval: 'asc' },
      },
    },
  });
  if (!plan) {
    throw AppError.notFound('PLAN_NOT_FOUND', 'Plan not found');
  }
  return toAdminPlan(plan, plan.prices);
}

async function nextSortOrder(
  tx: Prisma.TransactionClient,
): Promise<number> {
  const result = await tx.plan.aggregate({ _max: { sortOrder: true } });
  return (result._max.sortOrder ?? 0) + 1;
}

export async function createPlan(input: CreatePlanInput): Promise<AdminPlan> {
  try {
    const created = await prisma.$transaction(async (tx) => {
      const plan = await tx.plan.create({
        data: {
          name: input.name,
          description: input.description,
          features: input.features,
          usageLimit: input.usageLimit,
          usageMetric: 'api_calls',
          isActive: true,
          sortOrder: await nextSortOrder(tx),
        },
      });
      const month = await tx.planPrice.create({
        data: {
          planId: plan.id,
          interval: BillingInterval.MONTH,
          amount: input.monthlyAmount,
          currency: input.currency,
          isActive: true,
        },
      });
      const year = await tx.planPrice.create({
        data: {
          planId: plan.id,
          interval: BillingInterval.YEAR,
          amount: input.yearlyAmount,
          currency: input.currency,
          isActive: true,
        },
      });
      return { plan, prices: [month, year] };
    });
    return toAdminPlan(created.plan, created.prices);
  } catch (err) {
    if (isUniqueConstraint(err)) {
      throw AppError.conflict(
        'PLAN_NAME_EXISTS',
        'A plan with this name already exists',
      );
    }
    throw err;
  }
}

async function replaceActivePrice(
  tx: Prisma.TransactionClient,
  planId: string,
  interval: BillingInterval,
  amount: number,
  currency: string,
): Promise<void> {
  const current = await tx.planPrice.findFirst({
    where: { planId, interval, isActive: true },
  });
  if (
    current &&
    current.amount === amount &&
    current.currency === currency
  ) {
    return;
  }
  if (current) {
    await tx.planPrice.update({
      where: { id: current.id },
      data: { isActive: false, retiredAt: new Date() },
    });
  }
  await tx.planPrice.create({
    data: {
      planId,
      interval,
      amount,
      currency,
      isActive: true,
    },
  });
}

export async function updatePlan(
  id: string,
  input: UpdatePlanInput,
): Promise<AdminPlan> {
  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.plan.findUnique({
        where: { id },
        include: { prices: { where: { isActive: true } } },
      });
      if (!existing) {
        throw AppError.notFound('PLAN_NOT_FOUND', 'Plan not found');
      }

      const planData: Prisma.PlanUpdateInput = {};
      if (input.name !== undefined) {
        planData.name = input.name;
      }
      if (input.description !== undefined) {
        planData.description = input.description;
      }
      if (input.features !== undefined) {
        planData.features = input.features;
      }
      if (input.usageLimit !== undefined) {
        planData.usageLimit = input.usageLimit;
      }
      if (input.isActive !== undefined) {
        planData.isActive = input.isActive;
      }

      if (Object.keys(planData).length > 0) {
        await tx.plan.update({ where: { id }, data: planData });
      }

      const currentMonth = existing.prices.find(
        (price) => price.interval === BillingInterval.MONTH,
      );
      const currentYear = existing.prices.find(
        (price) => price.interval === BillingInterval.YEAR,
      );

      const monthAmount = input.monthlyAmount ?? currentMonth?.amount;
      const yearAmount = input.yearlyAmount ?? currentYear?.amount;
      const monthCurrency = input.currency ?? currentMonth?.currency;
      const yearCurrency = input.currency ?? currentYear?.currency;

      const monthChanged =
        monthAmount !== undefined &&
        monthCurrency !== undefined &&
        (input.monthlyAmount !== undefined ||
          (input.currency !== undefined &&
            currentMonth?.currency !== input.currency));
      const yearChanged =
        yearAmount !== undefined &&
        yearCurrency !== undefined &&
        (input.yearlyAmount !== undefined ||
          (input.currency !== undefined &&
            currentYear?.currency !== input.currency));

      if (monthChanged) {
        await replaceActivePrice(
          tx,
          id,
          BillingInterval.MONTH,
          monthAmount,
          monthCurrency,
        );
      }
      if (yearChanged) {
        await replaceActivePrice(
          tx,
          id,
          BillingInterval.YEAR,
          yearAmount,
          yearCurrency,
        );
      }
    });
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }
    if (isUniqueConstraint(err)) {
      throw AppError.conflict(
        'PLAN_NAME_EXISTS',
        'A plan with this name already exists',
      );
    }
    throw err;
  }

  return getAdminPlan(id);
}

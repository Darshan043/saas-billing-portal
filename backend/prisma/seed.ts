import { BillingInterval, PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const ADMIN_EMAIL = (
  process.env.SEED_ADMIN_EMAIL ?? 'admin@billinghub.local'
).toLowerCase();
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';

type PlanSeed = {
  name: string;
  description: string;
  features: string[];
  usageLimit: number;
  sortOrder: number;
  monthlyAmount: number;
  yearlyAmount: number;
};

const PLANS: PlanSeed[] = [
  {
    name: 'Starter',
    description: 'For trying BillingHub with a small workload.',
    features: ['100 API calls per month', 'Email support'],
    usageLimit: 100,
    sortOrder: 1,
    monthlyAmount: 900,
    yearlyAmount: 9000,
  },
  {
    name: 'Pro',
    description: 'For growing teams that need a usage dashboard.',
    features: [
      '1,000 API calls per month',
      'Priority email support',
      'Usage dashboard',
    ],
    usageLimit: 1000,
    sortOrder: 2,
    monthlyAmount: 2900,
    yearlyAmount: 29000,
  },
  {
    name: 'Business',
    description: 'For higher volume and audit history.',
    features: [
      '10,000 API calls per month',
      'Priority support',
      'Usage dashboard',
      'Audit history',
    ],
    usageLimit: 10000,
    sortOrder: 3,
    monthlyAmount: 9900,
    yearlyAmount: 99000,
  },
];

async function seedAdmin(): Promise<'created' | 'existed'> {
  const existing = await prisma.user.findUnique({
    where: { email: ADMIN_EMAIL },
  });
  if (existing) {
    return 'existed';
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  await prisma.user.create({
    data: {
      email: ADMIN_EMAIL,
      passwordHash,
      name: 'Admin',
      role: UserRole.ADMIN,
    },
  });
  return 'created';
}

async function ensurePrice(
  planId: string,
  interval: BillingInterval,
  amount: number,
): Promise<'created' | 'existed'> {
  const existing = await prisma.planPrice.findFirst({
    where: { planId, interval, isActive: true },
  });
  if (existing) {
    return 'existed';
  }

  await prisma.planPrice.create({
    data: {
      planId,
      interval,
      amount,
      currency: 'USD',
      isActive: true,
    },
  });
  return 'created';
}

async function seedPlans(): Promise<string[]> {
  const lines: string[] = [];

  for (const plan of PLANS) {
    const row = await prisma.plan.upsert({
      where: { name: plan.name },
      create: {
        name: plan.name,
        description: plan.description,
        features: plan.features,
        usageLimit: plan.usageLimit,
        usageMetric: 'api_calls',
        isActive: true,
        sortOrder: plan.sortOrder,
      },
      update: {
        description: plan.description,
        features: plan.features,
        usageLimit: plan.usageLimit,
        usageMetric: 'api_calls',
        isActive: true,
        sortOrder: plan.sortOrder,
      },
    });

    const month = await ensurePrice(
      row.id,
      BillingInterval.MONTH,
      plan.monthlyAmount,
    );
    const year = await ensurePrice(
      row.id,
      BillingInterval.YEAR,
      plan.yearlyAmount,
    );
    lines.push(
      `  ${plan.name}: plan upserted; MONTH price ${month}; YEAR price ${year}`,
    );
  }

  return lines;
}

async function main(): Promise<void> {
  const admin = await seedAdmin();
  const planLines = await seedPlans();

  console.log('Seed complete (idempotent).');
  console.log(
    `  Admin user ${ADMIN_EMAIL}: ${admin === 'created' ? 'created' : 'already existed'}`,
  );
  for (const line of planLines) {
    console.log(line);
  }
}

main()
  .catch((err: unknown) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

export type BillingInterval = 'MONTH' | 'YEAR';

export type PlanPrice = {
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
  prices: PlanPrice[];
};

export type AdminPlan = PublicPlan & {
  isActive: boolean;
  usageMetric: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export function priceFor(
  plan: PublicPlan,
  interval: BillingInterval,
): PlanPrice | undefined {
  return plan.prices.find((price) => price.interval === interval);
}

import type { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';

/**
 * GET /admin/diagnostic/plans
 * Returns a read‑only diagnostic view of all plans and their prices.
 * Accessible only to authenticated ADMIN users (handled by router middleware).
 */
export async function getPlansDiagnostic(_req: Request, res: Response): Promise<void> {
  const plans = await prisma.plan.findMany({
    include: { prices: true },
    orderBy: { sortOrder: 'asc' },
  });

  const response = {
    totalPlans: plans.length,
    plans: plans.map((plan) => ({
      name: plan.name,
      isActive: plan.isActive,
      priceCount: plan.prices.length,
      prices: plan.prices.map((p) => ({
        interval: p.interval,
        currency: p.currency,
        amount: p.amount,
        isActive: p.isActive,
        retired: p.retiredAt !== null,
      })),
    })),
  };

  res.status(200).json(response);
}


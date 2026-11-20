import { z } from 'zod';
import { amountSchema, currencySchema } from '../../lib/money';

export const createSubscriptionSchema = z.object({
  customerId: z.string().uuid(),
  amount: amountSchema,
  currency: currencySchema,
  planPriceId: z.string().trim().min(1).max(100).optional(),
  token: z.string().trim().min(1).max(64).optional(),
  interval: z.enum(['MONTH', 'YEAR']).optional(),
  metadata: z
    .object({
      subscriptionId: z.string().uuid(),
      organizationId: z.string().uuid(),
    })
    .optional(),
});

export const updateSubscriptionSchema = z
  .object({
    amount: amountSchema.optional(),
    currency: currencySchema.optional(),
    planPriceId: z.string().trim().min(1).max(100).nullable().optional(),
  })
  .refine(
    (value) =>
      value.amount !== undefined ||
      value.currency !== undefined ||
      value.planPriceId !== undefined,
    { message: 'Provide amount, currency, or planPriceId' },
  );

export const subscriptionIdParamsSchema = z.object({
  id: z.string().uuid(),
});

const billingMetadataSchema = z
  .object({
    subscriptionId: z.string().uuid(),
    organizationId: z.string().uuid(),
    reason: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().min(1).max(200).optional(),
    fromPlanPriceId: z.string().trim().min(1).max(100).optional(),
    toPlanPriceId: z.string().trim().min(1).max(100).optional(),
  })
  .passthrough();

export const changePlanSchema = z.object({
  planPriceId: z.string().trim().min(1).max(100),
  amount: amountSchema,
  currency: currencySchema,
  chargeAmount: z.number().int().min(0),
  token: z.string().trim().min(1).max(64).optional(),
  description: z.string().trim().min(1).max(200).optional(),
  metadata: billingMetadataSchema.optional(),
});

export const cancelAtPeriodEndSchema = z.object({
  value: z.boolean(),
});

export const resumeSubscriptionSchema = z.object({
  currentPeriodEnd: z.string().datetime().optional(),
});

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

import { z } from 'zod';
import { amountSchema, currencySchema } from '../../lib/money';

export const createPaymentSchema = z
  .object({
    customerId: z.string().uuid(),
    amount: amountSchema,
    currency: currencySchema,
    token: z.string().trim().min(1).max(64).optional(),
    paymentMethodId: z.string().uuid().optional(),
    idempotencyKey: z.string().trim().min(1).max(100).optional(),
  })
  .refine((value) => Boolean(value.token || value.paymentMethodId), {
    message: 'Provide token or paymentMethodId',
    path: ['token'],
  });

export const paymentIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const listPaymentsQuerySchema = z.object({
  customerId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

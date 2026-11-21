import { z } from 'zod';

export const SIMULATOR_PAYMENT_TOKENS = [
  'tok_sim_visa_ok',
  'tok_sim_declined',
  'tok_sim_insufficient_funds',
] as const;

export const createSubscriptionSchema = z.object({
  planPriceId: z.string().uuid(),
  paymentToken: z
    .string()
    .min(1)
    .max(64)
    .regex(/^tok_sim_[a-z0-9_]+$/),
});

export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;

export const changePlanSchema = z.object({
  planPriceId: z.string().uuid(),
});

export type ChangePlanInput = z.infer<typeof changePlanSchema>;

export const changePreviewQuerySchema = z.object({
  planPriceId: z.string().uuid(),
});

export const cancelSubscriptionSchema = z.object({
  when: z.enum(['IMMEDIATELY', 'AT_PERIOD_END']),
});

export type CancelSubscriptionInput = z.infer<typeof cancelSubscriptionSchema>;

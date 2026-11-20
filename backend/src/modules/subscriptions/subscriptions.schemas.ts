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

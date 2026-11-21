import { z } from 'zod';

export const createCustomerSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  name: z.string().trim().min(1).max(100),
});

export const attachPaymentMethodSchema = z.object({
  token: z.string().trim().min(1).max(64),
});

export const customerIdParamsSchema = z.object({
  id: z.string().uuid(),
});

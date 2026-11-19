import { z } from 'zod';

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[A-Za-z]/, 'Password must include a letter')
  .regex(/[0-9]/, 'Password must include a number');

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),
  password: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

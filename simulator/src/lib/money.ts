import { z } from 'zod';

export const SUPPORTED_CURRENCIES = ['USD', 'INR', 'EUR', 'GBP'] as const;

export const amountSchema = z.number().int().positive();

export const currencySchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .refine(
    (value): value is (typeof SUPPORTED_CURRENCIES)[number] =>
      (SUPPORTED_CURRENCIES as readonly string[]).includes(value),
    { message: 'Currency must be USD, INR, EUR, or GBP' },
  );

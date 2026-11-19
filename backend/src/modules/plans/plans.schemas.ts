import { z } from 'zod';

export const SUPPORTED_CURRENCIES = ['USD', 'INR', 'EUR', 'GBP'] as const;

export const billingIntervalSchema = z.enum([
  'MONTH',
  'YEAR',
  'MONTHLY',
  'YEARLY',
]);

const nameSchema = z.string().trim().min(1).max(100);
const descriptionSchema = z.string().trim().min(1).max(2000);
const featuresSchema = z
  .array(z.string().trim().min(1).max(200))
  .min(1)
  .max(50);
const usageLimitSchema = z.number().int().positive();
const amountSchema = z.number().int().positive();
const currencySchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .refine(
    (value): value is (typeof SUPPORTED_CURRENCIES)[number] =>
      (SUPPORTED_CURRENCIES as readonly string[]).includes(value),
    { message: 'Currency must be USD, INR, EUR, or GBP' },
  );

export const planIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const createPlanSchema = z.object({
  name: nameSchema,
  description: descriptionSchema,
  features: featuresSchema,
  usageLimit: usageLimitSchema,
  currency: currencySchema.default('USD'),
  monthlyAmount: amountSchema,
  yearlyAmount: amountSchema,
  // Optional; rejected unless MONTH/YEAR (or MONTHLY/YEARLY aliases). Ignored by the service.
  interval: billingIntervalSchema.optional(),
});

export const updatePlanSchema = z
  .object({
    name: nameSchema.optional(),
    description: descriptionSchema.optional(),
    features: featuresSchema.optional(),
    usageLimit: usageLimitSchema.optional(),
    isActive: z.boolean().optional(),
    currency: currencySchema.optional(),
    monthlyAmount: amountSchema.optional(),
    yearlyAmount: amountSchema.optional(),
    interval: billingIntervalSchema.optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.description !== undefined ||
      value.features !== undefined ||
      value.usageLimit !== undefined ||
      value.isActive !== undefined ||
      value.currency !== undefined ||
      value.monthlyAmount !== undefined ||
      value.yearlyAmount !== undefined,
    { message: 'At least one field is required' },
  );

export type CreatePlanInput = z.infer<typeof createPlanSchema>;
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;

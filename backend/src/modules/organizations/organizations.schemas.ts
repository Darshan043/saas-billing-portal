import { z } from 'zod';

const nameSchema = z.string().trim().min(2).max(100);
const billingEmailSchema = z
  .string()
  .trim()
  .email()
  .transform((value) => value.toLowerCase());

export const createOrganizationSchema = z.object({
  name: nameSchema,
  billingEmail: billingEmailSchema.optional(),
});

export const updateOrganizationSchema = z
  .object({
    name: nameSchema.optional(),
    billingEmail: billingEmailSchema.optional(),
  })
  .refine((value) => value.name !== undefined || value.billingEmail !== undefined, {
    message: 'At least one field is required',
  });

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

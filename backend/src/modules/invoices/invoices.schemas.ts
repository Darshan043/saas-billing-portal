import { z } from 'zod';

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

export const invoiceIdParamSchema = z.object({
  id: z.string().uuid(),
});

export type ListQuery = z.infer<typeof listQuerySchema>;

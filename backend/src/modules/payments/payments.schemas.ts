import { z } from 'zod';

export const listPaymentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

export type ListPaymentsQuery = z.infer<typeof listPaymentsQuerySchema>;

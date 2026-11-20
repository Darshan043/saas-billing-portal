import { z } from 'zod';

export const webhookEventSchema = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1),
    data: z.record(z.unknown()),
  })
  .passthrough();

export type WebhookEventPayload = z.infer<typeof webhookEventSchema>;

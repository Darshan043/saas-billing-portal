import { z } from 'zod';

export const SIMULATOR_EVENT_TYPES = [
  'customer.created',
  'payment.succeeded',
  'payment.declined',
  'payment.insufficient_funds',
  'subscription.created',
  'subscription.updated',
  'subscription.cancelled',
  'invoice.created',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
] as const;

export const simulatorEventSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(SIMULATOR_EVENT_TYPES),
  createdAt: z.string().min(1),
  objectId: z.string().min(1),
  data: z.record(z.unknown()),
});

export type SimulatorEvent = z.infer<typeof simulatorEventSchema>;

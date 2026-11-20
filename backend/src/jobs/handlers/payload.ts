import type { WebhookEvent } from '@prisma/client';

export function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function eventData(event: WebhookEvent): Record<string, unknown> {
  return asRecord(asRecord(event.payload).data);
}

export function stringField(
  data: Record<string, unknown>,
  key: string,
): string | null {
  const value = data[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function parseIsoDate(value: unknown): Date | null {
  if (typeof value !== 'string') {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function eventMetadata(data: Record<string, unknown>): {
  subscriptionId: string | null;
  organizationId: string | null;
} {
  const metadata = asRecord(data.metadata);
  return {
    subscriptionId: stringField(metadata, 'subscriptionId'),
    organizationId: stringField(metadata, 'organizationId'),
  };
}

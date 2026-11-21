import {
  DeliveryReason,
  DeliveryStatus,
  Prisma,
  WebhookStatus,
} from '@prisma/client';
import { env } from '../../config/env';
import { AppError } from '../../lib/errors';
import { signPayload, stableStringify } from '../../lib/hmac';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';

export const EVENT_TYPES = [
  'customer.created',
  'payment.succeeded',
  'payment.declined',
  'payment.insufficient_funds',
  'subscription.created',
  'subscription.activated',
  'subscription.updated',
  'subscription.cancelled',
  'invoice.created',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export type SimulatorEvent = {
  id: string;
  type: EventType;
  createdAt: string;
  objectId: string;
  data: Record<string, unknown>;
};

const MAX_RESPONSE_CHARS = 500;

function backoffMs(automaticAttempt: number): number {
  const delay =
    env.WEBHOOK_RETRY_BASE_MS * 2 ** Math.max(0, automaticAttempt - 1);
  return Math.min(delay, 30_000);
}

function countsTowardRetryLimit(reason: DeliveryReason): boolean {
  return reason === DeliveryReason.INITIAL || reason === DeliveryReason.RETRY;
}

async function getSettings() {
  return prisma.settings.upsert({
    where: { id: 1 },
    create: { id: 1, failNext: false },
    update: {},
  });
}

export async function enqueueEvent(
  type: EventType,
  objectId: string,
  data: Record<string, unknown>,
): Promise<string> {
  const id = crypto.randomUUID();
  const payload: SimulatorEvent = {
    id,
    type,
    createdAt: new Date().toISOString(),
    objectId,
    data,
  };
  const rawBody = stableStringify(payload);
  await prisma.webhookEvent.create({
    data: {
      id,
      type,
      objectId,
      payload: payload as unknown as Prisma.InputJsonValue,
      rawBody,
      status: WebhookStatus.PENDING,
      attempts: 0,
      nextRetryAt: new Date(),
    },
  });
  return id;
}

export async function emitEvent(
  type: EventType,
  objectId: string,
  data: Record<string, unknown>,
): Promise<string> {
  const id = await enqueueEvent(type, objectId, data);
  await deliverEvent(id, DeliveryReason.INITIAL);
  return id;
}

export async function setFailNext(): Promise<void> {
  await prisma.settings.upsert({
    where: { id: 1 },
    create: { id: 1, failNext: true },
    update: { failNext: true },
  });
}

async function consumeFailNext(): Promise<boolean> {
  const settings = await getSettings();
  if (!settings.failNext) {
    return false;
  }
  await prisma.settings.update({
    where: { id: 1 },
    data: { failNext: false },
  });
  return true;
}

export async function deliverEvent(
  eventId: string,
  reason: DeliveryReason,
): Promise<void> {
  const event = await prisma.webhookEvent.findUnique({ where: { id: eventId } });
  if (!event) {
    throw AppError.notFound('EVENT_NOT_FOUND', 'Webhook event not found');
  }

  const deliveryCount = await prisma.webhookDelivery.count({
    where: { eventId },
  });
  const attemptNumber = deliveryCount + 1;
  const automaticAttempts = countsTowardRetryLimit(reason)
    ? event.attempts + 1
    : event.attempts;

  const forceFail = await consumeFailNext();
  if (forceFail) {
    const exhausted = automaticAttempts >= env.WEBHOOK_MAX_ATTEMPTS;
    const nextRetryAt =
      exhausted || event.status === WebhookStatus.DELIVERED
        ? null
        : new Date(Date.now() + backoffMs(automaticAttempts + 1));
    await prisma.$transaction([
      prisma.webhookDelivery.create({
        data: {
          eventId,
          attemptNumber,
          status: DeliveryStatus.FORCED_FAIL,
          reason,
          responseBody: 'Forced failure via fail-next control',
        },
      }),
      prisma.webhookEvent.update({
        where: { id: eventId },
        data: {
          attempts: automaticAttempts,
          lastError: 'Forced failure via fail-next control',
          status:
            event.status === WebhookStatus.DELIVERED
              ? WebhookStatus.DELIVERED
              : exhausted
                ? WebhookStatus.FAILED
                : WebhookStatus.PENDING,
          nextRetryAt:
            event.status === WebhookStatus.DELIVERED ? null : nextRetryAt,
        },
      }),
    ]);
    return;
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = signPayload(
    env.WEBHOOK_SIGNING_SECRET,
    timestamp,
    event.rawBody,
  );

  let httpStatus: number | null = null;
  let responseBody: string | null = null;
  let errorMessage: string | null = null;
  let ok = false;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.WEBHOOK_TIMEOUT_MS);
    const response = await fetch(env.BACKEND_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Simulator-Event-Id': event.id,
        'X-Simulator-Timestamp': timestamp,
        'X-Simulator-Signature': `v1=${signature}`,
      },
      body: event.rawBody,
      signal: controller.signal,
    });
    clearTimeout(timer);
    httpStatus = response.status;
    const text = await response.text();
    responseBody = text.slice(0, MAX_RESPONSE_CHARS);
    ok = response.ok;
    if (!ok) {
      errorMessage = `HTTP ${response.status}`;
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : 'Delivery failed';
    logger.warn({ eventId, message: errorMessage }, 'webhook delivery error');
  }

  const exhausted = automaticAttempts >= env.WEBHOOK_MAX_ATTEMPTS;
  const nextRetryAt =
    ok || exhausted || event.status === WebhookStatus.DELIVERED
      ? null
      : new Date(Date.now() + backoffMs(automaticAttempts + 1));

  await prisma.$transaction([
    prisma.webhookDelivery.create({
      data: {
        eventId,
        attemptNumber,
        status: ok ? DeliveryStatus.SUCCESS : DeliveryStatus.FAILED,
        reason,
        httpStatus,
        responseBody: responseBody ?? errorMessage,
      },
    }),
    prisma.webhookEvent.update({
      where: { id: eventId },
      data: {
        attempts: automaticAttempts,
        lastError: ok ? null : errorMessage,
        status: ok
          ? WebhookStatus.DELIVERED
          : event.status === WebhookStatus.DELIVERED
            ? WebhookStatus.DELIVERED
            : exhausted
              ? WebhookStatus.FAILED
              : WebhookStatus.PENDING,
        nextRetryAt: ok ? null : nextRetryAt,
      },
    }),
  ]);
}

export async function processDueEvents(): Promise<number> {
  const due = await prisma.webhookEvent.findMany({
    where: {
      status: WebhookStatus.PENDING,
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
    },
    orderBy: { createdAt: 'asc' },
    take: 10,
  });
  for (const event of due) {
    const reason =
      event.attempts === 0 ? DeliveryReason.INITIAL : DeliveryReason.RETRY;
    await deliverEvent(event.id, reason);
  }
  return due.length;
}

export async function replayEvent(eventId: string): Promise<void> {
  await deliverEvent(eventId, DeliveryReason.REPLAY);
}

export async function duplicateEvent(eventId: string): Promise<void> {
  await deliverEvent(eventId, DeliveryReason.DUPLICATE);
}

let workerTimer: NodeJS.Timeout | null = null;

export function startWebhookWorker(): void {
  if (workerTimer) {
    return;
  }
  workerTimer = setInterval(() => {
    void processDueEvents().catch((err) => {
      logger.error({ err }, 'webhook worker tick failed');
    });
  }, 1000);
  workerTimer.unref();
}

export function stopWebhookWorker(): void {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
  }
}

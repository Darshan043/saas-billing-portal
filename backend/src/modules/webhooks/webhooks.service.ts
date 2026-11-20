import { Prisma, WebhookEventStatus } from '@prisma/client';
import { env } from '../../config/env';
import { AppError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import {
  verifyWebhookSignature,
  type SignatureFailureReason,
} from '../../lib/webhookSignature';
import { enqueueWebhookEvent } from '../../jobs/enqueue';
import { webhookEventSchema } from './webhooks.schemas';

const RAW_BODY_STORE_LIMIT = 10_000;

export type ReceiveWebhookResult = {
  duplicate: boolean;
};

function truncateRawBody(rawBody: Buffer): string {
  return rawBody.toString('utf8').slice(0, RAW_BODY_STORE_LIMIT);
}

function isProviderEventIdConflict(
  err: Prisma.PrismaClientKnownRequestError,
): boolean {
  const target = err.meta?.target;
  const values = Array.isArray(target)
    ? target.map(String)
    : typeof target === 'string'
      ? [target]
      : [];
  if (values.length === 0) {
    return false;
  }
  return values.every(
    (value) =>
      value === 'providerEventId' ||
      value === 'provider_event_id' ||
      value.includes('provider_event_id'),
  );
}

async function persistRejected(input: {
  signatureValid: boolean;
  lastError: string;
  rawBody: Buffer;
  type?: string;
  payload?: Prisma.InputJsonValue;
}): Promise<void> {
  await prisma.webhookEvent.create({
    data: {
      providerEventId: null,
      type: input.type ?? 'unknown',
      payload: input.payload ?? {},
      rawBody: truncateRawBody(input.rawBody),
      signatureValid: input.signatureValid,
      status: WebhookEventStatus.REJECTED,
      lastError: input.lastError,
    },
  });
}

function payloadObjectOrEmpty(value: unknown): Prisma.InputJsonValue {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Prisma.InputJsonValue;
  }
  return {};
}

function typeFromUnknown(value: unknown): string {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  return 'unknown';
}

export async function receivePaymentWebhook(input: {
  rawBody: Buffer;
  signatureHeader: string | undefined;
  timestampHeader: string | undefined;
  nowSeconds?: number;
}): Promise<ReceiveWebhookResult> {
  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const verified = verifyWebhookSignature({
    secret: env.WEBHOOK_SIGNING_SECRET,
    signatureHeader: input.signatureHeader,
    timestampHeader: input.timestampHeader,
    rawBody: input.rawBody,
    nowSeconds,
    toleranceSeconds: env.WEBHOOK_TOLERANCE_SECONDS,
  });

  if (!verified.valid) {
    const reason: SignatureFailureReason = verified.reason;
    await persistRejected({
      signatureValid: false,
      lastError: reason,
      rawBody: input.rawBody,
    });
    logger.info(
      { outcome: 'rejected', reason },
      'webhook received',
    );
    throw AppError.badRequest(
      'INVALID_SIGNATURE',
      'Webhook signature verification failed',
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(input.rawBody.toString('utf8'));
  } catch {
    await persistRejected({
      signatureValid: true,
      lastError: 'INVALID_JSON',
      rawBody: input.rawBody,
    });
    logger.info(
      { outcome: 'rejected', reason: 'INVALID_JSON' },
      'webhook received',
    );
    throw AppError.badRequest(
      'INVALID_PAYLOAD',
      'Webhook payload is invalid',
    );
  }

  const parsed = webhookEventSchema.safeParse(parsedJson);
  if (!parsed.success) {
    const record =
      parsedJson && typeof parsedJson === 'object'
        ? (parsedJson as Record<string, unknown>)
        : undefined;
    await persistRejected({
      signatureValid: true,
      lastError: 'INVALID_PAYLOAD',
      rawBody: input.rawBody,
      type: typeFromUnknown(record?.type),
      payload: payloadObjectOrEmpty(parsedJson),
    });
    logger.info(
      {
        outcome: 'rejected',
        reason: 'INVALID_PAYLOAD',
        eventId: typeof record?.id === 'string' ? record.id : undefined,
        type: typeFromUnknown(record?.type),
      },
      'webhook received',
    );
    throw AppError.badRequest(
      'INVALID_PAYLOAD',
      'Webhook payload is invalid',
    );
  }

  const event = parsed.data;

  try {
    // Idempotency relies on the unique constraint on providerEventId, not find-then-insert.
    const row = await prisma.webhookEvent.create({
      data: {
        providerEventId: event.id,
        type: event.type,
        payload: event as unknown as Prisma.InputJsonValue,
        rawBody: null,
        signatureValid: true,
        status: WebhookEventStatus.RECEIVED,
        duplicateCount: 0,
      },
    });
    logger.info(
      { outcome: 'stored', eventId: event.id, type: event.type },
      'webhook received',
    );
    await enqueueStoredWebhookEvent(row.id);
    return { duplicate: false };
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002' &&
      isProviderEventIdConflict(err)
    ) {
      const existing = await prisma.webhookEvent.update({
        where: { providerEventId: event.id },
        data: { duplicateCount: { increment: 1 } },
      });
      logger.info(
        { outcome: 'duplicate', eventId: event.id, type: event.type },
        'webhook received',
      );
      if (existing.status === WebhookEventStatus.RECEIVED) {
        await enqueueStoredWebhookEvent(existing.id);
      }
      return { duplicate: true };
    }
    throw err;
  }
}

async function enqueueStoredWebhookEvent(webhookEventId: string): Promise<void> {
  try {
    await enqueueWebhookEvent(webhookEventId);
  } catch (err) {
    logger.error(
      { err, webhookEventId },
      'failed to enqueue webhook event',
    );
  }
}

import { Prisma, WebhookEventStatus } from '@prisma/client';
import { env } from '../../config/env';
import { AppError } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import {
  isTimestampFresh,
  parseSignatureHeader,
  signPayload,
  signaturesMatch,
} from '../../lib/webhookHmac';
import { simulatorEventSchema } from './webhooks.schemas';

export type ReceiveResult = {
  duplicate: boolean;
  eventId: string;
};

async function persistRejected(rawBody: string, reason: string): Promise<void> {
  await prisma.webhookEvent.create({
    data: {
      type: 'invalid',
      payload: { reason },
      rawBody,
      signatureValid: false,
      status: WebhookEventStatus.REJECTED,
      lastError: reason,
    },
  });
}

export async function receiveSimulatorWebhook(input: {
  rawBody: string;
  signatureHeader?: string;
  timestampHeader?: string;
  eventIdHeader?: string;
  nowSeconds?: number;
}): Promise<ReceiveResult> {
  const rawBody = input.rawBody;
  const provided = parseSignatureHeader(input.signatureHeader);
  if (!provided || !input.timestampHeader || !input.eventIdHeader) {
    await persistRejected(rawBody, 'Missing webhook signature headers');
    throw AppError.badRequest(
      'WEBHOOK_HEADERS_REQUIRED',
      'X-Simulator-Signature, X-Simulator-Timestamp, and X-Simulator-Event-Id are required',
    );
  }

  const expected = signPayload(
    env.WEBHOOK_SIGNING_SECRET,
    input.timestampHeader,
    rawBody,
  );
  if (!signaturesMatch(expected, provided)) {
    await persistRejected(rawBody, 'Invalid HMAC signature');
    throw AppError.unauthorized(
      'WEBHOOK_SIGNATURE_INVALID',
      'Invalid webhook signature',
    );
  }

  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (
    !isTimestampFresh(
      input.timestampHeader,
      nowSeconds,
      env.WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS,
    )
  ) {
    await persistRejected(rawBody, 'Expired webhook timestamp');
    throw AppError.badRequest(
      'WEBHOOK_TIMESTAMP_EXPIRED',
      'Webhook timestamp is outside the allowed window',
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody);
  } catch {
    await persistRejected(rawBody, 'Invalid JSON body');
    throw AppError.badRequest('INVALID_JSON', 'Malformed JSON body');
  }

  const parsed = simulatorEventSchema.safeParse(parsedJson);
  if (!parsed.success) {
    await persistRejected(rawBody, 'Invalid event structure');
    throw AppError.badRequest(
      'WEBHOOK_EVENT_INVALID',
      'Webhook event structure is invalid',
    );
  }

  if (parsed.data.id !== input.eventIdHeader) {
    await persistRejected(rawBody, 'Event id header mismatch');
    throw AppError.badRequest(
      'WEBHOOK_EVENT_ID_MISMATCH',
      'Event id header does not match payload id',
    );
  }

  try {
    const created = await prisma.webhookEvent.create({
      data: {
        providerEventId: parsed.data.id,
        type: parsed.data.type,
        payload: parsed.data as unknown as Prisma.InputJsonValue,
        rawBody,
        signatureValid: true,
        status: WebhookEventStatus.PROCESSED,
        processedAt: new Date(),
      },
    });
    return { duplicate: false, eventId: created.id };
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      const existing = await prisma.webhookEvent.update({
        where: { providerEventId: parsed.data.id },
        data: { duplicateCount: { increment: 1 } },
      });
      return { duplicate: true, eventId: existing.id };
    }
    throw err;
  }
}

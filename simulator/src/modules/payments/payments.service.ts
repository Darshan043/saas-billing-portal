import {
  InvoiceStatus,
  PaymentStatus,
  Prisma,
  TokenKind,
} from '@prisma/client';
import { AppError } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { rejectRawCredentials, tokenKindFromValue } from '../../lib/tokens';
import { emitEvent } from '../webhooks/webhook.service';

const TOKEN_OUTCOME: Record<
  TokenKind,
  { status: PaymentStatus; errorCode: string | null; event: 'payment.succeeded' | 'payment.declined' | 'payment.insufficient_funds' }
> = {
  VISA_OK: {
    status: PaymentStatus.SUCCEEDED,
    errorCode: null,
    event: 'payment.succeeded',
  },
  DECLINED: {
    status: PaymentStatus.DECLINED,
    errorCode: 'CARD_DECLINED',
    event: 'payment.declined',
  },
  INSUFFICIENT_FUNDS: {
    status: PaymentStatus.INSUFFICIENT_FUNDS,
    errorCode: 'INSUFFICIENT_FUNDS',
    event: 'payment.insufficient_funds',
  },
};

export type PaymentMetadata = {
  subscriptionId: string;
  organizationId: string;
  reason?: string;
  description?: string;
  fromPlanPriceId?: string;
  toPlanPriceId?: string;
};

export type CreatePaymentInput = {
  customerId: string;
  amount: number;
  currency: string;
  token?: string;
  paymentMethodId?: string;
  idempotencyKey?: string;
  subscriptionId?: string;
  description?: string;
  metadata?: PaymentMetadata;
};

async function resolveTokenKind(input: CreatePaymentInput): Promise<{
  tokenKind: TokenKind;
  paymentMethodId: string | null;
}> {
  if (input.paymentMethodId) {
    const method = await prisma.paymentMethod.findUnique({
      where: { id: input.paymentMethodId },
    });
    if (!method || method.customerId !== input.customerId) {
      throw AppError.badRequest(
        'PAYMENT_METHOD_INVALID',
        'Payment method does not belong to this customer',
      );
    }
    return { tokenKind: method.tokenKind, paymentMethodId: method.id };
  }
  if (!input.token) {
    throw AppError.badRequest(
      'TOKEN_REQUIRED',
      'Provide a simulator test token',
    );
  }
  return {
    tokenKind: tokenKindFromValue(input.token),
    paymentMethodId: null,
  };
}

export async function createPayment(input: CreatePaymentInput) {
  rejectRawCredentials(input, 'body');

  const customer = await prisma.customer.findUnique({
    where: { id: input.customerId },
  });
  if (!customer) {
    throw AppError.notFound('CUSTOMER_NOT_FOUND', 'Simulated customer not found');
  }

  if (input.idempotencyKey) {
    const existing = await prisma.payment.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      if (
        existing.customerId !== input.customerId ||
        existing.amount !== input.amount ||
        existing.currency !== input.currency
      ) {
        throw AppError.conflict(
          'IDEMPOTENCY_KEY_REUSED',
          'Idempotency key was already used with different payment details',
        );
      }
      return existing;
    }
  }

  const { tokenKind, paymentMethodId } = await resolveTokenKind(input);
  const outcome = TOKEN_OUTCOME[tokenKind];

  try {
    const payment = await prisma.payment.create({
      data: {
        customerId: input.customerId,
        paymentMethodId,
        amount: input.amount,
        currency: input.currency,
        status: outcome.status,
        errorCode: outcome.errorCode,
        idempotencyKey: input.idempotencyKey,
      },
    });

    const invoiceStatus =
      outcome.status === PaymentStatus.SUCCEEDED
        ? InvoiceStatus.PAID
        : InvoiceStatus.VOID;
    const invoice = await prisma.invoice.create({
      data: {
        customerId: input.customerId,
        paymentId: payment.id,
        amount: input.amount,
        currency: input.currency,
        status: invoiceStatus,
      },
    });

    const paymentData: Record<string, unknown> = {
      paymentId: payment.id,
      customerId: payment.customerId,
      amount: payment.amount,
      currency: payment.currency,
      status: outcome.event.replace('payment.', ''),
      errorCode: payment.errorCode,
    };
    if (input.subscriptionId) {
      paymentData.subscriptionId = input.subscriptionId;
    }
    if (input.description) {
      paymentData.description = input.description;
    }
    if (input.metadata) {
      paymentData.metadata = input.description
        ? { ...input.metadata, description: input.description }
        : input.metadata;
    }

    await emitEvent(outcome.event, payment.id, paymentData);
    await emitEvent('invoice.created', invoice.id, {
      invoiceId: invoice.id,
      paymentId: payment.id,
      customerId: invoice.customerId,
      amount: invoice.amount,
      currency: invoice.currency,
      status: invoice.status.toLowerCase(),
    });
    await emitEvent(
      outcome.status === PaymentStatus.SUCCEEDED
        ? 'invoice.payment_succeeded'
        : 'invoice.payment_failed',
      invoice.id,
      {
        invoiceId: invoice.id,
        paymentId: payment.id,
        customerId: invoice.customerId,
        amount: invoice.amount,
        currency: invoice.currency,
      },
    );

    return payment;
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002' &&
      input.idempotencyKey
    ) {
      const existing = await prisma.payment.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) {
        return existing;
      }
    }
    throw err;
  }
}

export async function getPayment(id: string) {
  const payment = await prisma.payment.findUnique({ where: { id } });
  if (!payment) {
    throw AppError.notFound('PAYMENT_NOT_FOUND', 'Simulated payment not found');
  }
  return payment;
}

export async function listPayments(options: {
  customerId?: string;
  limit?: number;
}) {
  return prisma.payment.findMany({
    where: options.customerId ? { customerId: options.customerId } : undefined,
    orderBy: { createdAt: 'desc' },
    take: options.limit ?? 25,
  });
}

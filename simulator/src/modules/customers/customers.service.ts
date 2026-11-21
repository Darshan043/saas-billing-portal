import { Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import {
  labelForTokenKind,
  rejectRawCredentials,
  tokenKindFromValue,
} from '../../lib/tokens';
import { emitEvent } from '../webhooks/webhook.service';

function detailsMatch(
  customer: { email: string; name: string },
  input: { email: string; name: string },
): boolean {
  return customer.email === input.email && customer.name === input.name;
}

async function readCustomerByIdempotencyKey(
  idempotencyKey: string,
  input: { email: string; name: string },
) {
  const existing = await prisma.customer.findUnique({
    where: { idempotencyKey },
    include: { paymentMethods: true },
  });
  if (!existing) {
    return null;
  }
  if (!detailsMatch(existing, input)) {
    throw AppError.conflict(
      'IDEMPOTENCY_KEY_REUSED',
      'Idempotency key was already used with different customer details',
    );
  }
  return existing;
}

export async function createCustomer(input: {
  email: string;
  name: string;
  idempotencyKey?: string;
}) {
  rejectRawCredentials(input, 'body');

  if (input.idempotencyKey) {
    const existing = await readCustomerByIdempotencyKey(
      input.idempotencyKey,
      input,
    );
    if (existing) {
      return existing;
    }
  }

  try {
    const customer = await prisma.customer.create({
      data: {
        email: input.email,
        name: input.name,
        idempotencyKey: input.idempotencyKey,
      },
      include: { paymentMethods: true },
    });
    await emitEvent('customer.created', customer.id, {
      customerId: customer.id,
      email: customer.email,
      name: customer.name,
    });
    return customer;
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      if (input.idempotencyKey) {
        const existing = await readCustomerByIdempotencyKey(
          input.idempotencyKey,
          input,
        );
        if (existing) {
          return existing;
        }
      }
      throw AppError.conflict(
        'CUSTOMER_EXISTS',
        'A simulated customer with this email already exists',
      );
    }
    throw err;
  }
}

export async function getCustomer(id: string) {
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: { paymentMethods: { orderBy: { createdAt: 'desc' } } },
  });
  if (!customer) {
    throw AppError.notFound('CUSTOMER_NOT_FOUND', 'Simulated customer not found');
  }
  return customer;
}

export async function attachPaymentMethod(customerId: string, token: string) {
  rejectRawCredentials({ token }, 'body');
  await getCustomer(customerId);
  const tokenKind = tokenKindFromValue(token);
  return prisma.paymentMethod.create({
    data: {
      customerId,
      tokenKind,
      label: labelForTokenKind(tokenKind),
    },
  });
}

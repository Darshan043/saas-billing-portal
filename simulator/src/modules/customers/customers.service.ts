import { Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import {
  labelForTokenKind,
  rejectRawCredentials,
  tokenKindFromValue,
} from '../../lib/tokens';
import { emitEvent } from '../webhooks/webhook.service';

export async function createCustomer(input: {
  email: string;
  name: string;
}) {
  rejectRawCredentials(input, 'body');
  try {
    const customer = await prisma.customer.create({
      data: { email: input.email, name: input.name },
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

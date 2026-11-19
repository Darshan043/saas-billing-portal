import { UserRole } from '@prisma/client';
import { AppError } from '../../lib/errors';
import { signAccessToken } from '../../lib/jwt';
import {
  hashPassword,
  verifyDummyPassword,
  verifyPassword,
} from '../../lib/password';
import { prisma } from '../../lib/prisma';
import type { LoginInput, RegisterInput } from './auth.schemas';

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
};

function toPublicUser(user: {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

export async function registerUser(
  input: RegisterInput,
): Promise<{ user: PublicUser; token: string }> {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
  });
  if (existing) {
    throw AppError.conflict(
      'EMAIL_ALREADY_EXISTS',
      'An account with this email already exists',
    );
  }

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash,
      role: UserRole.CUSTOMER,
      lastLoginAt: new Date(),
    },
  });

  const token = signAccessToken({ id: user.id, role: user.role });
  return { user: toPublicUser(user), token };
}

export async function loginUser(
  input: LoginInput,
): Promise<{ user: PublicUser; token: string }> {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
  });

  if (!user) {
    await verifyDummyPassword(input.password);
    throw AppError.unauthorized(
      'INVALID_CREDENTIALS',
      'Invalid email or password',
    );
  }

  const matches = await verifyPassword(input.password, user.passwordHash);
  if (!matches) {
    throw AppError.unauthorized(
      'INVALID_CREDENTIALS',
      'Invalid email or password',
    );
  }

  if (!user.isActive) {
    throw AppError.forbidden(
      'ACCOUNT_DISABLED',
      'This account has been disabled',
    );
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const token = signAccessToken({ id: updated.id, role: updated.role });
  return { user: toPublicUser(updated), token };
}

export async function getCurrentUser(userId: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });
  if (!user || !user.isActive) {
    throw AppError.unauthorized('UNAUTHENTICATED', 'Authentication required');
  }
  return toPublicUser(user);
}

import { MembershipRole, UserRole } from '@prisma/client';
import { AppError } from '../../lib/errors';
import { signAccessToken } from '../../lib/jwt';
import {
  hashPassword,
  verifyDummyPassword,
  verifyPassword,
} from '../../lib/password';
import { prisma } from '../../lib/prisma';
import type { LoginInput, RegisterInput } from './auth.schemas';

export type PublicOrganization = {
  id: string;
  name: string;
  membershipRole: MembershipRole;
};

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  organization: PublicOrganization | null;
};

const userWithOrgInclude = {
  memberships: {
    include: { organization: true },
  },
} as const;

function toPublicUser(user: {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  memberships?: Array<{
    role: MembershipRole;
    organization: { id: string; name: string };
  }>;
}): PublicUser {
  const membership = user.memberships?.[0];
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    organization: membership
      ? {
          id: membership.organization.id,
          name: membership.organization.name,
          membershipRole: membership.role,
        }
      : null,
  };
}

async function loadPublicUser(userId: string): Promise<PublicUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: userWithOrgInclude,
  });
  if (!user) {
    return null;
  }
  return toPublicUser(user);
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

  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash,
        role: UserRole.CUSTOMER,
        lastLoginAt: new Date(),
      },
    });
    const organization = await tx.organization.create({
      data: {
        name: input.organizationName,
        billingEmail: input.email,
      },
    });
    const membership = await tx.membership.create({
      data: {
        userId: user.id,
        organizationId: organization.id,
        role: MembershipRole.OWNER,
      },
    });
    return { user, organization, membership };
  });

  const token = signAccessToken({
    id: created.user.id,
    role: created.user.role,
  });
  return {
    user: {
      id: created.user.id,
      name: created.user.name,
      email: created.user.email,
      role: created.user.role,
      organization: {
        id: created.organization.id,
        name: created.organization.name,
        membershipRole: created.membership.role,
      },
    },
    token,
  };
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

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const publicUser = await loadPublicUser(user.id);
  if (!publicUser) {
    throw AppError.unauthorized('UNAUTHENTICATED', 'Authentication required');
  }

  const token = signAccessToken({ id: publicUser.id, role: publicUser.role });
  return { user: publicUser, token };
}

export async function getCurrentUser(userId: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: userWithOrgInclude,
  });
  if (!user || !user.isActive) {
    throw AppError.unauthorized('UNAUTHENTICATED', 'Authentication required');
  }
  return toPublicUser(user);
}

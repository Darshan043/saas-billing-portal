import { MembershipRole, Prisma, UserRole } from '@prisma/client';
import { AppError } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import type {
  CreateOrganizationInput,
  UpdateOrganizationInput,
} from './organizations.schemas';

export type OrganizationSummary = {
  id: string;
  name: string;
  billingEmail: string;
  createdAt: Date;
  updatedAt?: Date;
  membershipRole: MembershipRole;
};

function isUniqueConstraint(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
  );
}

export async function createOrganizationForUser(
  user: { id: string; email: string; role: UserRole },
  input: CreateOrganizationInput,
): Promise<OrganizationSummary> {
  if (user.role === UserRole.ADMIN) {
    throw AppError.forbidden(
      'FORBIDDEN',
      'Admin accounts cannot own a billing organization',
    );
  }

  const existing = await prisma.membership.findUnique({
    where: { userId: user.id },
  });
  if (existing) {
    throw AppError.conflict(
      'ORGANIZATION_ALREADY_EXISTS',
      'You already belong to an organization',
    );
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: input.name,
          billingEmail: input.billingEmail ?? user.email,
        },
      });
      const membership = await tx.membership.create({
        data: {
          userId: user.id,
          organizationId: organization.id,
          role: MembershipRole.OWNER,
        },
      });
      return { organization, membership };
    });

    return {
      id: created.organization.id,
      name: created.organization.name,
      billingEmail: created.organization.billingEmail,
      createdAt: created.organization.createdAt,
      membershipRole: created.membership.role,
    };
  } catch (err) {
    if (isUniqueConstraint(err)) {
      throw AppError.conflict(
        'ORGANIZATION_ALREADY_EXISTS',
        'You already belong to an organization',
      );
    }
    throw err;
  }
}

export async function getOrganizationForUser(
  userId: string,
): Promise<OrganizationSummary> {
  const membership = await prisma.membership.findUnique({
    where: { userId },
    include: { organization: true },
  });
  if (!membership) {
    throw AppError.forbidden(
      'ORGANIZATION_REQUIRED',
      'An organization is required',
    );
  }

  return {
    id: membership.organization.id,
    name: membership.organization.name,
    billingEmail: membership.organization.billingEmail,
    createdAt: membership.organization.createdAt,
    updatedAt: membership.organization.updatedAt,
    membershipRole: membership.role,
  };
}

export async function updateOrganization(
  organizationId: string,
  membershipRole: MembershipRole,
  input: UpdateOrganizationInput,
): Promise<OrganizationSummary> {
  const organization = await prisma.organization.update({
    where: { id: organizationId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.billingEmail !== undefined
        ? { billingEmail: input.billingEmail }
        : {}),
    },
  });

  return {
    id: organization.id,
    name: organization.name,
    billingEmail: organization.billingEmail,
    createdAt: organization.createdAt,
    updatedAt: organization.updatedAt,
    membershipRole,
  };
}

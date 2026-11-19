import { MembershipRole, UserRole } from '@prisma/client';
import type { Express } from 'express';
import request from 'supertest';
import { env } from '../src/config/env';
import { hashPassword } from '../src/lib/password';
import { prisma } from '../src/lib/prisma';

export const TEST_PASSWORD = 'Password1';

export function cookieHeader(
  header: string[] | string | undefined,
  name: string,
): string | undefined {
  const parts = Array.isArray(header) ? header : header ? [header] : [];
  return parts.find((item) => item.startsWith(`${name}=`));
}

export async function importApp(): Promise<Express> {
  const mod = await import('../src/app');
  return mod.app;
}

export async function clearTestUsersAndOrgs(): Promise<void> {
  await prisma.membership.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

export async function clearTestPlans(): Promise<void> {
  await prisma.planPrice.deleteMany();
  await prisma.plan.deleteMany();
}

type CreateUserOptions = {
  email: string;
  name?: string;
  password?: string;
  role?: UserRole;
  withOrganization?: boolean;
  organizationName?: string;
  membershipRole?: MembershipRole;
};

export async function createTestUser(options: CreateUserOptions) {
  const password = options.password ?? TEST_PASSWORD;
  const user = await prisma.user.create({
    data: {
      name: options.name ?? 'Test User',
      email: options.email.toLowerCase(),
      passwordHash: await hashPassword(password),
      role: options.role ?? UserRole.CUSTOMER,
    },
  });

  if (!options.withOrganization) {
    return { user, organization: null, membership: null };
  }

  const organization = await prisma.organization.create({
    data: {
      name: options.organizationName ?? `${user.name} Org`,
      billingEmail: user.email,
    },
  });
  const membership = await prisma.membership.create({
    data: {
      userId: user.id,
      organizationId: organization.id,
      role: options.membershipRole ?? MembershipRole.OWNER,
    },
  });
  return { user, organization, membership };
}

export async function loginAs(
  app: Express,
  email: string,
  password = TEST_PASSWORD,
) {
  const res = await request(app).post('/auth/login').send({ email, password });
  return {
    res,
    cookie: cookieHeader(res.headers['set-cookie'], env.COOKIE_NAME),
  };
}

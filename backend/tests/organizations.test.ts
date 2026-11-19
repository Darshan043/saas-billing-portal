import { MembershipRole, UserRole } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { assertTestDatabase, TEST_DATABASE_NAME } from './dbSafety';
import {
  TEST_PASSWORD,
  clearTestUsersAndOrgs,
  cookieHeader,
  createTestUser,
  importApp,
  loginAs,
} from './helpers';
import { env } from '../src/config/env';

const password = TEST_PASSWORD;

async function expectTestDatabase(): Promise<void> {
  assertTestDatabase(process.env.DATABASE_URL);
  const rows = await prisma.$queryRaw<Array<{ current_database: string }>>`
    SELECT current_database()
  `;
  expect(rows[0]?.current_database).toBe(TEST_DATABASE_NAME);
}

describe('organizations', () => {
  beforeEach(async () => {
    await expectTestDatabase();
    await clearTestUsersAndOrgs();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('register creates user + organization + OWNER membership', async () => {
    const app = await importApp();
    const res = await request(app).post('/auth/register').send({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      password,
      organizationName: 'Ada Org',
    });

    expect(res.status).toBe(201);
    expect(res.body.user.organization).toMatchObject({
      name: 'Ada Org',
      membershipRole: 'OWNER',
    });
    expect(res.body.user.organization.id).toEqual(expect.any(String));

    const storedOrg = await prisma.organization.findUnique({
      where: { id: res.body.user.organization.id },
    });
    expect(storedOrg?.billingEmail).toBe('ada@example.com');
    expect(storedOrg).not.toHaveProperty('passwordHash');

    const membership = await prisma.membership.findUnique({
      where: { userId: res.body.user.id },
    });
    expect(membership?.role).toBe(MembershipRole.OWNER);
    expect(membership?.organizationId).toBe(storedOrg?.id);
  });

  it('register without organizationName returns 400 VALIDATION_ERROR', async () => {
    const app = await importApp();
    const res = await request(app).post('/auth/register').send({
      name: 'Ada',
      email: 'ada@example.com',
      password,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'organizationName' }),
      ]),
    );
  });

  it('login and /auth/me include organization; users without membership get null', async () => {
    const app = await importApp();
    await createTestUser({
      email: 'owner@example.com',
      name: 'Owner',
      withOrganization: true,
      organizationName: 'Owner Org',
    });
    await createTestUser({
      email: 'admin@example.com',
      name: 'Admin',
      role: UserRole.ADMIN,
    });

    const ownerLogin = await request(app).post('/auth/login').send({
      email: 'owner@example.com',
      password,
    });
    expect(ownerLogin.status).toBe(200);
    expect(ownerLogin.body.user.organization).toMatchObject({
      name: 'Owner Org',
      membershipRole: 'OWNER',
    });

    const ownerMe = await request(app)
      .get('/auth/me')
      .set('Cookie', cookieHeader(ownerLogin.headers['set-cookie'], env.COOKIE_NAME) ?? '');
    expect(ownerMe.status).toBe(200);
    expect(ownerMe.body.user.organization).toMatchObject({
      name: 'Owner Org',
      membershipRole: 'OWNER',
    });

    const adminLogin = await request(app).post('/auth/login').send({
      email: 'admin@example.com',
      password,
    });
    expect(adminLogin.status).toBe(200);
    expect(adminLogin.body.user.organization).toBeNull();

    const adminMe = await request(app)
      .get('/auth/me')
      .set('Cookie', cookieHeader(adminLogin.headers['set-cookie'], env.COOKIE_NAME) ?? '');
    expect(adminMe.status).toBe(200);
    expect(adminMe.body.user.organization).toBeNull();
  });

  it('POST /orgs creates for customers without an org and rejects duplicates, admins, guests, and bad input', async () => {
    const app = await importApp();
    const customer = await createTestUser({ email: 'old@example.com', name: 'Old' });
    const { cookie } = await loginAs(app, customer.user.email);

    const created = await request(app)
      .post('/orgs')
      .set('Cookie', cookie ?? '')
      .send({ name: 'Late Org' });
    expect(created.status).toBe(201);
    expect(created.body.organization).toMatchObject({
      name: 'Late Org',
      billingEmail: 'old@example.com',
      membershipRole: 'OWNER',
    });
    expect(created.body.organization).not.toHaveProperty('providerCustomerId');
    expect(created.body.organization).not.toHaveProperty('nextInvoiceNumber');

    const duplicate = await request(app)
      .post('/orgs')
      .set('Cookie', cookie ?? '')
      .send({ name: 'Another Org' });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('ORGANIZATION_ALREADY_EXISTS');

    const admin = await createTestUser({
      email: 'staff@example.com',
      name: 'Staff',
      role: UserRole.ADMIN,
    });
    const adminLogin = await loginAs(app, admin.user.email);
    const adminCreate = await request(app)
      .post('/orgs')
      .set('Cookie', adminLogin.cookie ?? '')
      .send({ name: 'Admin Org' });
    expect(adminCreate.status).toBe(403);
    expect(adminCreate.body.error.code).toBe('FORBIDDEN');

    const unauth = await request(app).post('/orgs').send({ name: 'Nope' });
    expect(unauth.status).toBe(401);

    const invalid = await request(app)
      .post('/orgs')
      .set('Cookie', cookie ?? '')
      .send({ name: 'A', billingEmail: 'not-an-email' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('GET /orgs/current returns only the caller org and 403 without one', async () => {
    const app = await importApp();
    const owner = await createTestUser({
      email: 'a@example.com',
      name: 'A',
      withOrganization: true,
      organizationName: 'Alpha',
    });
    const { cookie } = await loginAs(app, owner.user.email);

    const current = await request(app)
      .get('/orgs/current')
      .set('Cookie', cookie ?? '');
    expect(current.status).toBe(200);
    expect(current.body.organization).toMatchObject({
      id: owner.organization?.id,
      name: 'Alpha',
      billingEmail: 'a@example.com',
      membershipRole: 'OWNER',
    });
    expect(current.body.organization).toHaveProperty('createdAt');
    expect(current.body.organization).toHaveProperty('updatedAt');
    expect(current.body.organization).not.toHaveProperty('providerCustomerId');
    expect(current.body.organization).not.toHaveProperty('nextInvoiceNumber');
    expect(JSON.stringify(current.body)).not.toContain('providerCustomerId');
    expect(JSON.stringify(current.body)).not.toContain('nextInvoiceNumber');

    const noOrg = await createTestUser({ email: 'none@example.com', name: 'None' });
    const noneLogin = await loginAs(app, noOrg.user.email);
    const missing = await request(app)
      .get('/orgs/current')
      .set('Cookie', noneLogin.cookie ?? '');
    expect(missing.status).toBe(403);
    expect(missing.body.error.code).toBe('ORGANIZATION_REQUIRED');
  });

  it('PATCH /orgs/current allows OWNER updates and rejects MEMBER, empty body, and invalid email', async () => {
    const app = await importApp();
    const owner = await createTestUser({
      email: 'owner@example.com',
      name: 'Owner',
      withOrganization: true,
      organizationName: 'Owner Org',
    });
    const { cookie } = await loginAs(app, owner.user.email);

    const updated = await request(app)
      .patch('/orgs/current')
      .set('Cookie', cookie ?? '')
      .send({ name: 'Renamed Org', billingEmail: 'billing@example.com' });
    expect(updated.status).toBe(200);
    expect(updated.body.organization).toMatchObject({
      name: 'Renamed Org',
      billingEmail: 'billing@example.com',
      membershipRole: 'OWNER',
    });

    const empty = await request(app)
      .patch('/orgs/current')
      .set('Cookie', cookie ?? '')
      .send({});
    expect(empty.status).toBe(400);
    expect(empty.body.error.code).toBe('VALIDATION_ERROR');

    const badEmail = await request(app)
      .patch('/orgs/current')
      .set('Cookie', cookie ?? '')
      .send({ billingEmail: 'not-an-email' });
    expect(badEmail.status).toBe(400);
    expect(badEmail.body.error.code).toBe('VALIDATION_ERROR');

    const member = await createTestUser({
      email: 'member@example.com',
      name: 'Member',
      withOrganization: true,
      organizationName: 'Member Org',
      membershipRole: MembershipRole.MEMBER,
    });
    const memberLogin = await loginAs(app, member.user.email);
    const memberPatch = await request(app)
      .patch('/orgs/current')
      .set('Cookie', memberLogin.cookie ?? '')
      .send({ name: 'Hijack' });
    expect(memberPatch.status).toBe(403);
    expect(memberPatch.body.error.code).toBe('FORBIDDEN');
  });

  it('isolates organization data between users A and B', async () => {
    const app = await importApp();
    const userA = await createTestUser({
      email: 'a@example.com',
      name: 'User A',
      withOrganization: true,
      organizationName: 'Org A',
    });
    const userB = await createTestUser({
      email: 'b@example.com',
      name: 'User B',
      withOrganization: true,
      organizationName: 'Org B',
    });
    const loginA = await loginAs(app, userA.user.email);

    const currentA = await request(app)
      .get(`/orgs/current?organizationId=${userB.organization?.id}`)
      .set('Cookie', loginA.cookie ?? '');
    expect(currentA.status).toBe(200);
    expect(currentA.body.organization.id).toBe(userA.organization?.id);
    expect(currentA.body.organization.name).toBe('Org A');
    expect(currentA.body.organization.id).not.toBe(userB.organization?.id);

    const patchA = await request(app)
      .patch(`/orgs/current?organizationId=${userB.organization?.id}&id=${userB.organization?.id}`)
      .set('Cookie', loginA.cookie ?? '')
      .send({
        name: 'Org A Updated',
        organizationId: userB.organization?.id,
        id: userB.organization?.id,
        role: 'MEMBER',
        membershipRole: 'MEMBER',
      });
    expect(patchA.status).toBe(200);
    expect(patchA.body.organization.id).toBe(userA.organization?.id);
    expect(patchA.body.organization.name).toBe('Org A Updated');
    expect(patchA.body.organization.membershipRole).toBe('OWNER');

    const orgA = await prisma.organization.findUnique({
      where: { id: userA.organization?.id ?? '' },
    });
    const orgB = await prisma.organization.findUnique({
      where: { id: userB.organization?.id ?? '' },
    });
    expect(orgA?.name).toBe('Org A Updated');
    expect(orgB?.name).toBe('Org B');

    const membershipA = await prisma.membership.findUnique({
      where: { userId: userA.user.id },
    });
    expect(membershipA?.role).toBe(MembershipRole.OWNER);
    expect(membershipA?.organizationId).toBe(userA.organization?.id);
  });

  it('rejects a second membership for the same user via unique userId', async () => {
    const { user, organization } = await createTestUser({
      email: 'one@example.com',
      withOrganization: true,
      organizationName: 'First Org',
    });
    const otherOrg = await prisma.organization.create({
      data: { name: 'Second Org', billingEmail: 'one@example.com' },
    });

    await expect(
      prisma.membership.create({
        data: {
          userId: user.id,
          organizationId: otherOrg.id,
          role: MembershipRole.MEMBER,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });

    const count = await prisma.membership.count({ where: { userId: user.id } });
    expect(count).toBe(1);
    expect(organization?.id).toBeDefined();
  });

  it('rolls back the user when organization creation fails', async () => {
    const originalTransaction = prisma.$transaction.bind(prisma);
    // mockImplementationOnce keeps the real $transaction afterwards.
    // Do not mockRestore: Prisma Client methods do not survive Vitest restore.
    vi.spyOn(prisma, '$transaction').mockImplementationOnce((arg) => {
      if (typeof arg !== 'function') {
        throw new Error('expected interactive transaction');
      }
      return originalTransaction(async (tx) => {
        tx.organization.create = (async () => {
          throw new Error('forced organization create failure');
        }) as typeof tx.organization.create;
        return arg(tx);
      });
    });

    const app = await importApp();
    const res = await request(app).post('/auth/register').send({
      name: 'Ghost',
      email: 'ghost@example.com',
      password,
      organizationName: 'Ghost Org',
    });

    expect(res.status).toBe(500);
    expect(
      await prisma.user.findUnique({ where: { email: 'ghost@example.com' } }),
    ).toBeNull();
    expect(
      await prisma.organization.findFirst({ where: { name: 'Ghost Org' } }),
    ).toBeNull();
  });
});

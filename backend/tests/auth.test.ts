import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { env } from '../src/config/env';
import { prisma } from '../src/lib/prisma';
import { assertTestDatabase, TEST_DATABASE_NAME } from './dbSafety';
import { TEST_PASSWORD, clearTestUsersAndOrgs, cookieHeader, importApp } from './helpers';

const password = TEST_PASSWORD;
const organizationName = 'Ada Org';

describe('auth', () => {
  beforeEach(async () => {
    assertTestDatabase(process.env.DATABASE_URL);
    const rows = await prisma.$queryRaw<Array<{ current_database: string }>>`
      SELECT current_database()
    `;
    expect(rows[0]?.current_database).toBe(TEST_DATABASE_NAME);
    await clearTestUsersAndOrgs();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('register success returns 201, public user, httpOnly cookie, CUSTOMER role', async () => {
    const app = await importApp();
    const res = await request(app).post('/auth/register').send({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      password,
      organizationName,
    });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      role: 'CUSTOMER',
      organization: {
        name: organizationName,
        membershipRole: 'OWNER',
      },
    });
    expect(res.body.user.id).toEqual(expect.any(String));
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(res.body)).not.toContain(password);

    const setCookie = cookieHeader(res.headers['set-cookie'], env.COOKIE_NAME);
    expect(setCookie).toBeDefined();
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
  });

  it('stores email lowercase and rejects duplicate email of any casing with 409', async () => {
    const app = await importApp();
    const first = await request(app).post('/auth/register').send({
      name: 'Ada',
      email: 'Ada@Example.COM',
      password,
      organizationName,
    });
    expect(first.status).toBe(201);
    expect(first.body.user.email).toBe('ada@example.com');

    const second = await request(app).post('/auth/register').send({
      name: 'Ada 2',
      email: 'ADA@example.com',
      password,
      organizationName,
    });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
  });

  it('ignores a client-supplied ADMIN role and still creates CUSTOMER', async () => {
    const app = await importApp();
    const res = await request(app).post('/auth/register').send({
      name: 'Hacker',
      email: 'hacker@example.com',
      password,
      role: 'ADMIN',
      organizationName,
    });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('CUSTOMER');
    const stored = await prisma.user.findUnique({
      where: { email: 'hacker@example.com' },
    });
    expect(stored?.role).toBe('CUSTOMER');
  });

  it('returns 400 VALIDATION_ERROR with field details for bad register input', async () => {
    const app = await importApp();

    const invalidEmail = await request(app).post('/auth/register').send({
      name: 'Ada',
      email: 'not-an-email',
      password,
      organizationName,
    });
    expect(invalidEmail.status).toBe(400);
    expect(invalidEmail.body.error.code).toBe('VALIDATION_ERROR');
    expect(invalidEmail.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'email' }),
      ]),
    );

    const shortPassword = await request(app).post('/auth/register').send({
      name: 'Ada',
      email: 'ada2@example.com',
      password: 'Ab1',
      organizationName,
    });
    expect(shortPassword.status).toBe(400);
    expect(shortPassword.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'password' }),
      ]),
    );

    const noNumber = await request(app).post('/auth/register').send({
      name: 'Ada',
      email: 'ada3@example.com',
      password: 'Password',
      organizationName,
    });
    expect(noNumber.status).toBe(400);
    expect(noNumber.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'password' }),
      ]),
    );

    const missingName = await request(app).post('/auth/register').send({
      email: 'ada4@example.com',
      password,
      organizationName,
    });
    expect(missingName.status).toBe(400);
    expect(missingName.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'name' }),
      ]),
    );
  });

  it('login success; wrong password and unknown email share the 401 body; inactive is 403', async () => {
    const app = await importApp();
    await request(app).post('/auth/register').send({
      name: 'Ada',
      email: 'ada@example.com',
      password,
      organizationName,
    });

    const success = await request(app).post('/auth/login').send({
      email: 'ada@example.com',
      password,
    });
    expect(success.status).toBe(200);
    expect(success.body.user.email).toBe('ada@example.com');
    expect(success.body.user).not.toHaveProperty('passwordHash');

    const wrongPassword = await request(app).post('/auth/login').send({
      email: 'ada@example.com',
      password: 'WrongPass1',
    });
    const unknownEmail = await request(app).post('/auth/login').send({
      email: 'nobody@example.com',
      password: 'WrongPass1',
    });
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(wrongPassword.body.error.message).toBe('Invalid email or password');

    await prisma.user.update({
      where: { email: 'ada@example.com' },
      data: { isActive: false },
    });
    const disabled = await request(app).post('/auth/login').send({
      email: 'ada@example.com',
      password,
    });
    expect(disabled.status).toBe(403);
    expect(disabled.body.error.code).toBe('ACCOUNT_DISABLED');
  });

  it('GET /auth/me works with cookie and rejects missing, tampered, and expired tokens', async () => {
    const app = await importApp();
    const registered = await request(app).post('/auth/register').send({
      name: 'Ada',
      email: 'ada@example.com',
      password,
      organizationName,
    });
    const cookie = cookieHeader(registered.headers['set-cookie'], env.COOKIE_NAME);
    expect(cookie).toBeDefined();

    const me = await request(app).get('/auth/me').set('Cookie', cookie ?? '');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('ada@example.com');

    const noCookie = await request(app).get('/auth/me');
    expect(noCookie.status).toBe(401);
    expect(noCookie.body.error.code).toBe('UNAUTHENTICATED');

    const tampered = (cookie ?? '').replace(
      new RegExp(`^${env.COOKIE_NAME}=[^.]+`),
      `${env.COOKIE_NAME}=tampered`,
    );
    const badToken = await request(app).get('/auth/me').set('Cookie', tampered);
    expect(badToken.status).toBe(401);

    const expired = jwt.sign(
      {
        sub: registered.body.user.id,
        role: 'CUSTOMER',
        exp: Math.floor(Date.now() / 1000) - 60,
      },
      env.JWT_SECRET,
      { algorithm: 'HS256' },
    );
    const expiredRes = await request(app)
      .get('/auth/me')
      .set('Cookie', `${env.COOKIE_NAME}=${expired}`);
    expect(expiredRes.status).toBe(401);
  });

  it('logout clears the cookie and /auth/me then returns 401', async () => {
    const app = await importApp();
    const agent = request.agent(app);
    await agent.post('/auth/register').send({
      name: 'Ada',
      email: 'ada@example.com',
      password,
      organizationName,
    });

    const logout = await agent.post('/auth/logout');
    expect(logout.status).toBe(200);
    expect(logout.body).toEqual({ ok: true });
    const cleared = cookieHeader(logout.headers['set-cookie'], env.COOKIE_NAME);
    expect(cleared).toMatch(new RegExp(`${env.COOKIE_NAME}=;`));

    const me = await agent.get('/auth/me');
    expect(me.status).toBe(401);
  });

  it('role checks: customer 403 on admin ping, admin 200, unauthenticated 401', async () => {
    const app = await importApp();
    const customer = await request(app).post('/auth/register').send({
      name: 'Customer',
      email: 'customer@example.com',
      password,
      organizationName,
    });
    const customerCookie = cookieHeader(
      customer.headers['set-cookie'],
      env.COOKIE_NAME,
    );

    const customerPing = await request(app)
      .get('/admin/ping')
      .set('Cookie', customerCookie ?? '');
    expect(customerPing.status).toBe(403);
    expect(customerPing.body.error.code).toBe('FORBIDDEN');

    const unauth = await request(app).get('/admin/ping');
    expect(unauth.status).toBe(401);

    await prisma.user.update({
      where: { email: 'customer@example.com' },
      data: { role: 'ADMIN' },
    });
    const adminLogin = await request(app).post('/auth/login').send({
      email: 'customer@example.com',
      password,
    });
    const adminCookie = cookieHeader(
      adminLogin.headers['set-cookie'],
      env.COOKIE_NAME,
    );
    const adminPing = await request(app)
      .get('/admin/ping')
      .set('Cookie', adminCookie ?? '');
    expect(adminPing.status).toBe(200);
    expect(adminPing.body).toEqual({ ok: true, role: 'ADMIN' });
  });

  it('stores a bcrypt hash and never returns password material', async () => {
    const app = await importApp();
    const res = await request(app).post('/auth/register').send({
      name: 'Ada',
      email: 'ada@example.com',
      password,
      organizationName,
    });
    expect(JSON.stringify(res.body)).not.toContain(password);
    expect(res.body.user).not.toHaveProperty('passwordHash');

    const stored = await prisma.user.findUnique({
      where: { email: 'ada@example.com' },
    });
    expect(stored).not.toBeNull();
    expect(stored?.passwordHash).not.toBe(password);
    expect(await bcrypt.compare(password, stored?.passwordHash ?? '')).toBe(
      true,
    );
  });

  it('unknown route is 404 and malformed JSON is 400 INVALID_JSON', async () => {
    const app = await importApp();
    const missing = await request(app).get('/no-such-route');
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');
    expect(missing.body.error).toHaveProperty('message');

    const malformed = await request(app)
      .post('/auth/register')
      .set('Content-Type', 'application/json')
      .send('{"name":');
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe('INVALID_JSON');
  });
});

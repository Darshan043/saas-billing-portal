import type { Express } from 'express';
import request from 'supertest';
import { vi } from 'vitest';
import { env } from '../src/config/env';
import { prisma } from '../src/lib/prisma';

export async function importApp(): Promise<Express> {
  const mod = await import('../src/app');
  return mod.app;
}

function withKey(app: Express, header: string, value: string) {
  return {
    get: (path: string) => request(app).get(path).set(header, value),
    post: (path: string) => request(app).post(path).set(header, value),
    patch: (path: string) => request(app).patch(path).set(header, value),
  };
}

export function api(app: Express) {
  return withKey(app, 'X-Simulator-Key', env.SIMULATOR_API_KEY);
}

export function control(app: Express) {
  return withKey(
    app,
    'X-Simulator-Control-Token',
    env.SIMULATOR_CONTROL_TOKEN,
  );
}

export async function clearSimulatorData(): Promise<void> {
  await prisma.webhookDelivery.deleteMany();
  await prisma.webhookEvent.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.subscriptionOp.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.paymentMethod.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.settings.deleteMany();
}

export function stubWebhookFetch(
  impl?: (
    url: string,
    init?: RequestInit,
  ) => Promise<Response> | Response,
) {
  const originalFetch = globalThis.fetch;
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/webhooks/payments')) {
      if (impl) {
        return impl(url, init);
      }
      return new Response('{"ok":true}', { status: 200 });
    }
    return originalFetch(input, init);
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

export async function createTestCustomer(
  app: Express,
  overrides: { email?: string; name?: string } = {},
) {
  const suffix = crypto.randomUUID().slice(0, 8);
  const res = await api(app)
    .post('/v1/customers')
    .send({
      email: overrides.email ?? `cust-${suffix}@simulator.test`,
      name: overrides.name ?? 'Sim Customer',
    });
  return res;
}

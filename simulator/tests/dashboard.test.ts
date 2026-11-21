import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { api, clearSimulatorData, importApp, stubWebhookFetch } from './helpers';

describe('dashboard', () => {
  beforeEach(async () => {
    await clearSimulatorData();
    stubWebhookFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await prisma.$disconnect();
  });

  it('serves a labelled simulator dashboard', async () => {
    const app = await importApp();
    const res = await api(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('SIMULATOR — no real money');
    expect(res.text).toContain('Payment simulator dashboard');
    expect(res.text).not.toContain(process.env.WEBHOOK_SIGNING_SECRET);
  });

  it('returns overview data without secrets', async () => {
    const app = await importApp();
    const res = await api(app).get('/sim/overview');
    expect(res.status).toBe(200);
    expect(res.body.notice).toContain('SIMULATOR');
    expect(JSON.stringify(res.body)).not.toContain(
      process.env.WEBHOOK_SIGNING_SECRET,
    );
  });
});

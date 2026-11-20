// authCookie.test.ts – revised to avoid network bindings in sandbox

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';

// Simple mock of Express's Response object sufficient for cookie()
function createMockResponse() {
  let cookieHeader = '';
  return {
    cookie: (name: string, value: string, options: Record<string, unknown>) => {
      const parts = [] as string[];
      parts.push(`${name}=${value}`);
      for (const [k, v] of Object.entries(options)) {
        if (typeof v === 'boolean') {
          if (v) parts.push(k.charAt(0).toUpperCase() + k.slice(1));
        } else if (v !== undefined) {
          parts.push(`${k}=${v}`);
        }
      }
      cookieHeader = parts.join('; ');
    },
    getCookieHeader() {
      return cookieHeader;
    },
  } as any;
}

const originalEnv = { ...process.env };

describe('auth cookie options', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    // Restore environment variables to avoid cross‑test contamination
    process.env = { ...originalEnv };
  });

  test('production mode => SameSite=None; Secure', async () => {
    process.env.NODE_ENV = 'production';
    process.env.COOKIE_NAME = 'billing_token';
    process.env.JWT_EXPIRES_IN = '7d';
    process.env.ENABLE_EMAIL_DELIVERY = 'false'; // skip SMTP validation in prod mode

    const { setAuthCookie } = await import('../src/lib/authCookie');
    const res = createMockResponse();
    setAuthCookie(res, 'dummy-token');
    const header = res.getCookieHeader();
    expect(header).toContain('sameSite=none');
    expect(header).toContain('Secure');
    expect(header).toContain('HttpOnly');
  });

  test('development mode => SameSite=Lax; not Secure', async () => {
    process.env.NODE_ENV = 'development';
    process.env.COOKIE_NAME = 'billing_token';
    process.env.JWT_EXPIRES_IN = '7d';
    // email delivery validation passes in dev, no need to set flag

    const { setAuthCookie } = await import('../src/lib/authCookie');
    const res = createMockResponse();
    setAuthCookie(res, 'dummy-token');
    const header = res.getCookieHeader();
    expect(header).toContain('sameSite=lax');
    expect(header).not.toContain('Secure');
    expect(header).toContain('HttpOnly');
  });
});

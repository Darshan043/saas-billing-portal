import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env';

const baseValidEnv = {
  NODE_ENV: 'test' as const,
  DATABASE_URL: 'postgres://billing:billing@localhost:5432/billinghub_test',
  SIMULATOR_API_KEY: 'dev-only-simulator-api-key',
  WEBHOOK_SIGNING_SECRET: 'dev-only-test-secret',
  JWT_SECRET: 'dev-only-test-jwt-secret-32chars-min',
};

describe('loadEnv', () => {
  it('rejects missing required environment variables', () => {
    expect(() => loadEnv({})).toThrow(/Invalid or missing environment variables/);
  });

  it('defaults WEBHOOK_JOB_RETRY_LIMIT and SMTP settings in test mode', () => {
    const parsed = loadEnv({
      ...baseValidEnv,
      SMTP_HOST: 'localhost',
      SMTP_PORT: '1025',
    });
    expect(parsed.WEBHOOK_JOB_RETRY_LIMIT).toBe(5);
    expect(parsed.SUBSCRIPTION_PENDING_TIMEOUT_MINUTES).toBe(15);
    expect(parsed.SMTP_HOST).toBe('localhost');
    expect(parsed.SMTP_PORT).toBe(1025);
    expect(parsed.SMTP_SECURE).toBe(false);
    expect(parsed.SMTP_FROM_NAME).toBe('BillingHub');
  });

  it('defaults SMTP_HOST to Brevo and SMTP_PORT to 587 when omitted', () => {
    const parsed = loadEnv({
      ...baseValidEnv,
    });
    expect(parsed.SMTP_HOST).toBe('smtp-relay.brevo.com');
    expect(parsed.SMTP_PORT).toBe(587);
    expect(parsed.ENABLE_EMAIL_DELIVERY).toBe(true);
  });

  it('requires SMTP credentials in production when email delivery is enabled', () => {
    expect(() =>
      loadEnv({
        ...baseValidEnv,
        NODE_ENV: 'production',
        ENABLE_EMAIL_DELIVERY: 'true',
      }),
    ).toThrow(/SMTP_USER is required in production/);

    expect(() =>
      loadEnv({
        ...baseValidEnv,
        NODE_ENV: 'production',
        ENABLE_EMAIL_DELIVERY: 'true',
        SMTP_USER: 'test-user@brevo.com',
      }),
    ).toThrow(/SMTP_PASS is required in production/);

    expect(() =>
      loadEnv({
        ...baseValidEnv,
        NODE_ENV: 'production',
        ENABLE_EMAIL_DELIVERY: 'true',
        SMTP_USER: 'test-user@brevo.com',
        SMTP_PASS: 'secret-smtp-key',
      }),
    ).toThrow(/SMTP_FROM_EMAIL is required in production/);

    const validProd = loadEnv({
      ...baseValidEnv,
      NODE_ENV: 'production',
      ENABLE_EMAIL_DELIVERY: 'true',
      SMTP_USER: 'test-user@brevo.com',
      SMTP_PASS: 'secret-smtp-key',
      SMTP_FROM_EMAIL: 'billing@mycompany.com',
    });
    expect(validProd.SMTP_USER).toBe('test-user@brevo.com');
    expect(validProd.SMTP_PASS).toBe('secret-smtp-key');
    expect(validProd.SMTP_FROM_EMAIL).toBe('billing@mycompany.com');
  });

  it('allows production startup without SMTP credentials if email delivery is disabled', () => {
    const parsed = loadEnv({
      ...baseValidEnv,
      NODE_ENV: 'production',
      ENABLE_EMAIL_DELIVERY: 'false',
    });
    expect(parsed.ENABLE_EMAIL_DELIVERY).toBe(false);
    expect(parsed.SMTP_USER).toBeUndefined();
  });
});

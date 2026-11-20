import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env';

describe('loadEnv', () => {
  it('rejects missing required environment variables', () => {
    expect(() => loadEnv({})).toThrow(/Invalid or missing environment variables/);
  });

  it('defaults WEBHOOK_JOB_RETRY_LIMIT to 5', () => {
    const parsed = loadEnv({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://billing:billing@localhost:5432/billinghub_test',
      SIMULATOR_API_KEY: 'dev-only-simulator-api-key',
      WEBHOOK_SIGNING_SECRET: 'dev-only-test-secret',
      SMTP_HOST: 'localhost',
      SMTP_PORT: '1025',
      JWT_SECRET: 'dev-only-test-jwt-secret-32chars-min',
    });
    expect(parsed.WEBHOOK_JOB_RETRY_LIMIT).toBe(5);
  });
});

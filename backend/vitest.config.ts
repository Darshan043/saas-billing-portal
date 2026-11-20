import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    fileParallelism: false,
    testTimeout: 20000,
    env: {
      NODE_ENV: 'test',
      SMTP_HOST: 'localhost',
      SMTP_PORT: '1025',
      WEBHOOK_SIGNING_SECRET: 'dev-only-test-secret',
      SIMULATOR_URL: 'http://simulator:4100',
      SIMULATOR_API_KEY: 'dev-only-simulator-api-key',
      WEBHOOK_TOLERANCE_SECONDS: '300',
      WEBHOOK_JOB_RETRY_LIMIT: '5',
      SUBSCRIPTION_PENDING_TIMEOUT_MINUTES: '15',
      FRONTEND_ORIGIN: 'http://localhost:5173',
      JWT_SECRET: 'dev-only-test-jwt-secret-32chars-min',
      JWT_EXPIRES_IN: '7d',
      COOKIE_NAME: 'billing_token',
    },
  },
});

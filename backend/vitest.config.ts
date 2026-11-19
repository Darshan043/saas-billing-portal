import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      SMTP_HOST: 'localhost',
      SMTP_PORT: '1025',
      WEBHOOK_SIGNING_SECRET: 'dev-only-test-secret',
      FRONTEND_ORIGIN: 'http://localhost:5173',
      JWT_SECRET: 'dev-only-test-jwt-secret-32chars-min',
      JWT_EXPIRES_IN: '7d',
      COOKIE_NAME: 'billing_token',
    },
  },
});

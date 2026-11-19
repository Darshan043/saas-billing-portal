import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://test:test@localhost:5432/test',
      SMTP_HOST: 'localhost',
      SMTP_PORT: '1025',
      WEBHOOK_SIGNING_SECRET: 'dev-only-test-secret',
    },
  },
});

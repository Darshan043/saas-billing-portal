import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      NODE_ENV: 'test',
      WEBHOOK_SIGNING_SECRET: 'dev-only-test-secret',
    },
  },
});

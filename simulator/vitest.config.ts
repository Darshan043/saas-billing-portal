import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    fileParallelism: false,
    testTimeout: 20000,
    env: {
      NODE_ENV: 'test',
      PORT: '4100',
      BACKEND_WEBHOOK_URL: 'http://127.0.0.1:9/webhooks/payments',
      WEBHOOK_SIGNING_SECRET: 'dev-only-test-secret',
      SIMULATOR_API_KEY: 'dev-only-simulator-api-key',
      SIMULATOR_CONTROL_TOKEN: 'dev-only-simulator-control',
      WEBHOOK_MAX_ATTEMPTS: '3',
      WEBHOOK_RETRY_BASE_MS: '10',
      WEBHOOK_TIMEOUT_MS: '500',
    },
  },
});

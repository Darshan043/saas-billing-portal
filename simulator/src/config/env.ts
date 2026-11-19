import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.coerce.number().int().positive().default(4100),
  DATABASE_URL: z.string().min(1),
  TEST_DATABASE_URL: z.string().min(1).optional(),
  BACKEND_WEBHOOK_URL: z
    .string()
    .url()
    .default('http://backend:4000/webhooks/payments'),
  WEBHOOK_SIGNING_SECRET: z.string().min(16),
  SIMULATOR_API_KEY: z.string().min(8),
  SIMULATOR_CONTROL_TOKEN: z.string().min(8),
  WEBHOOK_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  WEBHOOK_RETRY_BASE_MS: z.coerce.number().int().positive().default(1000),
  WEBHOOK_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(
  source: Record<string, string | undefined> = process.env,
): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map(
        (issue) =>
          `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`,
      )
      .join('\n');
    throw new Error(`Invalid or missing environment variables:\n${details}`);
  }
  return result.data;
}

export const env = loadEnv();

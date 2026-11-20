import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  FRONTEND_ORIGIN: z.string().url().default('http://localhost:5173'),
  SIMULATOR_URL: z.string().url().default('http://simulator:4100'),
  SIMULATOR_API_KEY: z.string().min(8),
  SIMULATOR_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  WEBHOOK_SIGNING_SECRET: z.string().min(1),
  WEBHOOK_TOLERANCE_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(300),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  SEED_ADMIN_EMAIL: z.string().email().optional(),
  SEED_ADMIN_PASSWORD: z.string().min(1).optional(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().min(1).default('7d'),
  COOKIE_NAME: z.string().min(1).default('billing_token'),
  TEST_DATABASE_URL: z.string().min(1).optional(),
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

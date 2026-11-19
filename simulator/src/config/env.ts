import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.coerce.number().int().positive().default(4100),
  BACKEND_WEBHOOK_URL: z
    .string()
    .url()
    .default('http://backend:4000/webhooks/payments'),
  WEBHOOK_SIGNING_SECRET: z.string().min(1),
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

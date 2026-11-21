import { z } from 'zod';

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((val) => (val && val.length > 0 ? val : undefined));

const optionalEmail = z
  .string()
  .trim()
  .optional()
  .transform((val) => (val && val.length > 0 ? val : undefined))
  .pipe(z.string().email().optional());

const booleanFlag = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((val) => val === true || val === 'true' || val === '1');

const envSchema = z
  .object({
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
    WEBHOOK_JOB_RETRY_LIMIT: z.coerce.number().int().min(0).default(5),
    SUBSCRIPTION_PENDING_TIMEOUT_MINUTES: z.coerce
      .number()
      .int()
      .positive()
      .default(15),

    // Email delivery configuration (Brevo SMTP / Nodemailer)
    ENABLE_EMAIL_DELIVERY: booleanFlag.default(true),
    SMTP_HOST: z.string().min(1).default('smtp-relay.brevo.com'),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_SECURE: booleanFlag.default(false),
    SMTP_USER: optionalString,
    SMTP_PASS: optionalString,
    SMTP_FROM_EMAIL: optionalEmail,
    SMTP_FROM_NAME: z.string().min(1).default('BillingHub'),

    SEED_ADMIN_EMAIL: z.string().email().optional(),
    SEED_ADMIN_PASSWORD: z.string().min(1).optional(),
    JWT_SECRET: z.string().min(32),
    JWT_EXPIRES_IN: z.string().min(1).default('7d'),
    COOKIE_NAME: z.string().min(1).default('billing_token'),
    TEST_DATABASE_URL: z.string().min(1).optional(),
  })
  .superRefine((data, ctx) => {
    // In production, when email delivery is enabled, SMTP authentication and from address are mandatory.
    if (data.NODE_ENV === 'production' && data.ENABLE_EMAIL_DELIVERY) {
      if (!data.SMTP_USER) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SMTP_USER'],
          message:
            'SMTP_USER is required in production when ENABLE_EMAIL_DELIVERY is true (set to your Brevo SMTP login email)',
        });
      }
      if (!data.SMTP_PASS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SMTP_PASS'],
          message:
            'SMTP_PASS is required in production when ENABLE_EMAIL_DELIVERY is true (set to your Brevo SMTP key)',
        });
      }
      if (!data.SMTP_FROM_EMAIL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SMTP_FROM_EMAIL'],
          message:
            'SMTP_FROM_EMAIL is required in production when ENABLE_EMAIL_DELIVERY is true (set to your verified Brevo sender email)',
        });
      }
    }
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

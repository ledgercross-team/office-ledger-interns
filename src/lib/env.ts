import "dotenv/config";
import { z } from "zod";

const bool = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  PUBLIC_SITE_URL: z.string().url().default("http://localhost:4321"),
  DATABASE_URL: z.string().default("postgres://ledger:ledger@localhost:5432/office_ledger"),
  BETTER_AUTH_SECRET: z.string().min(16).default("dev-only-insecure-secret-change-me"),
  BETTER_AUTH_URL: z.string().url().optional(),
  FILE_SIGNING_SECRET: z.string().min(16).default("dev-only-file-signing-secret"),
  CRON_SECRET: z.string().default(""),
  JOBS_ENABLED: bool,
  REQUIRE_EMAIL_VERIFICATION: bool,
  SMTP_HOST: z.string().default(""),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),
  SMTP_SECURE: bool,
  MAIL_FROM: z.string().default("Office Ledger <no-reply@officeledger.local>"),
  UPSTASH_REDIS_REST_URL: z.string().default(""),
  UPSTASH_REDIS_REST_TOKEN: z.string().default(""),
  PUBLIC_VAPID_PUBLIC_KEY: z.string().default(""),
  VAPID_PRIVATE_KEY: z.string().default(""),
  VAPID_SUBJECT: z.string().default("mailto:admin@officeledger.local"),
  STORAGE_DIR: z.string().default("./storage"),
  MAX_UPLOAD_MB: z.coerce.number().default(10),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment variables");
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";
if (isProd && env.BETTER_AUTH_SECRET.startsWith("dev-only")) {
  throw new Error("BETTER_AUTH_SECRET must be set in production");
}

import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(10000),
  DATABASE_URL: z.string().url().optional(),
  CORS_ORIGIN: z.string().optional(),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  SESSION_SECRET: z.string().optional(),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  SESSION_COOKIE_NAME: z.string().min(1).default("guildops_session"),
  CSRF_COOKIE_NAME: z.string().min(1).default("guildops_csrf"),
  CSRF_HEADER_NAME: z.string().min(1).default("x-csrf-token"),
  COOKIE_DOMAIN: z.string().optional(),
  PASSWORD_PEPPER: z.string().optional(),
  APP_PUBLIC_URL: z.string().url().default("http://localhost:5173"),
  SMTP_URL: z.string().url().optional(),
  EMAIL_FROM: z.string().min(3).default("GuildOps <no-reply@guildops.app>"),
  EMAIL_VERIFICATION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(24),
  VAPID_PUBLIC_KEY: z.string().min(20).optional(),
  VAPID_PRIVATE_KEY: z.string().min(20).optional(),
  VAPID_SUBJECT: z.string().min(3).optional()
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid API environment", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  isProduction: parsed.data.NODE_ENV === "production"
};

type RuntimeConfigurationInput = Pick<
  typeof env,
  "DATABASE_URL" | "PASSWORD_PEPPER" | "SESSION_SECRET" | "isProduction"
>;

export type RuntimeConfigurationStatus = {
  ok: boolean;
  missingEnv: string[];
};

export function getRuntimeConfigurationStatus(config: RuntimeConfigurationInput = env): RuntimeConfigurationStatus {
  const missingEnv = [
    ["DATABASE_URL", config.DATABASE_URL],
    ...(config.isProduction
      ? [
          ["SESSION_SECRET", config.SESSION_SECRET],
          ["PASSWORD_PEPPER", config.PASSWORD_PEPPER]
        ]
      : [])
  ]
    .filter((entry): entry is [string, undefined] => !entry[1])
    .map(([key]) => key);

  return {
    ok: missingEnv.length === 0,
    missingEnv
  };
}

export function getCorsOrigins(): string[] {
  return (env.CORS_ORIGIN ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

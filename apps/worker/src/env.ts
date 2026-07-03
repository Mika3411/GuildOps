import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(20).default(5),
  REDIS_URL: z.string().url().optional(),
  REDIS_QUEUE_URL: z.string().url().optional(),
  REDIS_CACHE_URL: z.string().url().optional(),
  WORKER_QUEUE_NAME: z.string().min(1).default("guildops:jobs:default"),
  WORKER_QUEUE_BLOCK_TIMEOUT_SECONDS: z.coerce.number().int().min(1).max(30).default(5),
  TRANSLATION_PROVIDER: z.string().min(1).default("identity"),
  TRANSLATION_API_URL: z.string().url().optional(),
  TRANSLATION_API_KEY: z.string().optional(),
  TRANSLATION_API_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60_000).default(15_000),
  TRANSLATION_POLL_INTERVAL_MS: z.coerce.number().int().min(500).max(60_000).default(3000),
  SOS_REMINDER_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(25),
  SOS_REMINDER_POLL_INTERVAL_MS: z.coerce.number().int().min(1000).max(60_000).default(15_000),
  EVENT_REMINDER_LOOKAHEAD_MINUTES: z.coerce.number().int().min(15).max(2880).default(1440),
  PRESENCE_REMINDER_LOOKAHEAD_MINUTES: z.coerce.number().int().min(15).max(1440).default(180),
  SESSION_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(30)
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid worker environment", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

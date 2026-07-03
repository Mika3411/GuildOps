import { Redis } from "ioredis";
import { env } from "./env.js";

type RedisClient = Redis;

let queueClient: RedisClient | null | undefined;
let cacheClient: RedisClient | null | undefined;

export function getQueueClient(): RedisClient | null {
  queueClient ??= createClient(env.REDIS_QUEUE_URL ?? env.REDIS_URL, "queue");
  return queueClient;
}

export function getCacheClient(): RedisClient | null {
  cacheClient ??= createClient(env.REDIS_CACHE_URL ?? env.REDIS_URL, "cache");
  return cacheClient;
}

export async function cacheJson(key: string, value: unknown, ttlSeconds = 86_400): Promise<void> {
  const client = getCacheClient();

  if (!client) return;

  try {
    await client.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (error) {
    console.warn(`GuildOps cache write skipped: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function rememberNotification(type: string, payload: unknown): Promise<void> {
  const client = getQueueClient() ?? getCacheClient();

  if (!client) return;

  const entry = JSON.stringify({
    type,
    payload,
    createdAt: new Date().toISOString()
  });

  try {
    await client.lpush("guildops:notifications:recent", entry);
    await client.ltrim("guildops:notifications:recent", 0, 499);
  } catch (error) {
    console.warn(`GuildOps notification cache skipped: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function closeKv(): Promise<void> {
  const clients = [queueClient, cacheClient].filter((client): client is RedisClient => Boolean(client));
  queueClient = null;
  cacheClient = null;
  await Promise.all(clients.map((client) => client.quit().catch(() => client.disconnect())));
}

function createClient(url: string | undefined, role: string): RedisClient | null {
  if (!url) return null;

  const client = new Redis(url, {
    commandTimeout: 5_000,
    connectTimeout: 5_000,
    enableOfflineQueue: false,
    enableReadyCheck: true,
    lazyConnect: false,
    maxRetriesPerRequest: role === "queue" ? null : 2
  });

  client.on("error", (error: Error) => {
    console.warn(`GuildOps ${role} Key Value error: ${error.message}`);
  });

  return client;
}

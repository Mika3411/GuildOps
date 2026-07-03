import { randomUUID } from "node:crypto";
import { env } from "./env.js";
import { cacheJson, getQueueClient } from "./kv.js";

export type WorkerJobType =
  | "event.reminders"
  | "presence.followups"
  | "diplomacy.expire-naps"
  | "sessions.cleanup"
  | "translations.process"
  | "sos.reminders";

export type WorkerJob = {
  id: string;
  type: WorkerJobType;
  payload: Record<string, unknown>;
  enqueuedAt: string;
};

export async function enqueueWorkerJob(
  type: WorkerJobType,
  payload: Record<string, unknown> = {}
): Promise<"redis" | "unavailable"> {
  const client = getQueueClient();

  if (!client) {
    return "unavailable";
  }

  const job: WorkerJob = {
    id: randomUUID(),
    type,
    payload,
    enqueuedAt: new Date().toISOString()
  };

  try {
    await client.rpush(env.WORKER_QUEUE_NAME, JSON.stringify(job));
    await cacheJson(`guildops:worker:last-enqueued:${type}`, job, 86_400);
    return "redis";
  } catch (error) {
    console.warn(`GuildOps queue enqueue skipped: ${error instanceof Error ? error.message : String(error)}`);
    return "unavailable";
  }
}

export async function dequeueWorkerJob(): Promise<WorkerJob | null> {
  const client = getQueueClient();

  if (!client) {
    return null;
  }

  const result = await client.blpop(env.WORKER_QUEUE_NAME, env.WORKER_QUEUE_BLOCK_TIMEOUT_SECONDS);
  const raw = result?.[1];

  if (!raw) {
    return null;
  }

  return parseWorkerJob(raw);
}

export async function enqueueOrRun(
  type: WorkerJobType,
  payload: Record<string, unknown>,
  fallback: () => Promise<unknown>
): Promise<{ mode: "queued" | "ran"; result: unknown }> {
  const queued = await enqueueWorkerJob(type, payload);

  if (queued === "redis") {
    return { mode: "queued", result: { type } };
  }

  return { mode: "ran", result: await fallback() };
}

export function parseWorkerJob(raw: string): WorkerJob {
  const parsed = JSON.parse(raw) as Partial<WorkerJob>;

  if (!parsed.id || !isWorkerJobType(parsed.type) || !parsed.enqueuedAt) {
    throw new Error("Invalid worker job payload");
  }

  return {
    id: String(parsed.id),
    type: parsed.type,
    payload: isRecord(parsed.payload) ? parsed.payload : {},
    enqueuedAt: String(parsed.enqueuedAt)
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWorkerJobType(value: unknown): value is WorkerJobType {
  return (
    value === "event.reminders" ||
    value === "presence.followups" ||
    value === "diplomacy.expire-naps" ||
    value === "sessions.cleanup" ||
    value === "translations.process" ||
    value === "sos.reminders"
  );
}

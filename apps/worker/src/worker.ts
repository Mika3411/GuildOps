import { env } from "./env.js";
import { pool } from "./db.js";
import { closeKv } from "./kv.js";
import { dequeueWorkerJob, type WorkerJob } from "./jobs.js";
import { runEventReminderSweep, runPresenceFollowupSweep } from "./event-tasks.js";
import { expireNapAgreements, cleanupSessions } from "./maintenance-tasks.js";
import { processNextTranslationJob, processTranslationBatch } from "./translation-jobs.js";
import { processDueSosReminderJobs } from "./sos-reminders.js";

let stopping = false;

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log(`Received ${signal}, stopping GuildOps worker`);
    stopping = true;
  });
}

console.log("GuildOps worker started");

while (!stopping) {
  try {
    const job = await dequeueWorkerJob();
    const processedQueuedJob = job ? await dispatchWorkerJob(job) : false;
    const processedTranslation = await processNextTranslationJob();
    const processedSosReminders = await processDueSosReminderJobs();

    if (!processedQueuedJob && !processedTranslation && processedSosReminders === 0) {
      await sleep(Math.min(env.TRANSLATION_POLL_INTERVAL_MS, env.SOS_REMINDER_POLL_INTERVAL_MS));
    }
  } catch (error) {
    console.error("GuildOps worker iteration failed", error);
    await sleep(Math.min(env.TRANSLATION_POLL_INTERVAL_MS, env.SOS_REMINDER_POLL_INTERVAL_MS));
  }
}

await closeKv();
await pool.end();
console.log("GuildOps worker stopped");

async function dispatchWorkerJob(job: WorkerJob): Promise<boolean> {
  console.log(JSON.stringify({ event: "worker.job.started", jobId: job.id, type: job.type }));

  switch (job.type) {
    case "event.reminders":
      await runEventReminderSweep();
      break;
    case "presence.followups":
      await runPresenceFollowupSweep();
      break;
    case "diplomacy.expire-naps":
      await expireNapAgreements();
      break;
    case "sessions.cleanup":
      await cleanupSessions();
      break;
    case "translations.process":
      await processTranslationBatch(readLimit(job.payload.limit, 10));
      break;
    case "sos.reminders":
      await processDueSosReminderJobs();
      break;
  }

  console.log(JSON.stringify({ event: "worker.job.completed", jobId: job.id, type: job.type }));
  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readLimit(value: unknown, fallback: number): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(1, Math.min(100, Math.trunc(parsed)));
}

import { runCron } from "./cron-runner.js";
import { cleanupSessions } from "./maintenance-tasks.js";

await runCron("sessions", async () => ({
  sessionCleanup: await cleanupSessions()
}));

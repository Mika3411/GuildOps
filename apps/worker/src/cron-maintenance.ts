import { runCron } from "./cron-runner.js";
import { expireNapAgreements, cleanupSessions } from "./maintenance-tasks.js";

await runCron("maintenance", async () => ({
  napExpiration: await expireNapAgreements(),
  sessionCleanup: await cleanupSessions()
}));

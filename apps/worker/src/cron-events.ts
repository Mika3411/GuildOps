import { runCron } from "./cron-runner.js";
import { runEventReminderSweep, runPresenceFollowupSweep } from "./event-tasks.js";

await runCron("events", async () => ({
  eventReminders: await runEventReminderSweep(),
  presenceFollowups: await runPresenceFollowupSweep()
}));

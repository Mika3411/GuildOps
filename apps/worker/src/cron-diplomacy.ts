import { runCron } from "./cron-runner.js";
import { expireNapAgreements } from "./maintenance-tasks.js";

await runCron("diplomacy", async () => ({
  napExpiration: await expireNapAgreements()
}));

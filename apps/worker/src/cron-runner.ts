import { pool } from "./db.js";
import { closeKv } from "./kv.js";

export async function runCron(name: string, task: () => Promise<unknown>): Promise<void> {
  const startedAt = Date.now();
  console.log(JSON.stringify({ event: `cron.${name}.started`, startedAt: new Date(startedAt).toISOString() }));

  try {
    const result = await task();
    console.log(
      JSON.stringify({
        event: `cron.${name}.finished`,
        durationMs: Date.now() - startedAt,
        result
      })
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        event: `cron.${name}.failed`,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error)
      })
    );
    process.exitCode = 1;
  } finally {
    await closeKv();
    await pool.end();
  }
}

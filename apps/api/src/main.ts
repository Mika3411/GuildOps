import { env } from "./config/env.js";
import { closePool } from "./db/pool.js";
import { createApp } from "./server.js";

const app = createApp();
const server = app.listen(env.PORT, env.HOST, () => {
  console.log(`GuildOps API listening on ${env.HOST}:${env.PORT}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception", error);
  void shutdown("uncaughtException", 1);
});

async function shutdown(signal: string, exitCode = 0): Promise<void> {
  console.log(`Received ${signal}, shutting down`);

  const forceExit = setTimeout(() => {
    console.error("Forced shutdown after timeout");
    process.exit(1);
  }, 25_000);
  forceExit.unref();

  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });

  await closePool();
  process.exit(exitCode);
}

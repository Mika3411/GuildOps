import { Pool, type PoolClient } from "pg";
import { env } from "./env.js";

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DB_POOL_MAX,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ssl: getSslConfig(env.DATABASE_URL)
});

export async function withClient<T>(handler: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();

  try {
    return await handler(client);
  } finally {
    client.release();
  }
}

function getSslConfig(connectionString: string): false | { rejectUnauthorized: boolean } | undefined {
  const url = new URL(connectionString);
  const sslMode = url.searchParams.get("sslmode") ?? process.env.PGSSLMODE;

  if (!sslMode || sslMode === "disable") {
    return undefined;
  }

  if (sslMode === "require") {
    return { rejectUnauthorized: process.env.PGSSLREJECTUNAUTHORIZED !== "false" };
  }

  if (sslMode === "no-verify") {
    return { rejectUnauthorized: false };
  }

  return { rejectUnauthorized: true };
}

import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { env } from "../config/env.js";
import { ConfigurationError } from "../http/errors.js";

let pool: Pool | undefined;

export type Queryable = {
  query: <T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) => Promise<QueryResult<T>>;
};

export function getPool(): Pool {
  if (!env.DATABASE_URL) {
    throw new ConfigurationError("DATABASE_URL is required for database operations");
  }

  pool ??= new Pool({
    connectionString: env.DATABASE_URL,
    max: env.DB_POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: getSslConfig(env.DATABASE_URL)
  });

  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, params);
}

export const database: Queryable = {
  query
};

export async function withClient<T>(handler: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();

  try {
    return await handler(client);
  } finally {
    client.release();
  }
}

export async function checkDatabase(): Promise<{ serverTime: string }> {
  const result = await query<{ server_time: string }>("SELECT now()::text AS server_time");
  return { serverTime: result.rows[0]?.server_time ?? "" };
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
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

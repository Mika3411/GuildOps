import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PoolClient } from "pg";
import { closePool, withClient } from "./pool.js";

type AppliedMigration = {
  version: string;
  checksum: string;
};

type MigrationFile = {
  version: string;
  name: string;
  filename: string;
  path: string;
  checksum: string;
  sql: string;
};

const migrationsTableSql = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  name text NOT NULL,
  checksum text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
`;

export async function runMigrations(): Promise<void> {
  await withClient(async (client) => {
    await client.query(migrationsTableSql);
    await client.query("SELECT pg_advisory_lock(hashtext($1))", ["guildops_schema_migrations"]);

    try {
      const applied = await getAppliedMigrations(client);
      const migrations = await loadMigrations();

      for (const migration of migrations) {
        const current = applied.get(migration.version);

        if (current) {
          if (current.checksum !== migration.checksum) {
            throw new Error(
              `Migration ${migration.filename} checksum mismatch. Applied ${current.checksum}, found ${migration.checksum}.`
            );
          }

          console.log(`Skipping migration ${migration.filename}`);
          continue;
        }

        console.log(`Applying migration ${migration.filename}`);
        await applyMigration(client, migration);
      }
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", ["guildops_schema_migrations"]);
    }
  });
}

async function getAppliedMigrations(client: PoolClient): Promise<Map<string, AppliedMigration>> {
  const result = await client.query<AppliedMigration>("SELECT version, checksum FROM schema_migrations");
  return new Map(result.rows.map((row) => [row.version, row]));
}

async function loadMigrations(): Promise<MigrationFile[]> {
  const migrationsDir = path.join(process.cwd(), "db", "migrations");
  const filenames = (await readdir(migrationsDir))
    .filter((filename) => /^\d+_.+\.sql$/.test(filename))
    .sort((a, b) => a.localeCompare(b));

  return Promise.all(
    filenames.map(async (filename) => {
      const fullPath = path.join(migrationsDir, filename);
      const sql = await readFile(fullPath, "utf8");
      const [version = "", ...nameParts] = filename.replace(/\.sql$/, "").split("_");

      return {
        version,
        name: nameParts.join("_"),
        filename,
        path: fullPath,
        checksum: createHash("sha256").update(sql).digest("hex"),
        sql
      };
    })
  );
}

async function applyMigration(client: PoolClient, migration: MigrationFile): Promise<void> {
  if (hasExplicitTransaction(migration.sql)) {
    await client.query(migration.sql);
    await client.query("INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)", [
      migration.version,
      migration.name,
      migration.checksum
    ]);
    return;
  }

  await client.query("BEGIN");

  try {
    await client.query(migration.sql);
    await client.query("INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)", [
      migration.version,
      migration.name,
      migration.checksum
    ]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

function hasExplicitTransaction(sql: string): boolean {
  return /^\s*(?:--.*(?:\r?\n|$)\s*)*BEGIN;/i.test(sql);
}

const isEntrypoint = process.argv[1]
  ? fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
  : false;

if (isEntrypoint) {
  runMigrations()
    .then(async () => {
      console.log("Database migrations complete");
      await closePool();
    })
    .catch(async (error) => {
      console.error(error);
      await closePool();
      process.exit(1);
    });
}

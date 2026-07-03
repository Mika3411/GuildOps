import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

process.env.DATABASE_URL ??= "postgres://localhost/guildops_translation_test";
process.env.NODE_ENV = "test";
process.env.TRANSLATION_PROVIDER = "provider-api";
process.env.TRANSLATION_API_URL = "https://translation-provider.test/translate";
process.env.TRANSLATION_API_KEY = "test-key";
process.env.TRANSLATION_API_TIMEOUT_MS = "1000";

const { claimNextTranslationWorkWithClient } = await import("./translation-jobs.js");
const { translateText } = await import("./translator.js");

test("translation job claim commits before provider work can run", async () => {
  const db = await createTranslationDb();
  const queries: string[] = [];

  try {
    await db.exec(`
      INSERT INTO public_chat_messages (id, body, source_language)
      VALUES ('message-1', 'Bonjour', 'fr');

      INSERT INTO translation_jobs (
        id,
        source_table,
        source_id,
        source_language,
        target_language
      )
      VALUES ('job-1', 'public_chat_messages', 'message-1', 'fr', 'en');
    `);

    const claim = await claimNextTranslationWorkWithClient(recordingClient(db, queries) as never);

    assert.equal(claim.status, "claimed");
    assert.equal(queries[0], "BEGIN");
    assert.equal(queries.at(-1), "COMMIT");

    const job = await db.query<{ status: string; locked: boolean; attempts: number }>(
      "SELECT status, locked_at IS NOT NULL AS locked, attempts FROM translation_jobs WHERE id = 'job-1'"
    );

    assert.deepEqual(job.rows[0], { status: "processing", locked: true, attempts: 1 });
  } finally {
    await db.close();
  }
});

test("translation provider calls are aborted when they exceed the configured timeout", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((_url, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    })) as typeof fetch;

  try {
    await assert.rejects(
      translateText({
        sourceLanguage: "fr",
        targetLanguage: "en",
        text: "Bonjour"
      }),
      /Translation provider timed out after 1000ms/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

async function createTranslationDb(): Promise<PGlite> {
  const db = new PGlite();

  await db.exec(`
    CREATE TABLE translation_jobs (
      id text PRIMARY KEY,
      source_table text NOT NULL,
      source_id text NOT NULL,
      source_language varchar(12) NOT NULL DEFAULT 'auto',
      target_language varchar(12) NOT NULL,
      status text NOT NULL DEFAULT 'queued',
      provider text,
      attempts int NOT NULL DEFAULT 0,
      max_attempts int NOT NULL DEFAULT 5,
      locked_at timestamptz,
      next_attempt_at timestamptz NOT NULL DEFAULT now(),
      last_error text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz
    );

    CREATE TABLE public_chat_messages (
      id text PRIMARY KEY,
      body text NOT NULL,
      source_language varchar(12) NOT NULL DEFAULT 'auto'
    );
  `);

  return db;
}

function recordingClient(db: PGlite, queries: string[]) {
  return {
    async query(text: string, params?: unknown[]) {
      queries.push(text.trim().split(/\s+/).slice(0, 2).join(" "));
      return db.query(text, params as never[]);
    }
  };
}

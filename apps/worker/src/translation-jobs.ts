import type { PoolClient } from "pg";
import { withClient } from "./db.js";
import { env } from "./env.js";
import { cacheJson } from "./kv.js";
import { translateText, type TranslationResult } from "./translator.js";

type TranslationSqlClient = Pick<PoolClient, "query">;

type TranslationJob = {
  id: string;
  source_table: string;
  source_id: string;
  source_language: string;
  target_language: string;
};

type SourceMessage = {
  text: string;
  source_language: string;
};

type TranslationClaim =
  | { status: "empty" }
  | { status: "failed" }
  | { status: "claimed"; job: TranslationJob; source: SourceMessage };

const sourceQueries: Record<string, string> = {
  private_messages: "SELECT body AS text, source_language FROM private_messages WHERE id = $1",
  public_chat_messages: "SELECT body AS text, source_language FROM public_chat_messages WHERE id = $1",
  forum_posts: "SELECT body AS text, 'auto'::varchar(12) AS source_language FROM forum_posts WHERE id = $1",
  alerts: "SELECT message AS text, 'auto'::varchar(12) AS source_language FROM alerts WHERE id = $1"
};

export async function processTranslationBatch(limit = 10): Promise<{ processed: number }> {
  let processed = 0;

  for (let index = 0; index < limit; index += 1) {
    const didProcess = await processNextTranslationJob();

    if (!didProcess) {
      break;
    }

    processed += 1;
  }

  if (processed > 0) {
    await cacheJson("guildops:worker:last-translation-batch", {
      processed,
      finishedAt: new Date().toISOString()
    });
  }

  return { processed };
}

export async function processNextTranslationJob(): Promise<boolean> {
  const claim = await claimNextTranslationWork();

  if (claim.status === "empty") {
    return false;
  }

  if (claim.status === "failed") {
    return true;
  }

  let translation: TranslationResult;

  try {
    translation = await translateText({
      sourceLanguage: claim.source.source_language || claim.job.source_language,
      targetLanguage: claim.job.target_language,
      text: claim.source.text
    });
  } catch (error) {
    await markCurrentJobFailure(claim.job.id, error);
    return true;
  }

  await completeJob(claim.job, claim.source, translation);
  return true;
}

async function claimNextTranslationWork(): Promise<TranslationClaim> {
  return withClient((client) => claimNextTranslationWorkWithClient(client));
}

export async function claimNextTranslationWorkWithClient(client: TranslationSqlClient): Promise<TranslationClaim> {
  await client.query("BEGIN");

  try {
    await releaseExpiredProcessingJobs(client);
    const job = await claimNextJob(client);

    if (!job) {
      await client.query("COMMIT");
      return { status: "empty" };
    }

    const source = await loadSource(client, job);

    if (!source) {
      await failJob(client, job.id, "Source message not found");
      await client.query("COMMIT");
      return { status: "failed" };
    }

    await client.query("COMMIT");
    return { status: "claimed", job, source };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function completeJob(job: TranslationJob, source: SourceMessage, translation: TranslationResult): Promise<void> {
  await withClient(async (client) => {
    await client.query("BEGIN");

    try {
      const updatedJob = await client.query(
        `
          UPDATE translation_jobs
          SET status = 'completed',
              provider = $2,
              completed_at = now(),
              last_error = NULL,
              locked_at = NULL
          WHERE id = $1
            AND status = 'processing'
          RETURNING id::text
        `,
        [job.id, translation.provider]
      );

      if (!updatedJob.rows[0]) {
        await client.query("COMMIT");
        return;
      }

      await client.query(
        `
          INSERT INTO translations (
            source_table,
            source_id,
            source_language,
            target_language,
            translated_text,
            provider,
            provider_request_hash
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (source_table, source_id, target_language)
          DO UPDATE SET
            source_language = EXCLUDED.source_language,
            translated_text = EXCLUDED.translated_text,
            provider = EXCLUDED.provider,
            provider_request_hash = EXCLUDED.provider_request_hash,
            created_at = now()
        `,
        [
          job.source_table,
          job.source_id,
          source.source_language || job.source_language,
          job.target_language,
          translation.text,
          translation.provider,
          translation.providerRequestHash
        ]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

async function releaseExpiredProcessingJobs(client: TranslationSqlClient): Promise<void> {
  const expiredProcessingJobAgeMs = Math.max(env.TRANSLATION_API_TIMEOUT_MS * 4, 60_000);

  await client.query(
    `
      UPDATE translation_jobs
      SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'queued' END,
          next_attempt_at = now(),
          locked_at = NULL,
          last_error = 'Translation job lock expired before completion'
      WHERE status = 'processing'
        AND (
          locked_at IS NULL
          OR locked_at < now() - ($1::int * interval '1 millisecond')
        )
    `,
    [expiredProcessingJobAgeMs]
  );
}

async function claimNextJob(client: TranslationSqlClient): Promise<TranslationJob | null> {
  const result = await client.query<TranslationJob>(
    `
      WITH next_job AS (
        SELECT id
        FROM translation_jobs
        WHERE status IN ('queued', 'failed')
          AND attempts < max_attempts
          AND next_attempt_at <= now()
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE translation_jobs
      SET status = 'processing',
          attempts = attempts + 1,
          locked_at = now(),
          updated_at = now()
      WHERE id = (SELECT id FROM next_job)
      RETURNING
        id::text,
        source_table,
        source_id::text,
        source_language,
        target_language
    `
  );

  return result.rows[0] ?? null;
}

async function loadSource(client: TranslationSqlClient, job: TranslationJob): Promise<SourceMessage | null> {
  const sql = sourceQueries[job.source_table];

  if (!sql) {
    throw new Error(`Unsupported source table ${job.source_table}`);
  }

  const result = await client.query<SourceMessage>(sql, [job.source_id]);
  return result.rows[0] ?? null;
}

async function failJob(client: TranslationSqlClient, jobId: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);

  await client.query(
    `
      UPDATE translation_jobs
      SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'queued' END,
          next_attempt_at = now() + (attempts * interval '30 seconds'),
          locked_at = NULL,
          last_error = $2
      WHERE id = $1
        AND status = 'processing'
    `,
    [jobId, message.slice(0, 2000)]
  );
}

export async function markCurrentJobFailure(jobId: string, error: unknown): Promise<void> {
  await withClient((client) => failJob(client, jobId, error));
}

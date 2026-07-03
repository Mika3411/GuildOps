import type { Queryable } from "../db/pool.js";

export type TranslatableSourceTable =
  | "private_messages"
  | "public_chat_messages"
  | "forum_posts"
  | "alerts";

export type MessageTranslationStatus = "original" | "cached" | "queued";

export type MessageRow = {
  id: string;
  body: string;
  source_language: string;
  created_at: string;
  author?: string | null;
  metadata?: Record<string, unknown>;
};

type TranslationRow = {
  translated_text: string;
  provider: string;
  created_at: string;
};

export function normalizeLanguage(value: string | null | undefined, fallback = "fr"): string {
  const normalized = String(value || fallback)
    .trim()
    .replace("_", "-")
    .toLowerCase();

  return /^[a-z]{2,3}(?:-[a-z]{2})?$/.test(normalized) ? normalized : fallback;
}

export function toLanguageLabel(language: string): string {
  return normalizeLanguage(language).toUpperCase();
}

export async function formatMessageForLanguage(
  db: Queryable,
  input: {
    sourceTable: TranslatableSourceTable;
    message: MessageRow;
    targetLanguage: string;
  }
) {
  const sourceLanguage = normalizeLanguage(input.message.source_language, "auto");
  const targetLanguage = normalizeLanguage(input.targetLanguage);
  const original = {
    text: input.message.body,
    language: sourceLanguage
  };

  if (sourceLanguage !== "auto" && sourceLanguage === targetLanguage) {
    return buildMessagePayload(input, original, {
      text: input.message.body,
      language: targetLanguage,
      status: "original",
      provider: null
    });
  }

  const translation = await findTranslation(db, input.sourceTable, input.message.id, targetLanguage);

  if (translation) {
    return buildMessagePayload(input, original, {
      text: translation.translated_text,
      language: targetLanguage,
      status: "cached",
      provider: translation.provider
    });
  }

  await enqueueTranslationJob(db, {
    sourceTable: input.sourceTable,
    sourceId: input.message.id,
    sourceLanguage,
    targetLanguage
  });

  return buildMessagePayload(input, original, {
    text: null,
    language: targetLanguage,
    status: "queued",
    provider: null
  });
}

export async function enqueueTranslationJob(
  db: Queryable,
  input: {
    sourceTable: TranslatableSourceTable;
    sourceId: string;
    sourceLanguage: string;
    targetLanguage: string;
  }
): Promise<void> {
  await db.query(
    `
      INSERT INTO translation_jobs (
        source_table,
        source_id,
        source_language,
        target_language,
        status,
        next_attempt_at
      )
      VALUES ($1, $2, $3, $4, 'queued', now())
      ON CONFLICT (source_table, source_id, target_language)
      DO UPDATE SET
        status = CASE
          WHEN translation_jobs.status IN ('failed', 'cancelled') THEN 'queued'
          ELSE translation_jobs.status
        END,
        source_language = EXCLUDED.source_language,
        next_attempt_at = CASE
          WHEN translation_jobs.status IN ('failed', 'cancelled') THEN now()
          ELSE translation_jobs.next_attempt_at
        END,
        updated_at = now()
    `,
    [
      input.sourceTable,
      input.sourceId,
      normalizeLanguage(input.sourceLanguage, "auto"),
      normalizeLanguage(input.targetLanguage)
    ]
  );
}

async function findTranslation(
  db: Queryable,
  sourceTable: TranslatableSourceTable,
  sourceId: string,
  targetLanguage: string
): Promise<TranslationRow | null> {
  const result = await db.query<TranslationRow>(
    `
      SELECT translated_text, provider, created_at::text
      FROM translations
      WHERE source_table = $1
        AND source_id = $2
        AND target_language = $3
      LIMIT 1
    `,
    [sourceTable, sourceId, normalizeLanguage(targetLanguage)]
  );

  return result.rows[0] ?? null;
}

function buildMessagePayload(
  input: {
    sourceTable: TranslatableSourceTable;
    message: MessageRow;
    targetLanguage: string;
  },
  original: { text: string; language: string },
  translated: {
    text: string | null;
    language: string;
    status: MessageTranslationStatus;
    provider: string | null;
  }
) {
  return {
    id: input.message.id,
    sourceTable: input.sourceTable,
    author: input.message.author ?? null,
    createdAt: input.message.created_at,
    metadata: input.message.metadata ?? {},
    original,
    translated: {
      ...translated,
      available: translated.text !== null
    },
    sourceLanguage: original.language,
    targetLanguage: translated.language,
    displayText: translated.text ?? original.text
  };
}

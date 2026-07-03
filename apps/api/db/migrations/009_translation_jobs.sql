-- Translation job queue for async message translation workers.

BEGIN;

CREATE TABLE IF NOT EXISTS translation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table text NOT NULL
    CHECK (source_table IN ('private_messages', 'public_chat_messages', 'forum_posts', 'alerts', 'recruitment_posts')),
  source_id uuid NOT NULL,
  source_language varchar(12) NOT NULL DEFAULT 'auto',
  target_language varchar(12) NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  provider text,
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 5,
  locked_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (source_table, source_id, target_language)
);

CREATE INDEX IF NOT EXISTS idx_translation_jobs_queue
ON translation_jobs(status, next_attempt_at, created_at)
WHERE status IN ('queued', 'failed');

DROP TRIGGER IF EXISTS translation_jobs_set_updated_at ON translation_jobs;
CREATE TRIGGER translation_jobs_set_updated_at
BEFORE UPDATE ON translation_jobs
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;

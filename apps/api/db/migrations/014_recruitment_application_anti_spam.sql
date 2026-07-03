-- Public recruitment application anti-spam metadata and rate-limit index.

BEGIN;

ALTER TABLE recruitment_applications
ADD COLUMN IF NOT EXISTS guest_fingerprint_hash text,
ADD COLUMN IF NOT EXISTS moderation_status text NOT NULL DEFAULT 'visible',
ADD COLUMN IF NOT EXISTS moderation_flags jsonb NOT NULL DEFAULT '[]',
ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'recruitment_applications_moderation_status_check'
  ) THEN
    ALTER TABLE recruitment_applications
    ADD CONSTRAINT recruitment_applications_moderation_status_check
    CHECK (moderation_status IN ('visible', 'flagged', 'hidden', 'deleted'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_recruitment_applications_guest_rate
ON recruitment_applications(guild_id, guest_fingerprint_hash, created_at DESC)
WHERE guest_fingerprint_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_recruitment_applications_moderation
ON recruitment_applications(guild_id, moderation_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_recruitment_applications_expires
ON recruitment_applications(expires_at)
WHERE status = 'pending';

COMMIT;

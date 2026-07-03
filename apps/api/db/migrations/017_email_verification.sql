-- Email verification tokens for signup and login gating.

BEGIN;

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user_pending
ON email_verification_tokens(user_id, created_at DESC)
WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_expires
ON email_verification_tokens(expires_at)
WHERE consumed_at IS NULL;

UPDATE users
SET email_verified_at = COALESCE(email_verified_at, created_at, now())
WHERE email_verified_at IS NULL
  AND disabled_at IS NULL;

COMMIT;

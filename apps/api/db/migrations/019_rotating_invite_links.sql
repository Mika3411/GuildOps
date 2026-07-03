-- Rotating invite links: one active token per guild site.

BEGIN;

ALTER TABLE guild_sites
  ADD COLUMN IF NOT EXISTS invite_token text,
  ADD COLUMN IF NOT EXISTS invite_rotated_at timestamptz,
  ADD COLUMN IF NOT EXISTS invite_rotated_by uuid REFERENCES users(id) ON DELETE SET NULL;

UPDATE guild_sites
SET invite_token = encode(gen_random_bytes(18), 'hex')
WHERE invite_token IS NULL
   OR invite_token = ''
   OR invite_token = 'active';

UPDATE guild_sites
SET invite_rotated_at = COALESCE(invite_rotated_at, updated_at, published_at, created_at, now())
WHERE invite_rotated_at IS NULL;

ALTER TABLE guild_sites
  ALTER COLUMN invite_token SET DEFAULT encode(gen_random_bytes(18), 'hex'),
  ALTER COLUMN invite_token SET NOT NULL,
  ALTER COLUMN invite_rotated_at SET DEFAULT now(),
  ALTER COLUMN invite_rotated_at SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_guild_sites_invite_token
ON guild_sites(invite_token);

CREATE INDEX IF NOT EXISTS idx_guild_sites_published_invite
ON guild_sites(public_slug, invite_token)
WHERE status = 'published';

COMMIT;

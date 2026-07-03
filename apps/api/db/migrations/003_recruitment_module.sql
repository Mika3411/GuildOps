-- Recruitment posts and public applications module.

BEGIN;

ALTER TABLE recruitment_posts
ADD COLUMN IF NOT EXISTS game_name text,
ADD COLUMN IF NOT EXISTS server_realm text,
ADD COLUMN IF NOT EXISTS play_style text;

CREATE TABLE IF NOT EXISTS recruitment_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id uuid NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  recruitment_post_id uuid REFERENCES recruitment_posts(id) ON DELETE SET NULL,
  candidate_name text NOT NULL,
  contact text NOT NULL,
  language varchar(12) NOT NULL DEFAULT 'fr',
  game_name text,
  server_realm text,
  play_style text,
  power_label text,
  availability text,
  message text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'refused')),
  decided_by uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recruitment_applications_guild_status
ON recruitment_applications(guild_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_recruitment_applications_post
ON recruitment_applications(recruitment_post_id, created_at DESC);

DROP TRIGGER IF EXISTS recruitment_applications_set_updated_at ON recruitment_applications;
CREATE TRIGGER recruitment_applications_set_updated_at
BEFORE UPDATE ON recruitment_applications
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;

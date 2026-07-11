-- Per-thread public/member visibility for the guild forum.

BEGIN;

ALTER TABLE forum_threads
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'members'
    CHECK (visibility IN ('public', 'members'));

UPDATE forum_threads ft
SET visibility = 'public'
FROM forum_categories fc
WHERE fc.id = ft.category_id
  AND fc.visibility = 'public'
  AND ft.visibility = 'members';

CREATE INDEX IF NOT EXISTS idx_forum_threads_public_visibility
ON forum_threads(category_id, visibility, pinned_at DESC NULLS LAST, (COALESCE(last_post_at, created_at)) DESC);

CREATE TABLE IF NOT EXISTS forum_member_mutes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id uuid NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  muted_member_id uuid NOT NULL REFERENCES guild_members(id) ON DELETE CASCADE,
  muted_by_member_id uuid REFERENCES guild_members(id) ON DELETE SET NULL,
  reason text,
  muted_at timestamptz NOT NULL DEFAULT now(),
  lifted_at timestamptz,
  lifted_by_member_id uuid REFERENCES guild_members(id) ON DELETE SET NULL,
  lift_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_forum_member_mutes_active
ON forum_member_mutes(guild_id, muted_member_id)
WHERE lifted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_forum_member_mutes_member
ON forum_member_mutes(muted_member_id, lifted_at);

DROP TRIGGER IF EXISTS forum_member_mutes_set_updated_at ON forum_member_mutes;

CREATE TRIGGER forum_member_mutes_set_updated_at
BEFORE UPDATE ON forum_member_mutes
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;

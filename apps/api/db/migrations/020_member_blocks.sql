-- Member bans and active join/request blocks.

BEGIN;

CREATE TABLE IF NOT EXISTS guild_member_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id uuid NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  nickname text NOT NULL,
  normalized_nickname citext NOT NULL,
  reason text NOT NULL DEFAULT '',
  blocked_by uuid REFERENCES users(id) ON DELETE SET NULL,
  blocked_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  lifted_at timestamptz,
  lifted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  lift_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR length(trim(normalized_nickname::text)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_guild_member_blocks_guild_active
ON guild_member_blocks(guild_id, blocked_at DESC)
WHERE lifted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_guild_member_blocks_active_user
ON guild_member_blocks(guild_id, user_id)
WHERE user_id IS NOT NULL
  AND lifted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_guild_member_blocks_active_nickname
ON guild_member_blocks(guild_id, normalized_nickname)
WHERE lifted_at IS NULL;

DROP TRIGGER IF EXISTS guild_member_blocks_set_updated_at ON guild_member_blocks;
CREATE TRIGGER guild_member_blocks_set_updated_at
BEFORE UPDATE ON guild_member_blocks
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;

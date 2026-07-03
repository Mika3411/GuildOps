-- Cookie session hardening and active organization/guild context.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS global_role text NOT NULL DEFAULT 'user'
    CHECK (global_role IN ('user', 'support', 'admin'));

ALTER TABLE user_sessions
  ADD COLUMN IF NOT EXISTS active_organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS active_guild_id uuid REFERENCES guilds(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS refreshed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_user_sessions_active_context
ON user_sessions(user_id, active_organization_id, active_guild_id)
WHERE revoked_at IS NULL;

COMMIT;

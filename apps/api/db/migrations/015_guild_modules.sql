-- Guild-level feature module state.

BEGIN;

CREATE TABLE IF NOT EXISTS guild_modules (
  guild_id uuid NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  module_key text NOT NULL
    CHECK (module_key IN (
      'site',
      'recruitment',
      'wars_events',
      'sos_attack',
      'bank',
      'diplomacy',
      'forum',
      'messages',
      'translation',
      'multi_guilds'
    )),
  status text NOT NULL DEFAULT 'disabled'
    CHECK (status IN ('enabled', 'disabled')),
  config_json jsonb NOT NULL DEFAULT '{}',
  enabled_at timestamptz,
  disabled_at timestamptz,
  enabled_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, module_key)
);

CREATE INDEX IF NOT EXISTS idx_guild_modules_active
ON guild_modules(guild_id, module_key)
WHERE status = 'enabled';

DROP TRIGGER IF EXISTS guild_modules_set_updated_at ON guild_modules;
CREATE TRIGGER guild_modules_set_updated_at
BEFORE UPDATE ON guild_modules
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO guild_modules (
  guild_id,
  module_key,
  status,
  config_json,
  enabled_at,
  disabled_at,
  enabled_by,
  created_at,
  updated_at
)
SELECT
  g.id,
  visible_modules.module_key,
  'enabled',
  '{}'::jsonb,
  COALESCE(g.created_at, now()),
  NULL,
  g.created_by,
  now(),
  now()
FROM guilds g
CROSS JOIN (VALUES
  ('site'),
  ('recruitment'),
  ('multi_guilds')
) AS visible_modules(module_key)
WHERE g.deleted_at IS NULL
ON CONFLICT (guild_id, module_key) DO UPDATE
SET status = 'enabled',
    enabled_at = COALESCE(guild_modules.enabled_at, EXCLUDED.enabled_at, now()),
    disabled_at = NULL,
    enabled_by = COALESCE(guild_modules.enabled_by, EXCLUDED.enabled_by),
    updated_at = now();

COMMIT;

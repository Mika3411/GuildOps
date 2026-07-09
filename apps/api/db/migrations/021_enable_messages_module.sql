-- Make the internal messaging space visible by default for existing guilds.

BEGIN;

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
  'messages',
  'enabled',
  '{}'::jsonb,
  now(),
  NULL,
  g.created_by,
  now(),
  now()
FROM guilds g
WHERE g.deleted_at IS NULL
ON CONFLICT (guild_id, module_key) DO UPDATE
SET status = 'enabled',
    enabled_at = COALESCE(guild_modules.enabled_at, EXCLUDED.enabled_at, now()),
    disabled_at = NULL,
    enabled_by = COALESCE(guild_modules.enabled_by, EXCLUDED.enabled_by),
    updated_at = now();

COMMIT;

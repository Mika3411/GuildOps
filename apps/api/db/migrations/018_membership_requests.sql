-- Pending membership requests for users who do not use an active invite link.

BEGIN;

INSERT INTO permissions (key, module, description)
VALUES
  ('approve_members', 'members', 'Approve or refuse pending guild membership requests.')
ON CONFLICT (key) DO UPDATE
SET module = EXCLUDED.module,
    description = EXCLUDED.description;

INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM roles
JOIN permissions ON permissions.key::text = 'approve_members'
WHERE roles.code::text IN ('officier', 'admin')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS membership_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id uuid NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nickname text NOT NULL,
  message text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'public'
    CHECK (source IN ('public', 'manual')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'refused', 'cancelled')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_membership_requests_guild_status
ON membership_requests(guild_id, status, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_membership_requests_pending
ON membership_requests(guild_id, requested_at DESC)
WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_requests_pending_user
ON membership_requests(guild_id, user_id)
WHERE status = 'pending';

DROP TRIGGER IF EXISTS membership_requests_set_updated_at ON membership_requests;
CREATE TRIGGER membership_requests_set_updated_at
BEFORE UPDATE ON membership_requests
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DO $$
DECLARE
  constraint_name text;
BEGIN
  IF to_regclass('guild_modules') IS NOT NULL THEN
    FOR constraint_name IN
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = 'guild_modules'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%module_key%'
    LOOP
      EXECUTE format('ALTER TABLE guild_modules DROP CONSTRAINT %I', constraint_name);
    END LOOP;

    ALTER TABLE guild_modules
      ADD CONSTRAINT guild_modules_module_key_check
      CHECK (module_key IN (
        'site',
        'membership_requests',
        'wars_events',
        'sos_attack',
        'bank',
        'diplomacy',
        'forum',
        'messages',
        'translation',
        'multi_guilds'
      ));
  END IF;
END $$;

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
  'membership_requests',
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

CREATE OR REPLACE FUNCTION seed_guildops_default_roles(
  target_organization_id uuid,
  target_guild_id uuid DEFAULT NULL
)
RETURNS void AS $seed$
DECLARE
  role_seed record;
  target_role_id uuid;
BEGIN
  IF target_organization_id IS NULL THEN
    RAISE EXCEPTION 'target_organization_id is required';
  END IF;

  FOR role_seed IN
    SELECT *
    FROM (VALUES
      ('membre', 'Membre', 10, ARRAY['send_sos']),
      ('officier', 'Officier', 40, ARRAY['approve_members', 'manage_events', 'send_sos', 'moderate_forum', 'manage_members']),
      ('diplomate', 'Diplomate', 30, ARRAY['send_sos', 'manage_diplomacy']),
      ('banquier', 'Banquier', 30, ARRAY['send_sos', 'manage_bank']),
      ('admin', 'Admin', 100, ARRAY[
        'manage_site',
        'approve_members',
        'manage_events',
        'send_sos',
        'manage_diplomacy',
        'manage_bank',
        'moderate_forum',
        'manage_members',
        'manage_roles',
        'admin_all'
      ])
    ) AS seed(code, name, rank, permission_keys)
  LOOP
    SELECT id
    INTO target_role_id
    FROM roles
    WHERE organization_id = target_organization_id
      AND code::text = role_seed.code
      AND (
        guild_id = target_guild_id
        OR (guild_id IS NULL AND target_guild_id IS NULL)
      )
    LIMIT 1;

    IF target_role_id IS NULL THEN
      INSERT INTO roles (organization_id, guild_id, code, name, rank, is_system)
      VALUES (target_organization_id, target_guild_id, role_seed.code, role_seed.name, role_seed.rank, true)
      RETURNING id INTO target_role_id;
    ELSE
      UPDATE roles
      SET name = role_seed.name,
          rank = role_seed.rank,
          is_system = true
      WHERE id = target_role_id;
    END IF;

    INSERT INTO role_permissions (role_id, permission_id)
    SELECT target_role_id, permissions.id
    FROM permissions
    WHERE permissions.key::text = ANY(role_seed.permission_keys)
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$seed$ LANGUAGE plpgsql;

COMMIT;

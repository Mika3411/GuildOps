-- Restrict SOS usage to roles that explicitly carry send_sos.

BEGIN;

DELETE FROM role_permissions rp
USING roles r, permissions p
WHERE rp.role_id = r.id
  AND rp.permission_id = p.id
  AND p.key::text = 'send_sos'
  AND r.code::text = 'membre';

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
      ('membre', 'Membre', 10, ARRAY[]::text[]),
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

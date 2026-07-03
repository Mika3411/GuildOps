-- GuildOps RBAC baseline permissions and default role seeding helper.

BEGIN;

INSERT INTO permissions (key, module, description)
VALUES
  ('manage_site', 'site', 'Manage the public guild site and publishing settings.'),
  ('manage_recruitment', 'recruitment', 'Manage recruitment pages, posts, and applications.'),
  ('manage_events', 'events', 'Manage events, attendance, assignments, and war objectives.'),
  ('send_sos', 'alerts', 'Send SOS attack alerts to guild members.'),
  ('manage_diplomacy', 'diplomacy', 'Manage allies, enemies, NAP agreements, and coordinates.'),
  ('manage_bank', 'bank', 'Manage guild bank resources, requests, commands, and history.'),
  ('moderate_forum', 'forum', 'Moderate forum categories, threads, posts, and public chat.'),
  ('manage_members', 'members', 'Manage members, objectives, invitations, and guild roster data.'),
  ('manage_roles', 'roles', 'Assign roles and update role permissions.'),
  ('admin_all', 'admin', 'Bypass permission checks for guild administration.')
ON CONFLICT (key) DO UPDATE
SET module = EXCLUDED.module,
    description = EXCLUDED.description;

CREATE OR REPLACE FUNCTION seed_guildops_default_roles(
  target_organization_id uuid,
  target_guild_id uuid DEFAULT NULL
)
RETURNS void AS $$
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
      ('officier', 'Officier', 40, ARRAY['manage_events', 'send_sos', 'moderate_forum', 'manage_members']),
      ('diplomate', 'Diplomate', 30, ARRAY['send_sos', 'manage_diplomacy']),
      ('banquier', 'Banquier', 30, ARRAY['send_sos', 'manage_bank']),
      ('recruteur', 'Recruteur', 30, ARRAY['manage_site', 'manage_recruitment']),
      ('admin', 'Admin', 100, ARRAY[
        'manage_site',
        'manage_recruitment',
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
$$ LANGUAGE plpgsql;

COMMIT;

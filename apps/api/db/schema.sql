-- GuildOps PostgreSQL schema for Render Managed PostgreSQL.
-- The Node.js API owns authentication, session handling, authorization, and realtime fanout.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name text NOT NULL,
  preferred_language varchar(12) NOT NULL DEFAULT 'fr',
  global_role text NOT NULL DEFAULT 'user'
    CHECK (global_role IN ('user', 'support', 'admin')),
  avatar_url text,
  email_verified_at timestamptz,
  last_login_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE email_verification_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_hash text NOT NULL UNIQUE,
  csrf_hash text,
  ip_address inet,
  user_agent text,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  refreshed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE auth_rate_limits (
  scope text NOT NULL
    CHECK (scope IN ('login', 'register')),
  bucket text NOT NULL
    CHECK (bucket IN ('ip', 'email', 'ip_email')),
  bucket_hash text NOT NULL,
  attempts int NOT NULL DEFAULT 0
    CHECK (attempts >= 0),
  failures int NOT NULL DEFAULT 0
    CHECK (failures >= 0),
  window_started_at timestamptz NOT NULL DEFAULT now(),
  blocked_until timestamptz,
  last_attempt_at timestamptz,
  last_failure_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, bucket, bucket_hash)
);

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name text NOT NULL,
  slug citext NOT NULL UNIQUE,
  plan_code text NOT NULL DEFAULT 'mvp',
  billing_email citext,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organization_members (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_role text NOT NULL DEFAULT 'member'
    CHECK (organization_role IN ('owner', 'admin', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

CREATE TABLE games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  slug citext NOT NULL UNIQUE,
  publisher text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE servers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text,
  region text,
  timezone text NOT NULL DEFAULT 'UTC',
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, code)
);

CREATE TABLE guilds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE RESTRICT,
  server_id uuid REFERENCES servers(id) ON DELETE SET NULL,
  name text NOT NULL,
  tag text,
  slug citext NOT NULL UNIQUE,
  default_language varchar(12) NOT NULL DEFAULT 'fr',
  play_style text,
  description text,
  logo_url text,
  is_public boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (organization_id, name)
);

CREATE TABLE guild_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id uuid NOT NULL UNIQUE REFERENCES guilds(id) ON DELETE CASCADE,
  public_slug citext NOT NULL UNIQUE,
  title text NOT NULL,
  guild_name text NOT NULL DEFAULT '',
  game text NOT NULL DEFAULT '',
  realm text NOT NULL DEFAULT '',
  tagline text NOT NULL DEFAULT '',
  objective text NOT NULL DEFAULT '',
  theme text NOT NULL DEFAULT 'camp-nord',
  colors_json jsonb NOT NULL DEFAULT '{}',
  typography_json jsonb NOT NULL DEFAULT '{}',
  sections_json jsonb NOT NULL DEFAULT '{}',
  hero_text text,
  invite_token text NOT NULL DEFAULT encode(gen_random_bytes(18), 'hex'),
  invite_rotated_at timestamptz NOT NULL DEFAULT now(),
  invite_rotated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  theme_json jsonb NOT NULL DEFAULT '{}',
  pages_json jsonb NOT NULL DEFAULT '{}',
  seo_json jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE guild_modules (
  guild_id uuid NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  module_key text NOT NULL
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

CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  guild_id uuid REFERENCES guilds(id) ON DELETE CASCADE,
  code citext NOT NULL,
  name text NOT NULL,
  rank int NOT NULL DEFAULT 0,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, guild_id, code)
);

CREATE TABLE permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key citext NOT NULL UNIQUE,
  module text NOT NULL,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE role_permissions (
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE guild_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id uuid NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  invited_by uuid REFERENCES users(id) ON DELETE SET NULL,
  nickname text NOT NULL,
  external_game_id text,
  power_score bigint,
  language varchar(12),
  timezone text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('invited', 'active', 'inactive', 'banned', 'left')),
  joined_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (guild_id, user_id),
  UNIQUE (guild_id, nickname)
);

CREATE TABLE membership_requests (
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

CREATE TABLE guild_member_blocks (
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

CREATE TABLE guild_member_roles (
  guild_member_id uuid NOT NULL REFERENCES guild_members(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES users(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_member_id, role_id)
);

INSERT INTO permissions (key, module, description)
VALUES
  ('manage_site', 'site', 'Manage the public guild site and publishing settings.'),
  ('approve_members', 'members', 'Approve or refuse pending guild membership requests.'),
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
$$ LANGUAGE plpgsql;

CREATE TABLE events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id uuid NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  server_id uuid REFERENCES servers(id) ON DELETE SET NULL,
  title text NOT NULL,
  event_type text NOT NULL,
  description text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  location_label text,
  location_x int,
  location_y int,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE event_attendance (
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  guild_member_id uuid NOT NULL REFERENCES guild_members(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'maybe', 'absent')),
  note text,
  responded_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, guild_member_id)
);

CREATE TABLE event_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  guild_member_id uuid NOT NULL REFERENCES guild_members(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES users(id) ON DELETE SET NULL,
  assignment_type text NOT NULL,
  objective text,
  target_json jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'assigned'
    CHECK (status IN ('assigned', 'accepted', 'completed', 'missed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE objectives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id uuid NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  event_id uuid REFERENCES events(id) ON DELETE SET NULL,
  guild_member_id uuid REFERENCES guild_members(id) ON DELETE SET NULL,
  assigned_by uuid REFERENCES users(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  due_at timestamptz,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'done', 'cancelled')),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id uuid NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  server_id uuid REFERENCES servers(id) ON DELETE SET NULL,
  created_by_member_id uuid REFERENCES guild_members(id) ON DELETE SET NULL,
  alert_type text NOT NULL
    CHECK (alert_type IN ('attack', 'sos', 'event', 'bank', 'system')),
  severity text NOT NULL DEFAULT 'high'
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  title text NOT NULL,
  message text NOT NULL,
  target_label text,
  target_x int,
  target_y int,
  metadata jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'resolved', 'cancelled', 'expired')),
  expires_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE alert_acknowledgements (
  alert_id uuid NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  guild_member_id uuid NOT NULL REFERENCES guild_members(id) ON DELETE CASCADE,
  response text NOT NULL DEFAULT 'seen'
    CHECK (response IN ('seen', 'joining', 'cannot_join', 'resolved')),
  note text,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (alert_id, guild_member_id)
);

CREATE TABLE alert_reminder_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id uuid NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  guild_id uuid NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  guild_member_id uuid NOT NULL REFERENCES guild_members(id) ON DELETE CASCADE,
  scheduled_at timestamptz NOT NULL,
  sent_at timestamptz,
  attempts int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sent', 'skipped', 'failed')),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (alert_id, guild_member_id, scheduled_at)
);

CREATE TABLE diplomacy_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id uuid NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  server_id uuid REFERENCES servers(id) ON DELETE SET NULL,
  tag text,
  name text NOT NULL,
  relation_type text NOT NULL
    CHECK (relation_type IN ('ally', 'enemy', 'nap', 'neutral', 'watchlist')),
  stance text,
  notes text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE nap_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id uuid NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  diplomacy_entry_id uuid REFERENCES diplomacy_entries(id) ON DELETE SET NULL,
  title text NOT NULL,
  terms text NOT NULL,
  starts_at timestamptz,
  ends_at timestamptz,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'expired', 'cancelled')),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE coordinates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id uuid NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  server_id uuid REFERENCES servers(id) ON DELETE SET NULL,
  diplomacy_entry_id uuid REFERENCES diplomacy_entries(id) ON DELETE SET NULL,
  label text NOT NULL,
  x int NOT NULL,
  y int NOT NULL,
  category text NOT NULL DEFAULT 'important',
  visibility text NOT NULL DEFAULT 'members'
    CHECK (visibility IN ('public', 'members', 'officers', 'admins')),
  notes text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE banks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id uuid NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  server_id uuid REFERENCES servers(id) ON DELETE SET NULL,
  name text NOT NULL DEFAULT 'Banque principale',
  command_alias citext NOT NULL DEFAULT '!banque',
  settings jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (guild_id, server_id, name)
);

CREATE TABLE bank_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_id uuid NOT NULL REFERENCES banks(id) ON DELETE CASCADE,
  resource_code citext NOT NULL,
  resource_name text NOT NULL,
  amount numeric(20, 2) NOT NULL DEFAULT 0,
  unit text,
  updated_by_member_id uuid REFERENCES guild_members(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bank_id, resource_code),
  CHECK (amount >= 0)
);

CREATE TABLE bank_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_id uuid NOT NULL REFERENCES banks(id) ON DELETE CASCADE,
  requester_member_id uuid NOT NULL REFERENCES guild_members(id) ON DELETE CASCADE,
  resource_code citext NOT NULL,
  amount numeric(20, 2) NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'refused', 'fulfilled', 'cancelled')),
  decided_by_member_id uuid REFERENCES guild_members(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (amount > 0)
);

CREATE TABLE bank_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_id uuid NOT NULL REFERENCES banks(id) ON DELETE CASCADE,
  resource_code citext,
  movement_type text NOT NULL DEFAULT 'adjustment'
    CHECK (movement_type IN ('in', 'out', 'command', 'adjustment')),
  amount numeric(20, 2) NOT NULL DEFAULT 0,
  unit text,
  actor_member_id uuid REFERENCES guild_members(id) ON DELETE SET NULL,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE forum_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id uuid NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  sort_order int NOT NULL DEFAULT 0,
  visibility text NOT NULL DEFAULT 'members'
    CHECK (visibility IN ('public', 'members', 'officers', 'admins')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (guild_id, name)
);

CREATE TABLE forum_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES forum_categories(id) ON DELETE CASCADE,
  author_member_id uuid REFERENCES guild_members(id) ON DELETE SET NULL,
  title text NOT NULL,
  visibility text NOT NULL DEFAULT 'members'
    CHECK (visibility IN ('public', 'members')),
  pinned_at timestamptz,
  pinned_by_member_id uuid REFERENCES guild_members(id) ON DELETE SET NULL,
  locked_at timestamptz,
  locked_by_member_id uuid REFERENCES guild_members(id) ON DELETE SET NULL,
  last_post_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE forum_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
  author_member_id uuid REFERENCES guild_members(id) ON DELETE SET NULL,
  body text NOT NULL,
  edited_at timestamptz,
  edited_by_member_id uuid REFERENCES guild_members(id) ON DELETE SET NULL,
  deleted_at timestamptz,
  deleted_by_member_id uuid REFERENCES guild_members(id) ON DELETE SET NULL,
  moderation_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE forum_category_role_permissions (
  category_id uuid NOT NULL REFERENCES forum_categories(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  can_read boolean NOT NULL DEFAULT true,
  can_post boolean NOT NULL DEFAULT true,
  can_moderate boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (category_id, role_id)
);

CREATE TABLE forum_member_mutes (
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

CREATE TABLE private_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  guild_id uuid REFERENCES guilds(id) ON DELETE CASCADE,
  sender_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  recipient_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  body text NOT NULL,
  source_language varchar(12) NOT NULL DEFAULT 'auto',
  metadata jsonb NOT NULL DEFAULT '{}',
  read_at timestamptz,
  deleted_by_sender_at timestamptz,
  deleted_by_recipient_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    sender_user_id IS NULL
    OR recipient_user_id IS NULL
    OR sender_user_id <> recipient_user_id
  )
);

CREATE TABLE public_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id uuid NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  guild_member_id uuid REFERENCES guild_members(id) ON DELETE SET NULL,
  guest_name text,
  guest_fingerprint_hash text,
  body text NOT NULL,
  source_language varchar(12) NOT NULL DEFAULT 'auto',
  moderation_status text NOT NULL DEFAULT 'visible'
    CHECK (moderation_status IN ('visible', 'hidden', 'flagged', 'deleted')),
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE message_read_receipts (
  message_id uuid NOT NULL REFERENCES private_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

CREATE TABLE translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table text NOT NULL
    CHECK (source_table IN ('private_messages', 'public_chat_messages', 'forum_posts', 'alerts')),
  source_id uuid NOT NULL,
  source_language varchar(12) NOT NULL DEFAULT 'auto',
  target_language varchar(12) NOT NULL,
  translated_text text NOT NULL,
  provider text NOT NULL,
  provider_request_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_table, source_id, target_language)
);

CREATE TABLE translation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table text NOT NULL
    CHECK (source_table IN ('private_messages', 'public_chat_messages', 'forum_posts', 'alerts')),
  source_id uuid NOT NULL,
  source_language varchar(12) NOT NULL DEFAULT 'auto',
  target_language varchar(12) NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  provider text,
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 5,
  locked_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (source_table, source_id, target_language)
);

CREATE TABLE guild_merge_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_guild_id uuid NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  target_guild_id uuid NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scanning', 'review', 'approved', 'rejected', 'merged', 'cancelled')),
  strategy_json jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CHECK (source_guild_id <> target_guild_id)
);

CREATE TABLE guild_merge_duplicates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merge_request_id uuid NOT NULL REFERENCES guild_merge_requests(id) ON DELETE CASCADE,
  source_member_id uuid REFERENCES guild_members(id) ON DELETE SET NULL,
  target_member_id uuid REFERENCES guild_members(id) ON DELETE SET NULL,
  duplicate_type text NOT NULL DEFAULT 'member'
    CHECK (duplicate_type IN ('member', 'role', 'coordinate', 'forum_thread', 'bank_request', 'event')),
  confidence numeric(5, 4) NOT NULL,
  reasons jsonb NOT NULL DEFAULT '[]',
  decision text NOT NULL DEFAULT 'pending'
    CHECK (decision IN ('pending', 'merge', 'keep_both', 'ignore')),
  decided_by uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  guild_id uuid REFERENCES guilds(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_member_id uuid REFERENCES guild_members(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_table text,
  target_id uuid,
  ip_address inet,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id uuid NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_sessions
  ADD COLUMN active_organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  ADD COLUMN active_guild_id uuid REFERENCES guilds(id) ON DELETE SET NULL;

CREATE INDEX idx_user_sessions_user_expires ON user_sessions(user_id, expires_at);
CREATE INDEX idx_user_sessions_active_context
ON user_sessions(user_id, active_organization_id, active_guild_id)
WHERE revoked_at IS NULL;
CREATE INDEX idx_organizations_owner ON organizations(owner_user_id);
CREATE INDEX idx_guilds_org ON guilds(organization_id);
CREATE INDEX idx_guilds_game_server ON guilds(game_id, server_id);
CREATE UNIQUE INDEX idx_guild_sites_invite_token ON guild_sites(invite_token);
CREATE INDEX idx_guild_sites_published_invite
ON guild_sites(public_slug, invite_token)
WHERE status = 'published';
CREATE INDEX idx_guild_modules_active ON guild_modules(guild_id, module_key)
WHERE status = 'enabled';
CREATE INDEX idx_guild_members_guild ON guild_members(guild_id);
CREATE INDEX idx_guild_members_user ON guild_members(user_id);
CREATE INDEX idx_membership_requests_guild_status
ON membership_requests(guild_id, status, requested_at DESC);
CREATE INDEX idx_membership_requests_pending
ON membership_requests(guild_id, requested_at DESC)
WHERE status = 'pending';
CREATE UNIQUE INDEX idx_membership_requests_pending_user
ON membership_requests(guild_id, user_id)
WHERE status = 'pending';
CREATE INDEX idx_guild_member_blocks_guild_active
ON guild_member_blocks(guild_id, blocked_at DESC)
WHERE lifted_at IS NULL;
CREATE UNIQUE INDEX idx_guild_member_blocks_active_user
ON guild_member_blocks(guild_id, user_id)
WHERE user_id IS NOT NULL
  AND lifted_at IS NULL;
CREATE UNIQUE INDEX idx_guild_member_blocks_active_nickname
ON guild_member_blocks(guild_id, normalized_nickname)
WHERE lifted_at IS NULL;
CREATE INDEX idx_roles_guild ON roles(guild_id);
CREATE UNIQUE INDEX idx_roles_org_global_code_unique
ON roles(organization_id, code)
WHERE guild_id IS NULL;
CREATE UNIQUE INDEX idx_roles_guild_code_unique
ON roles(guild_id, code)
WHERE guild_id IS NOT NULL;
CREATE INDEX idx_events_guild_starts ON events(guild_id, starts_at);
CREATE INDEX idx_event_attendance_member ON event_attendance(guild_member_id, updated_at DESC);
CREATE INDEX idx_event_assignments_event ON event_assignments(event_id);
CREATE INDEX idx_objectives_member_status ON objectives(guild_member_id, status);
CREATE INDEX idx_alerts_active ON alerts(guild_id, status, created_at DESC);
CREATE INDEX idx_alert_ack_member ON alert_acknowledgements(guild_member_id, acknowledged_at DESC);
CREATE INDEX idx_alert_ack_alert_response ON alert_acknowledgements(alert_id, response);
CREATE INDEX idx_alert_reminder_jobs_due ON alert_reminder_jobs(status, scheduled_at);
CREATE INDEX idx_alert_reminder_jobs_alert ON alert_reminder_jobs(alert_id, guild_member_id);
CREATE INDEX idx_notifications_user_guild_created
ON notifications(user_id, guild_id, created_at DESC);
CREATE INDEX idx_notifications_user_unread
ON notifications(user_id, guild_id, created_at DESC)
WHERE read_at IS NULL;
CREATE INDEX idx_push_subscriptions_user_active
ON push_subscriptions(user_id)
WHERE revoked_at IS NULL;
CREATE INDEX idx_diplomacy_guild_relation ON diplomacy_entries(guild_id, relation_type);
CREATE INDEX idx_coordinates_guild_category ON coordinates(guild_id, category);
CREATE INDEX idx_bank_requests_status ON bank_requests(bank_id, status, created_at DESC);
CREATE INDEX idx_bank_movements_bank_created ON bank_movements(bank_id, created_at DESC);
CREATE INDEX idx_forum_threads_category_last ON forum_threads(category_id, last_post_at DESC NULLS LAST);
CREATE INDEX idx_forum_posts_thread_created ON forum_posts(thread_id, created_at);
CREATE INDEX idx_forum_categories_guild_sort ON forum_categories(guild_id, sort_order, name);
CREATE INDEX idx_forum_category_role_permissions_role ON forum_category_role_permissions(role_id, category_id);
CREATE INDEX idx_forum_threads_category_pinned_last
ON forum_threads(category_id, pinned_at DESC NULLS LAST, (COALESCE(last_post_at, created_at)) DESC);
CREATE INDEX idx_forum_threads_public_visibility
ON forum_threads(category_id, visibility, pinned_at DESC NULLS LAST, (COALESCE(last_post_at, created_at)) DESC);
CREATE UNIQUE INDEX idx_forum_member_mutes_active
ON forum_member_mutes(guild_id, muted_member_id)
WHERE lifted_at IS NULL;
CREATE INDEX idx_forum_member_mutes_member ON forum_member_mutes(muted_member_id, lifted_at);
CREATE INDEX idx_forum_posts_thread_visible_created ON forum_posts(thread_id, created_at)
WHERE deleted_at IS NULL;
CREATE INDEX idx_private_messages_sender_created ON private_messages(sender_user_id, created_at DESC);
CREATE INDEX idx_private_messages_recipient_created ON private_messages(recipient_user_id, created_at DESC);
CREATE INDEX idx_private_messages_guild_created ON private_messages(guild_id, created_at DESC);
CREATE INDEX idx_private_messages_guild_recipient_created ON private_messages(guild_id, recipient_user_id, created_at DESC);
CREATE INDEX idx_private_messages_metadata_channel
ON private_messages((metadata->>'channel'), created_at DESC)
WHERE recipient_user_id IS NULL;
CREATE INDEX idx_public_chat_messages_guild_created ON public_chat_messages(guild_id, created_at DESC);
CREATE INDEX idx_public_chat_messages_guest_rate
ON public_chat_messages(guild_id, guest_fingerprint_hash, created_at DESC)
WHERE guest_fingerprint_hash IS NOT NULL;
CREATE INDEX idx_auth_rate_limits_blocked_until
ON auth_rate_limits(blocked_until)
WHERE blocked_until IS NOT NULL;
CREATE INDEX idx_auth_rate_limits_updated_at ON auth_rate_limits(updated_at);
CREATE INDEX idx_message_read_receipts_user_read ON message_read_receipts(user_id, read_at DESC);
CREATE INDEX idx_translations_lookup ON translations(source_table, source_id, target_language);
CREATE INDEX idx_translation_jobs_queue
ON translation_jobs(status, next_attempt_at, created_at)
WHERE status IN ('queued', 'failed');
CREATE INDEX idx_merge_duplicates_request ON guild_merge_duplicates(merge_request_id, decision);
CREATE INDEX idx_audit_logs_guild_created ON audit_logs(guild_id, created_at DESC);
CREATE INDEX idx_audit_logs_actor_created ON audit_logs(actor_user_id, created_at DESC);
CREATE INDEX idx_email_verification_tokens_user_pending
ON email_verification_tokens(user_id, created_at DESC)
WHERE consumed_at IS NULL;
CREATE INDEX idx_email_verification_tokens_expires
ON email_verification_tokens(expires_at)
WHERE consumed_at IS NULL;

ALTER TABLE bank_requests
ADD CONSTRAINT bank_requests_resource_fk
FOREIGN KEY (bank_id, resource_code)
REFERENCES bank_resources(bank_id, resource_code)
ON UPDATE CASCADE;

ALTER TABLE bank_movements
ADD CONSTRAINT bank_movements_resource_fk
FOREIGN KEY (bank_id, resource_code)
REFERENCES bank_resources(bank_id, resource_code)
ON UPDATE CASCADE;

CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER auth_rate_limits_set_updated_at
BEFORE UPDATE ON auth_rate_limits
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER organizations_set_updated_at
BEFORE UPDATE ON organizations
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER guilds_set_updated_at
BEFORE UPDATE ON guilds
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER guild_sites_set_updated_at
BEFORE UPDATE ON guild_sites
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER guild_modules_set_updated_at
BEFORE UPDATE ON guild_modules
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER roles_set_updated_at
BEFORE UPDATE ON roles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER guild_members_set_updated_at
BEFORE UPDATE ON guild_members
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER membership_requests_set_updated_at
BEFORE UPDATE ON membership_requests
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER guild_member_blocks_set_updated_at
BEFORE UPDATE ON guild_member_blocks
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER events_set_updated_at
BEFORE UPDATE ON events
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER event_assignments_set_updated_at
BEFORE UPDATE ON event_assignments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER event_attendance_set_updated_at
BEFORE UPDATE ON event_attendance
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER alert_reminder_jobs_set_updated_at
BEFORE UPDATE ON alert_reminder_jobs
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER objectives_set_updated_at
BEFORE UPDATE ON objectives
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER diplomacy_entries_set_updated_at
BEFORE UPDATE ON diplomacy_entries
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER nap_agreements_set_updated_at
BEFORE UPDATE ON nap_agreements
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER coordinates_set_updated_at
BEFORE UPDATE ON coordinates
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER banks_set_updated_at
BEFORE UPDATE ON banks
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER bank_resources_set_updated_at
BEFORE UPDATE ON bank_resources
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER bank_requests_set_updated_at
BEFORE UPDATE ON bank_requests
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER forum_categories_set_updated_at
BEFORE UPDATE ON forum_categories
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER forum_threads_set_updated_at
BEFORE UPDATE ON forum_threads
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER forum_category_role_permissions_set_updated_at
BEFORE UPDATE ON forum_category_role_permissions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER forum_member_mutes_set_updated_at
BEFORE UPDATE ON forum_member_mutes
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER guild_merge_requests_set_updated_at
BEFORE UPDATE ON guild_merge_requests
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER translation_jobs_set_updated_at
BEFORE UPDATE ON translation_jobs
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;

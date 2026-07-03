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
  avatar_url text,
  email_verified_at timestamptz,
  last_login_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
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
  created_at timestamptz NOT NULL DEFAULT now()
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
  theme_json jsonb NOT NULL DEFAULT '{}',
  pages_json jsonb NOT NULL DEFAULT '{}',
  seo_json jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
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

CREATE TABLE guild_member_roles (
  guild_member_id uuid NOT NULL REFERENCES guild_members(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES users(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_member_id, role_id)
);

CREATE TABLE recruitment_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id uuid NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  language varchar(12) NOT NULL DEFAULT 'fr',
  requirements_json jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'open', 'paused', 'closed')),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

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
    CHECK (status IN ('pending', 'approved', 'rejected', 'fulfilled', 'cancelled')),
  decided_by_member_id uuid REFERENCES guild_members(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (amount > 0)
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
  pinned_at timestamptz,
  locked_at timestamptz,
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
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
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

CREATE TABLE translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table text NOT NULL
    CHECK (source_table IN ('private_messages', 'public_chat_messages', 'forum_posts', 'alerts', 'recruitment_posts')),
  source_id uuid NOT NULL,
  source_language varchar(12) NOT NULL DEFAULT 'auto',
  target_language varchar(12) NOT NULL,
  translated_text text NOT NULL,
  provider text NOT NULL,
  provider_request_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
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

CREATE INDEX idx_user_sessions_user_expires ON user_sessions(user_id, expires_at);
CREATE INDEX idx_organizations_owner ON organizations(owner_user_id);
CREATE INDEX idx_guilds_org ON guilds(organization_id);
CREATE INDEX idx_guilds_game_server ON guilds(game_id, server_id);
CREATE INDEX idx_guild_members_guild ON guild_members(guild_id);
CREATE INDEX idx_guild_members_user ON guild_members(user_id);
CREATE INDEX idx_roles_guild ON roles(guild_id);
CREATE UNIQUE INDEX idx_roles_org_global_code_unique
ON roles(organization_id, code)
WHERE guild_id IS NULL;
CREATE UNIQUE INDEX idx_roles_guild_code_unique
ON roles(guild_id, code)
WHERE guild_id IS NOT NULL;
CREATE INDEX idx_recruitment_posts_search ON recruitment_posts(guild_id, status, published_at DESC);
CREATE INDEX idx_events_guild_starts ON events(guild_id, starts_at);
CREATE INDEX idx_event_attendance_member ON event_attendance(guild_member_id, updated_at DESC);
CREATE INDEX idx_event_assignments_event ON event_assignments(event_id);
CREATE INDEX idx_objectives_member_status ON objectives(guild_member_id, status);
CREATE INDEX idx_alerts_active ON alerts(guild_id, status, created_at DESC);
CREATE INDEX idx_alert_ack_member ON alert_acknowledgements(guild_member_id, acknowledged_at DESC);
CREATE INDEX idx_diplomacy_guild_relation ON diplomacy_entries(guild_id, relation_type);
CREATE INDEX idx_coordinates_guild_category ON coordinates(guild_id, category);
CREATE INDEX idx_bank_requests_status ON bank_requests(bank_id, status, created_at DESC);
CREATE INDEX idx_forum_threads_category_last ON forum_threads(category_id, last_post_at DESC NULLS LAST);
CREATE INDEX idx_forum_posts_thread_created ON forum_posts(thread_id, created_at);
CREATE INDEX idx_private_messages_sender_created ON private_messages(sender_user_id, created_at DESC);
CREATE INDEX idx_private_messages_recipient_created ON private_messages(recipient_user_id, created_at DESC);
CREATE INDEX idx_public_chat_messages_guild_created ON public_chat_messages(guild_id, created_at DESC);
CREATE INDEX idx_translations_lookup ON translations(source_table, source_id, target_language);
CREATE INDEX idx_merge_duplicates_request ON guild_merge_duplicates(merge_request_id, decision);
CREATE INDEX idx_audit_logs_guild_created ON audit_logs(guild_id, created_at DESC);
CREATE INDEX idx_audit_logs_actor_created ON audit_logs(actor_user_id, created_at DESC);

ALTER TABLE bank_requests
ADD CONSTRAINT bank_requests_resource_fk
FOREIGN KEY (bank_id, resource_code)
REFERENCES bank_resources(bank_id, resource_code)
ON UPDATE CASCADE;

CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON users
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

CREATE TRIGGER roles_set_updated_at
BEFORE UPDATE ON roles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER guild_members_set_updated_at
BEFORE UPDATE ON guild_members
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER recruitment_posts_set_updated_at
BEFORE UPDATE ON recruitment_posts
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

CREATE TRIGGER guild_merge_requests_set_updated_at
BEFORE UPDATE ON guild_merge_requests
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;

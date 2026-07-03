-- Private guild forum support: role permissions and moderated edits/deletions.

BEGIN;

CREATE TABLE IF NOT EXISTS forum_category_role_permissions (
  category_id uuid NOT NULL REFERENCES forum_categories(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  can_read boolean NOT NULL DEFAULT true,
  can_post boolean NOT NULL DEFAULT true,
  can_moderate boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (category_id, role_id)
);

ALTER TABLE forum_threads
  ADD COLUMN IF NOT EXISTS pinned_by_member_id uuid REFERENCES guild_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS locked_by_member_id uuid REFERENCES guild_members(id) ON DELETE SET NULL;

ALTER TABLE forum_posts
  ADD COLUMN IF NOT EXISTS edited_by_member_id uuid REFERENCES guild_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deleted_by_member_id uuid REFERENCES guild_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS moderation_note text;

CREATE INDEX IF NOT EXISTS idx_forum_categories_guild_sort
ON forum_categories(guild_id, sort_order, name);

CREATE INDEX IF NOT EXISTS idx_forum_category_role_permissions_role
ON forum_category_role_permissions(role_id, category_id);

CREATE INDEX IF NOT EXISTS idx_forum_threads_category_pinned_last
ON forum_threads(category_id, pinned_at DESC NULLS LAST, (COALESCE(last_post_at, created_at)) DESC);

CREATE INDEX IF NOT EXISTS idx_forum_posts_thread_visible_created
ON forum_posts(thread_id, created_at)
WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS forum_category_role_permissions_set_updated_at ON forum_category_role_permissions;

CREATE TRIGGER forum_category_role_permissions_set_updated_at
BEFORE UPDATE ON forum_category_role_permissions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;

-- Track which forum threads each member has already opened.

BEGIN;

CREATE TABLE IF NOT EXISTS forum_thread_reads (
  guild_id uuid NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES guild_members(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_forum_thread_reads_member_last
ON forum_thread_reads(member_id, last_read_at DESC);

CREATE INDEX IF NOT EXISTS idx_forum_thread_reads_guild_member
ON forum_thread_reads(guild_id, member_id);

DROP TRIGGER IF EXISTS forum_thread_reads_set_updated_at ON forum_thread_reads;

CREATE TRIGGER forum_thread_reads_set_updated_at
BEFORE UPDATE ON forum_thread_reads
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;

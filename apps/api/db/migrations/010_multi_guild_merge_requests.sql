-- Multi-guild membership lookup and deterministic merge duplicate rescans.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_guild_members_user_status
ON guild_members(user_id, status)
WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_guild_members_guild_normalized_nickname
ON guild_members(guild_id, lower(regexp_replace(nickname, '\s+', '', 'g')));

CREATE INDEX IF NOT EXISTS idx_merge_requests_source_status
ON guild_merge_requests(source_guild_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_merge_requests_target_status
ON guild_merge_requests(target_guild_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_merge_duplicates_member_pair_unique
ON guild_merge_duplicates(merge_request_id, source_member_id, target_member_id, duplicate_type)
WHERE source_member_id IS NOT NULL
  AND target_member_id IS NOT NULL;

COMMIT;

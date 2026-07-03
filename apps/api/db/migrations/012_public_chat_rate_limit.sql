-- Speed up public guest chat rate-limit checks by guild and guest fingerprint.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_public_chat_messages_guest_rate
ON public_chat_messages(guild_id, guest_fingerprint_hash, created_at DESC)
WHERE guest_fingerprint_hash IS NOT NULL;

COMMIT;

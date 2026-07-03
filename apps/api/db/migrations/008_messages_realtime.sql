-- Messaging realtime support: per-user read receipts and indexes.

BEGIN;

CREATE TABLE IF NOT EXISTS message_read_receipts (
  message_id uuid NOT NULL REFERENCES private_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_message_read_receipts_user_read
ON message_read_receipts(user_id, read_at DESC);

CREATE INDEX IF NOT EXISTS idx_private_messages_guild_created
ON private_messages(guild_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_private_messages_guild_recipient_created
ON private_messages(guild_id, recipient_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_private_messages_metadata_channel
ON private_messages((metadata->>'channel'), created_at DESC)
WHERE recipient_user_id IS NULL;

COMMIT;

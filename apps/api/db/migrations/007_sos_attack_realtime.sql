-- SOS attack realtime acknowledgements and reminder outbox.

BEGIN;

CREATE TABLE IF NOT EXISTS alert_reminder_jobs (
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

CREATE INDEX IF NOT EXISTS idx_alert_ack_alert_response
ON alert_acknowledgements(alert_id, response);

CREATE INDEX IF NOT EXISTS idx_alert_reminder_jobs_due
ON alert_reminder_jobs(status, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_alert_reminder_jobs_alert
ON alert_reminder_jobs(alert_id, guild_member_id);

DROP TRIGGER IF EXISTS alert_reminder_jobs_set_updated_at ON alert_reminder_jobs;
CREATE TRIGGER alert_reminder_jobs_set_updated_at
BEFORE UPDATE ON alert_reminder_jobs
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;

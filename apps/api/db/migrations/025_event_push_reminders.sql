ALTER TABLE events
  ADD COLUMN IF NOT EXISTS reminder_offsets_minutes int[] NOT NULL DEFAULT ARRAY[1440, 60]::int[];

ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_reminder_offsets_minutes_check;

ALTER TABLE events
  ADD CONSTRAINT events_reminder_offsets_minutes_check
  CHECK (reminder_offsets_minutes <@ ARRAY[15, 60, 1440]::int[]);

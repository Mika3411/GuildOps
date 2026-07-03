-- Guild bank movements and request status workflow.

BEGIN;

ALTER TABLE bank_requests
DROP CONSTRAINT IF EXISTS bank_requests_status_check;

UPDATE bank_requests
SET status = 'refused'
WHERE status = 'rejected';

ALTER TABLE bank_requests
ADD CONSTRAINT bank_requests_status_check
CHECK (status IN ('pending', 'approved', 'refused', 'fulfilled', 'cancelled'));

CREATE TABLE IF NOT EXISTS bank_movements (
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

ALTER TABLE bank_movements
DROP CONSTRAINT IF EXISTS bank_movements_resource_fk;

ALTER TABLE bank_movements
ADD CONSTRAINT bank_movements_resource_fk
FOREIGN KEY (bank_id, resource_code)
REFERENCES bank_resources(bank_id, resource_code)
ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS idx_bank_movements_bank_created
ON bank_movements(bank_id, created_at DESC);

COMMIT;

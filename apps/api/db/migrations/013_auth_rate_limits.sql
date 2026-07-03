-- Auth anti-abuse counters for login/register rate limits and progressive lockouts.

BEGIN;

CREATE TABLE IF NOT EXISTS auth_rate_limits (
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

CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_blocked_until
ON auth_rate_limits(blocked_until)
WHERE blocked_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_updated_at
ON auth_rate_limits(updated_at);

DROP TRIGGER IF EXISTS auth_rate_limits_set_updated_at ON auth_rate_limits;
CREATE TRIGGER auth_rate_limits_set_updated_at
BEFORE UPDATE ON auth_rate_limits
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;

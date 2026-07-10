import { createHmac } from "node:crypto";
import type { Request } from "express";
import { env } from "../config/env.js";
import { query } from "../db/pool.js";

export type AuthRateLimitAction = "login" | "register";

type AuthRateLimitBucket = "ip" | "email" | "ip_email";

type AuthRateLimitRule = {
  bucket: AuthRateLimitBucket;
  limit: number;
  windowSeconds: number;
  label: string;
};

type AuthRateLimitCheck = AuthRateLimitRule & {
  hash: string;
  attempts: number;
  windowStartedAt: string;
  blockedUntil: string | null;
};

export type AuthRateLimitHit = {
  action: AuthRateLimitAction;
  bucket: AuthRateLimitBucket;
  limit: number;
  windowSeconds: number;
  label: string;
  retryAfterSeconds: number;
  reason: "blocked" | "quota";
};

export type AuthRateLimitState = {
  action: AuthRateLimitAction;
  checks: AuthRateLimitCheck[];
  hit: AuthRateLimitHit | null;
};

type AuthRateLimitRow = {
  attempts: number;
  window_started_at: string;
  blocked_until: string | null;
};

const rateLimitHashSecret = env.SESSION_SECRET ?? env.PASSWORD_PEPPER ?? "guildops-auth-rate-limit";

const authRateLimitRules: Record<AuthRateLimitAction, AuthRateLimitRule[]> = {
  login: [
    { bucket: "ip", limit: 30, windowSeconds: 15 * 60, label: "30 tentatives / 15 min par IP" },
    { bucket: "email", limit: 10, windowSeconds: 15 * 60, label: "10 tentatives / 15 min par email" },
    { bucket: "ip_email", limit: 5, windowSeconds: 15 * 60, label: "5 tentatives / 15 min par IP+email" }
  ],
  register: [
    { bucket: "ip", limit: 20, windowSeconds: 15 * 60, label: "20 inscriptions / 15 min par IP" },
    { bucket: "email", limit: 8, windowSeconds: 15 * 60, label: "8 inscriptions / 15 min par email" },
    { bucket: "ip_email", limit: 5, windowSeconds: 15 * 60, label: "5 inscriptions / 15 min par IP+email" }
  ]
};

const loginFailureBackoff = {
  threshold: 3,
  baseSeconds: 30,
  maxSeconds: 60 * 60,
  failureWindowSeconds: 60 * 60
};

export async function consumeAuthRateLimit(
  action: AuthRateLimitAction,
  req: Request,
  email: string
): Promise<AuthRateLimitState> {
  const identity = buildAuthRateLimitIdentity(action, req, email);
  const checks = await Promise.all(
    authRateLimitRules[action].map(async (rule) => {
      const hash = identity[rule.bucket];
      const result = await query<AuthRateLimitRow>(
        `
          INSERT INTO auth_rate_limits (
            scope,
            bucket,
            bucket_hash,
            attempts,
            window_started_at,
            last_attempt_at
          )
          VALUES ($1, $2, $3, 1, now(), now())
          ON CONFLICT (scope, bucket, bucket_hash)
          DO UPDATE SET
            attempts = CASE
              WHEN auth_rate_limits.window_started_at < now() - make_interval(secs => $4::int)
              THEN 1
              ELSE auth_rate_limits.attempts + 1
            END,
            window_started_at = CASE
              WHEN auth_rate_limits.window_started_at < now() - make_interval(secs => $4::int)
              THEN now()
              ELSE auth_rate_limits.window_started_at
            END,
            last_attempt_at = now()
          RETURNING
            attempts,
            window_started_at::text,
            blocked_until::text
        `,
        [action, rule.bucket, hash, rule.windowSeconds]
      );
      const row = result.rows[0];

      return {
        ...rule,
        hash,
        attempts: Number(row?.attempts ?? 1),
        windowStartedAt: row?.window_started_at ?? new Date().toISOString(),
        blockedUntil: row?.blocked_until ?? null
      };
    })
  );

  return {
    action,
    checks,
    hit: getRateLimitHit(action, checks)
  };
}

export async function recordAuthFailure(state: AuthRateLimitState): Promise<AuthRateLimitHit | null> {
  if (state.action !== "login") {
    return state.hit;
  }

  const updatedChecks = await Promise.all(
    state.checks.map(async (check) => {
      const result = await query<{ failures: number; blocked_until: string | null }>(
        `
          WITH updated AS (
            UPDATE auth_rate_limits
            SET
              failures = CASE
                WHEN last_failure_at IS NULL
                  OR last_failure_at < now() - make_interval(secs => $4::int)
                THEN 1
                ELSE failures + 1
              END,
              last_failure_at = now()
            WHERE scope = $1
              AND bucket = $2
              AND bucket_hash = $3
            RETURNING failures
          ),
          backoff AS (
            SELECT
              failures,
              CASE
                WHEN failures >= $5::int THEN LEAST(
                  $7::double precision,
                  $6::double precision * power(2, LEAST(failures - $5::int, 16))
                )::int
                ELSE NULL
              END AS backoff_seconds
            FROM updated
          )
          UPDATE auth_rate_limits arl
          SET blocked_until = CASE
            WHEN backoff.backoff_seconds IS NULL THEN arl.blocked_until
            ELSE GREATEST(
              COALESCE(arl.blocked_until, now()),
              now() + make_interval(secs => backoff.backoff_seconds)
            )
          END
          FROM backoff
          WHERE arl.scope = $1
            AND arl.bucket = $2
            AND arl.bucket_hash = $3
          RETURNING arl.failures, arl.blocked_until::text
        `,
        [
          state.action,
          check.bucket,
          check.hash,
          loginFailureBackoff.failureWindowSeconds,
          loginFailureBackoff.threshold,
          loginFailureBackoff.baseSeconds,
          loginFailureBackoff.maxSeconds
        ]
      );
      const row = result.rows[0];

      return {
        ...check,
        blockedUntil: row?.blocked_until ?? check.blockedUntil
      };
    })
  );

  return getRateLimitHit(state.action, updatedChecks);
}

export async function clearAuthFailures(state: AuthRateLimitState): Promise<void> {
  await Promise.all(
    state.checks.map((check) =>
      query(
        `
          UPDATE auth_rate_limits
          SET
            failures = 0,
            blocked_until = NULL,
            last_failure_at = NULL
          WHERE scope = $1
            AND bucket = $2
            AND bucket_hash = $3
        `,
        [state.action, check.bucket, check.hash]
      )
    )
  );
}

function buildAuthRateLimitIdentity(action: AuthRateLimitAction, req: Request, email: string) {
  const ip = normalizeIdentifier(req.ip || req.socket.remoteAddress || "unknown");
  const normalizedEmail = normalizeIdentifier(email);

  return {
    ip: hashIdentifier(action, "ip", ip),
    email: hashIdentifier(action, "email", normalizedEmail),
    ip_email: hashIdentifier(action, "ip_email", `${ip}:${normalizedEmail}`)
  } satisfies Record<AuthRateLimitBucket, string>;
}

function hashIdentifier(action: AuthRateLimitAction, bucket: AuthRateLimitBucket, identifier: string): string {
  return createHmac("sha256", rateLimitHashSecret).update(`${action}:${bucket}:${identifier}`).digest("hex");
}

function normalizeIdentifier(value: string): string {
  return value.trim().toLowerCase() || "unknown";
}

function getRateLimitHit(action: AuthRateLimitAction, checks: AuthRateLimitCheck[]): AuthRateLimitHit | null {
  const hits = checks
    .map((check) => getBlockedHit(action, check) ?? getQuotaHit(action, check))
    .filter((hit): hit is AuthRateLimitHit => Boolean(hit));

  return hits.sort((left, right) => right.retryAfterSeconds - left.retryAfterSeconds)[0] ?? null;
}

function getBlockedHit(action: AuthRateLimitAction, check: AuthRateLimitCheck): AuthRateLimitHit | null {
  if (!check.blockedUntil) return null;

  const retryAfterSeconds = Math.ceil((new Date(check.blockedUntil).getTime() - Date.now()) / 1000);

  if (retryAfterSeconds <= 0) return null;

  return {
    action,
    bucket: check.bucket,
    limit: check.limit,
    windowSeconds: check.windowSeconds,
    label: check.label,
    retryAfterSeconds,
    reason: "blocked"
  };
}

function getQuotaHit(action: AuthRateLimitAction, check: AuthRateLimitCheck): AuthRateLimitHit | null {
  if (check.attempts <= check.limit) return null;

  const elapsedSeconds = Math.floor((Date.now() - new Date(check.windowStartedAt).getTime()) / 1000);
  const retryAfterSeconds = Math.max(1, check.windowSeconds - elapsedSeconds + 1);

  return {
    action,
    bucket: check.bucket,
    limit: check.limit,
    windowSeconds: check.windowSeconds,
    label: check.label,
    retryAfterSeconds,
    reason: "quota"
  };
}

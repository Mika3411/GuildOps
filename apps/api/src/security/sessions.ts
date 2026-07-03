import { createHash, randomBytes } from "node:crypto";
import type { Queryable } from "../db/pool.js";
import { env } from "../config/env.js";
import { ConfigurationError } from "../http/errors.js";

export type SessionSecretPair = {
  sessionId: string;
  sessionToken: string;
  sessionHash: string;
  csrfToken: string;
  csrfHash: string;
  expiresAt: Date;
};

type GeneratedSessionSecrets = Omit<SessionSecretPair, "sessionId">;

export function createSessionSecrets(): GeneratedSessionSecrets {
  const sessionToken = randomBytes(32).toString("base64url");
  const csrfToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  return {
    sessionToken,
    sessionHash: hashSessionToken(sessionToken),
    csrfToken,
    csrfHash: hashCsrfToken(csrfToken),
    expiresAt
  };
}

export async function persistSession(
  db: Queryable,
  input: {
    userId: string;
    activeOrganizationId?: string | null;
    activeGuildId?: string | null;
    ipAddress?: string;
    userAgent?: string;
  }
): Promise<SessionSecretPair> {
  const session = createSessionSecrets();

  const result = await db.query<{ id: string }>(
    `
      INSERT INTO user_sessions (
        user_id,
        session_hash,
        csrf_hash,
        active_organization_id,
        active_guild_id,
        ip_address,
        user_agent,
        expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id::text
    `,
    [
      input.userId,
      session.sessionHash,
      session.csrfHash,
      input.activeOrganizationId ?? null,
      input.activeGuildId ?? null,
      input.ipAddress ?? null,
      input.userAgent ?? null,
      session.expiresAt
    ]
  );

  return {
    ...session,
    sessionId: result.rows[0]?.id ?? ""
  };
}

export async function refreshSession(
  db: Queryable,
  input: {
    sessionId: string;
    ipAddress?: string;
    userAgent?: string;
  }
): Promise<SessionSecretPair> {
  const session = createSessionSecrets();

  await db.query(
    `
      UPDATE user_sessions
      SET session_hash = $2,
          csrf_hash = $3,
          expires_at = $4,
          ip_address = $5,
          user_agent = $6,
          refreshed_at = now()
      WHERE id = $1
        AND revoked_at IS NULL
    `,
    [
      input.sessionId,
      session.sessionHash,
      session.csrfHash,
      session.expiresAt,
      input.ipAddress ?? null,
      input.userAgent ?? null
    ]
  );

  return {
    ...session,
    sessionId: input.sessionId
  };
}

export async function revokeSession(db: Queryable, sessionId: string): Promise<void> {
  await db.query("UPDATE user_sessions SET revoked_at = now() WHERE id = $1", [sessionId]);
}

export function hashSessionToken(token: string): string {
  const secret = getSessionSecret();
  return createHash("sha256").update(token).update(secret).digest("hex");
}

export function hashCsrfToken(token: string): string {
  const secret = getSessionSecret();
  return createHash("sha256").update("csrf").update(token).update(secret).digest("hex");
}

function getSessionSecret(): string {
  if (env.SESSION_SECRET) {
    return env.SESSION_SECRET;
  }

  if (env.isProduction) {
    throw new ConfigurationError("SESSION_SECRET is required in production");
  }

  return "guildops-development-session-secret";
}

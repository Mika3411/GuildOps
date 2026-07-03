import { createHash, randomBytes } from "node:crypto";
import type { Queryable } from "../db/pool.js";
import { env } from "../config/env.js";
import { ConfigurationError } from "../http/errors.js";

export type EmailVerificationToken = {
  token: string;
  tokenHash: string;
  expiresAt: Date;
};

export async function createEmailVerificationToken(db: Queryable, userId: string): Promise<EmailVerificationToken> {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashEmailVerificationToken(token);
  const expiresAt = new Date(Date.now() + env.EMAIL_VERIFICATION_TTL_HOURS * 60 * 60 * 1000);

  await db.query(
    `
      UPDATE email_verification_tokens
      SET consumed_at = now()
      WHERE user_id = $1
        AND consumed_at IS NULL
    `,
    [userId]
  );

  await db.query(
    `
      INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
      VALUES ($1, $2, $3)
    `,
    [userId, tokenHash, expiresAt]
  );

  return {
    token,
    tokenHash,
    expiresAt
  };
}

export function hashEmailVerificationToken(token: string): string {
  return createHash("sha256")
    .update("guildops-email-verification")
    .update(token)
    .update(getEmailVerificationSecret())
    .digest("hex");
}

function getEmailVerificationSecret(): string {
  if (env.SESSION_SECRET) return env.SESSION_SECRET;
  if (env.PASSWORD_PEPPER) return env.PASSWORD_PEPPER;

  if (env.isProduction) {
    throw new ConfigurationError("SESSION_SECRET or PASSWORD_PEPPER is required for email verification tokens");
  }

  return "guildops-development-email-verification-secret";
}

import { Router } from "express";
import type { Response } from "express";
import { z } from "zod";
import { database, query, withClient } from "../db/pool.js";
import { asyncHandler } from "../http/async-handler.js";
import { BadRequestError, ForbiddenError, TooManyRequestsError, UnauthorizedError } from "../http/errors.js";
import { validate } from "../http/validate.js";
import {
  isTransactionalEmailConfigured,
  sendEmailVerification
} from "../notifications/email.js";
import {
  clearAuthFailures,
  consumeAuthRateLimit,
  recordAuthFailure,
  type AuthRateLimitHit
} from "../security/auth-rate-limit.js";
import { clearAuthCookies, setAuthCookies } from "../security/cookies.js";
import {
  createEmailVerificationToken,
  hashEmailVerificationToken
} from "../security/email-verification.js";
import { getAuth, requireAuth } from "../security/auth.js";
import { hashPassword, verifyPassword } from "../security/passwords.js";
import { persistSession, refreshSession, revokeSession } from "../security/sessions.js";
import { languageSchema, randomSlugSuffix, slugify, slugSchema } from "./helpers.js";
import { buildMePayload, getDefaultSessionContext } from "./me.service.js";
import { getMeHandler } from "./me.routes.js";

export const authRouter = Router();

const registerBodySchema = z
  .object({
    email: z.string().email().max(320).transform((value) => value.toLowerCase()),
    password: z.string().min(10).max(200),
    displayName: z.string().trim().min(2).max(80),
    preferredLanguage: languageSchema.optional().default("fr"),
    organizationName: z.string().trim().min(2).max(120).optional(),
    organizationSlug: slugSchema.optional()
  })
  .strict();

const loginBodySchema = z
  .object({
    email: z.string().email().max(320).transform((value) => value.toLowerCase()),
    password: z.string().min(1).max(200)
  })
  .strict();

const verifyEmailBodySchema = z
  .object({
    token: z.string().trim().min(20).max(500)
  })
  .strict();

const resendVerificationBodySchema = z
  .object({
    email: z.string().email().max(320).transform((value) => value.toLowerCase())
  })
  .strict();

type PublicUser = {
  id: string;
  email: string;
  displayName: string;
  preferredLanguage: string;
  globalRole: string;
};

type UserRow = {
  id: string;
  email: string;
  display_name: string;
  preferred_language: string;
  global_role: string;
  email_verified_at?: Date | string | null;
  password_hash?: string;
};

type EmailVerificationTokenRow = {
  id: string;
  user_id: string;
  expires_at: Date;
  consumed_at: Date | null;
  user_email: string;
  display_name: string;
  preferred_language: string;
  global_role: string;
};

authRouter.post(
  "/register",
  validate({ body: registerBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof registerBodySchema>;
    throwIfRateLimited(res, (await consumeAuthRateLimit("register", req, body.email)).hit);

    const passwordHash = await hashPassword(body.password);
    const organizationName = body.organizationName ?? `${body.displayName} GuildOps`;
    const organizationSlug = body.organizationSlug ?? `${slugify(organizationName)}-${randomSlugSuffix()}`;

    const result = await withClient(async (client) => {
      await client.query("BEGIN");

      try {
        const userResult = await client.query<UserRow>(
          `
            INSERT INTO users (email, password_hash, display_name, preferred_language)
            VALUES ($1, $2, $3, $4)
            RETURNING id::text, email::text, display_name, preferred_language, global_role, email_verified_at
          `,
          [body.email, passwordHash, body.displayName, body.preferredLanguage]
        );
        const user = userResult.rows[0];

        if (!user) {
          throw new BadRequestError("User could not be created");
        }

        const orgResult = await client.query<{ id: string; name: string; slug: string }>(
          `
            INSERT INTO organizations (owner_user_id, name, slug, billing_email)
            VALUES ($1, $2, $3, $4)
            RETURNING id::text, name, slug::text
          `,
          [user.id, organizationName, organizationSlug, body.email]
        );
        const organization = orgResult.rows[0];

        if (!organization) {
          throw new BadRequestError("Organization could not be created");
        }

        await client.query(
          `
            INSERT INTO organization_members (organization_id, user_id, organization_role)
            VALUES ($1, $2, 'owner')
          `,
          [organization.id, user.id]
        );

        const verificationToken = await createEmailVerificationToken(client, user.id);

        await client.query("COMMIT");

        return {
          user: toPublicUser(user),
          organization,
          verificationToken
        };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
    const { verificationUrl } = await sendEmailVerification({
      displayName: result.user.displayName,
      email: result.user.email,
      token: result.verificationToken.token
    });
    const manualVerification = !isTransactionalEmailConfigured();

    res.status(201).json({
      status: "verification_required",
      message: manualVerification
        ? "Compte cree. SMTP n'est pas configure: utilisez le lien de validation affiche."
        : "Compte cree. Verifiez votre email pour activer la connexion.",
      email: result.user.email,
      user: result.user,
      organization: result.organization,
      verificationExpiresAt: result.verificationToken.expiresAt.toISOString(),
      ...(manualVerification || process.env.NODE_ENV !== "production" ? { verificationUrl } : {})
    });
  })
);

authRouter.post(
  "/login",
  validate({ body: loginBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof loginBodySchema>;
    const loginRateLimit = await consumeAuthRateLimit("login", req, body.email);
    throwIfRateLimited(res, loginRateLimit.hit);

    const userResult = await query<UserRow>(
      `
        SELECT id::text, email::text, display_name, preferred_language, global_role, email_verified_at, password_hash
        FROM users
        WHERE email = $1
          AND disabled_at IS NULL
        LIMIT 1
      `,
      [body.email]
    );
    const user = userResult.rows[0];

    if (!user?.password_hash || !(await verifyPassword(body.password, user.password_hash))) {
      throwIfRateLimited(res, await recordAuthFailure(loginRateLimit));
      throw new UnauthorizedError("Invalid email or password");
    }

    if (!user.email_verified_at) {
      const verificationToken = await withClient(async (client) => createEmailVerificationToken(client, user.id));
      const { verificationUrl } = await sendEmailVerification({
        displayName: user.display_name,
        email: user.email,
        token: verificationToken.token
      });
      const manualVerification = !isTransactionalEmailConfigured();

      throw new ForbiddenError("Email non verifie. Un nouveau lien de validation vient d'etre envoye.", {
        email: user.email,
        reason: "EMAIL_NOT_VERIFIED",
        ...(manualVerification || process.env.NODE_ENV !== "production" ? { verificationUrl } : {})
      });
    }

    await clearAuthFailures(loginRateLimit);

    const context = await getDefaultSessionContext(database, user.id);
    const session = await persistSession(database, {
      userId: user.id,
      activeOrganizationId: context.activeOrganizationId,
      activeGuildId: context.activeGuildId,
      ipAddress: req.ip,
      userAgent: req.get("user-agent")
    });

    await query("UPDATE users SET last_login_at = now() WHERE id = $1", [user.id]);
    setAuthCookies(res, session);
    const me = await buildMePayload(database, user.id, session.sessionId);

    res.json({
      ...me,
      csrfToken: session.csrfToken,
      session: {
        expiresAt: session.expiresAt.toISOString()
      }
    });
  })
);

authRouter.post(
  "/verify-email",
  validate({ body: verifyEmailBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof verifyEmailBodySchema>;
    const tokenHash = hashEmailVerificationToken(body.token);

    const result = await withClient(async (client) => {
      await client.query("BEGIN");

      try {
        const tokenResult = await client.query<EmailVerificationTokenRow>(
          `
            SELECT
              evt.id::text,
              evt.user_id::text,
              evt.expires_at,
              evt.consumed_at,
              u.email::text AS user_email,
              u.display_name,
              u.preferred_language,
              u.global_role
            FROM email_verification_tokens evt
            JOIN users u ON u.id = evt.user_id
            WHERE evt.token_hash = $1
              AND u.disabled_at IS NULL
            LIMIT 1
            FOR UPDATE OF evt, u
          `,
          [tokenHash]
        );
        const tokenRow = tokenResult.rows[0];

        if (!tokenRow || tokenRow.consumed_at || new Date(tokenRow.expires_at).getTime() <= Date.now()) {
          throw new BadRequestError("Lien de validation invalide ou expire");
        }

        await client.query("UPDATE email_verification_tokens SET consumed_at = now() WHERE id = $1", [tokenRow.id]);

        const userResult = await client.query<UserRow>(
          `
            UPDATE users
            SET email_verified_at = COALESCE(email_verified_at, now()),
                last_login_at = now()
            WHERE id = $1
            RETURNING id::text, email::text, display_name, preferred_language, global_role, email_verified_at
          `,
          [tokenRow.user_id]
        );
        const user = userResult.rows[0];

        if (!user) {
          throw new BadRequestError("Compte introuvable pour ce lien de validation");
        }

        const context = await getDefaultSessionContext(client, user.id);
        const session = await persistSession(client, {
          userId: user.id,
          activeOrganizationId: context.activeOrganizationId,
          activeGuildId: context.activeGuildId,
          ipAddress: req.ip,
          userAgent: req.get("user-agent")
        });

        await client.query("COMMIT");

        return {
          session,
          user
        };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });

    setAuthCookies(res, result.session);
    const me = await buildMePayload(database, result.user.id, result.session.sessionId);

    res.json({
      ...me,
      csrfToken: result.session.csrfToken,
      emailVerified: true,
      session: {
        expiresAt: result.session.expiresAt.toISOString()
      }
    });
  })
);

authRouter.post(
  "/resend-verification",
  validate({ body: resendVerificationBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof resendVerificationBodySchema>;
    throwIfRateLimited(res, (await consumeAuthRateLimit("register", req, body.email)).hit);

    const userResult = await query<UserRow>(
      `
        SELECT id::text, email::text, display_name, preferred_language, global_role, email_verified_at
        FROM users
        WHERE email = $1
          AND disabled_at IS NULL
        LIMIT 1
      `,
      [body.email]
    );
    const user = userResult.rows[0];
    let verificationUrl: string | undefined;
    let verificationExpiresAt: string | undefined;

    if (user && !user.email_verified_at) {
      const verificationToken = await withClient(async (client) => createEmailVerificationToken(client, user.id));
      const delivery = await sendEmailVerification({
        displayName: user.display_name,
        email: user.email,
        token: verificationToken.token
      });

      verificationUrl = delivery.verificationUrl;
      verificationExpiresAt = verificationToken.expiresAt.toISOString();
    }

    res.status(202).json({
      status: "accepted",
      message: !isTransactionalEmailConfigured()
        ? "Si un compte attend une validation, utilisez le lien affiche."
        : "Si un compte attend une validation, un nouveau lien vient d'etre envoye.",
      email: body.email,
      ...(verificationExpiresAt ? { verificationExpiresAt } : {}),
      ...(!verificationUrl || (process.env.NODE_ENV === "production" && isTransactionalEmailConfigured()) ? {} : { verificationUrl })
    });
  })
);

authRouter.post(
  "/logout",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const auth = getAuth(res);
    await revokeSession(database, auth.sessionId);
    clearAuthCookies(res);
    res.status(204).send();
  })
);

authRouter.post(
  "/refresh-session",
  requireAuth,
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const session = await refreshSession(database, {
      sessionId: auth.sessionId,
      ipAddress: req.ip,
      userAgent: req.get("user-agent")
    });
    setAuthCookies(res, session);

    res.json({
      ...(await buildMePayload(database, auth.user.id, auth.sessionId)),
      csrfToken: session.csrfToken,
      session: {
        expiresAt: session.expiresAt.toISOString()
      }
    });
  })
);

authRouter.get("/me", ...getMeHandler);

function throwIfRateLimited(res: Response, hit: AuthRateLimitHit | null): void {
  if (!hit) return;

  res.set("Retry-After", String(hit.retryAfterSeconds));
  throw new TooManyRequestsError(`Too many auth attempts. Retry in ${hit.retryAfterSeconds} seconds.`, hit);
}

function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    preferredLanguage: row.preferred_language,
    globalRole: row.global_role
  };
}

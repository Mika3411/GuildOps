import type { Request, Response } from "express";
import { asyncHandler } from "../http/async-handler.js";
import { UnauthorizedError } from "../http/errors.js";
import { query } from "../db/pool.js";
import { env } from "../config/env.js";
import { assertRequestCsrf, needsCsrfCheck } from "./csrf.js";
import { hashCsrfToken, hashSessionToken } from "./sessions.js";

export type AuthContext = {
  sessionId: string;
  user: {
    id: string;
    email: string;
    displayName: string;
    preferredLanguage: string;
    globalRole: string;
  };
  csrfHash: string | null;
  csrfToken: string | null;
  activeOrganization: null | {
    id: string;
    name: string;
    slug: string;
    role: string;
  };
  activeGuild: null | {
    id: string;
    organizationId: string;
    name: string;
    slug: string;
    game: string | null;
    realm: string | null;
    roleCodes: string[];
  };
};

type AuthRow = {
  session_id: string;
  csrf_hash: string | null;
  user_id: string;
  email: string;
  display_name: string;
  preferred_language: string;
  global_role: string;
  active_organization_id: string | null;
  active_organization_name: string | null;
  active_organization_slug: string | null;
  active_organization_role: string | null;
  active_guild_id: string | null;
  active_guild_organization_id: string | null;
  active_guild_name: string | null;
  active_guild_slug: string | null;
  active_guild_game: string | null;
  active_guild_realm: string | null;
  active_guild_role_codes: string[] | null;
};

export const requireAuth = asyncHandler(async (req, res, next) => {
  const { token, source } = getSessionToken(req);

  if (!token) {
    throw new UnauthorizedError("Session cookie is required");
  }

  const tokenHash = hashSessionToken(token);
  const result = await query<AuthRow>(
    `
      SELECT
        s.id::text AS session_id,
        s.csrf_hash,
        u.id AS user_id,
        u.email::text AS email,
        u.display_name,
        u.preferred_language,
        u.global_role,
        ao.id::text AS active_organization_id,
        ao.name AS active_organization_name,
        ao.slug::text AS active_organization_slug,
        aom.organization_role AS active_organization_role,
        ag.id::text AS active_guild_id,
        ag.organization_id::text AS active_guild_organization_id,
        ag.name AS active_guild_name,
        ag.slug::text AS active_guild_slug,
        game.name AS active_guild_game,
        server.code AS active_guild_realm,
        COALESCE(active_roles.role_codes, ARRAY[]::text[]) AS active_guild_role_codes
      FROM user_sessions s
      JOIN users u ON u.id = s.user_id
      LEFT JOIN organizations ao ON ao.id = s.active_organization_id
      LEFT JOIN organization_members aom
        ON aom.organization_id = ao.id
       AND aom.user_id = u.id
      LEFT JOIN guilds ag
        ON ag.id = s.active_guild_id
       AND ag.deleted_at IS NULL
      LEFT JOIN games game ON game.id = ag.game_id
      LEFT JOIN servers server ON server.id = ag.server_id
      LEFT JOIN LATERAL (
        SELECT array_agg(roles.code::text ORDER BY roles.rank DESC, roles.name) AS role_codes
        FROM guild_members gm
        JOIN guild_member_roles gmr ON gmr.guild_member_id = gm.id
        JOIN roles ON roles.id = gmr.role_id
        WHERE gm.guild_id = ag.id
          AND gm.user_id = u.id
      ) active_roles ON true
      WHERE s.session_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
        AND u.disabled_at IS NULL
        AND u.email_verified_at IS NOT NULL
      LIMIT 1
    `,
    [tokenHash]
  );

  const row = result.rows[0];

  if (!row) {
    throw new UnauthorizedError("Session is invalid or expired");
  }

  if (source === "cookie" && needsCsrfCheck(req)) {
    assertRequestCsrf(req, row.csrf_hash);
  }

  const csrfToken = getValidCsrfToken(req, row.csrf_hash);

  res.locals.auth = {
    sessionId: row.session_id,
    csrfHash: row.csrf_hash,
    csrfToken,
    user: {
      id: row.user_id,
      email: row.email,
      displayName: row.display_name,
      preferredLanguage: row.preferred_language,
      globalRole: row.global_role
    },
    activeOrganization: row.active_organization_id
      ? {
          id: row.active_organization_id,
          name: row.active_organization_name ?? "",
          slug: row.active_organization_slug ?? "",
          role: row.active_organization_role ?? "member"
        }
      : null,
    activeGuild: row.active_guild_id
      ? {
          id: row.active_guild_id,
          organizationId: row.active_guild_organization_id ?? "",
          name: row.active_guild_name ?? "",
          slug: row.active_guild_slug ?? "",
          game: row.active_guild_game,
          realm: row.active_guild_realm,
          roleCodes: row.active_guild_role_codes ?? []
        }
      : null
  } satisfies AuthContext;

  next();
});

export function getAuth(res: Response): AuthContext {
  const auth = res.locals.auth as AuthContext | undefined;

  if (!auth) {
    throw new UnauthorizedError("Authentication required");
  }

  return auth;
}

function getSessionToken(req: Request): { token?: string; source?: "cookie" | "bearer" } {
  const cookieToken = (req.cookies as Record<string, string | undefined> | undefined)?.[env.SESSION_COOKIE_NAME];

  if (cookieToken) {
    return { token: cookieToken, source: "cookie" };
  }

  const header = req.get("authorization");

  if (!header) {
    return {};
  }

  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? { token, source: "bearer" } : {};
}

function getValidCsrfToken(req: Request, expectedCsrfHash: string | null): string | null {
  const cookieToken = (req.cookies as Record<string, string | undefined> | undefined)?.[env.CSRF_COOKIE_NAME];

  if (!cookieToken || !expectedCsrfHash) {
    return null;
  }

  return hashCsrfToken(cookieToken) === expectedCsrfHash ? cookieToken : null;
}

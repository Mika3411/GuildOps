import type { Queryable } from "../db/pool.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../http/errors.js";

type UserRow = {
  id: string;
  email: string;
  display_name: string;
  preferred_language: string;
  global_role: string;
  email_verified_at: string | null;
};

type SessionContextRow = {
  active_organization_id: string | null;
  active_guild_id: string | null;
};

type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  role: string;
  is_active: boolean;
};

type GuildRow = {
  id: string;
  organization_id: string;
  name: string;
  tag: string | null;
  slug: string;
  language: string;
  style: string | null;
  game: string;
  realm: string | null;
  organization_role: string;
  member_id: string | null;
  role_codes: string[] | null;
  is_active: boolean;
};

export type MePayload = Awaited<ReturnType<typeof buildMePayload>>;

export async function buildMePayload(db: Queryable, userId: string, sessionId?: string) {
  const [userResult, contextResult, organizationsResult, guildsResult] = await Promise.all([
    db.query<UserRow>(
      `
        SELECT id::text, email::text, display_name, preferred_language, global_role, email_verified_at::text
        FROM users
        WHERE id = $1
          AND disabled_at IS NULL
          AND email_verified_at IS NOT NULL
        LIMIT 1
      `,
      [userId]
    ),
    sessionId
      ? db.query<SessionContextRow>(
          `
            SELECT
              active_organization_id::text,
              active_guild_id::text
            FROM user_sessions
            WHERE id = $1
              AND user_id = $2
              AND revoked_at IS NULL
            LIMIT 1
          `,
          [sessionId, userId]
        )
      : Promise.resolve({ rows: [] } as unknown as Awaited<ReturnType<Queryable["query"]>>),
    db.query<OrganizationRow>(
      `
        SELECT
          o.id::text,
          o.name,
          o.slug::text,
          om.organization_role AS role,
          false AS is_active
        FROM organization_members om
        JOIN organizations o ON o.id = om.organization_id
        WHERE om.user_id = $1
        ORDER BY o.created_at ASC
      `,
      [userId]
    ),
    db.query<GuildRow>(
      `
        SELECT
          g.id::text,
          g.organization_id::text,
          g.name,
          g.tag,
          g.slug::text,
          g.default_language AS language,
          g.play_style AS style,
          game.name AS game,
          server.code AS realm,
          om.organization_role,
          gm.id::text AS member_id,
          COALESCE(array_remove(array_agg(DISTINCT roles.code::text), NULL), ARRAY[]::text[]) AS role_codes,
          false AS is_active
        FROM organization_members om
        JOIN guilds g ON g.organization_id = om.organization_id
        JOIN games game ON game.id = g.game_id
        LEFT JOIN servers server ON server.id = g.server_id
        LEFT JOIN guild_members gm
          ON gm.guild_id = g.id
         AND gm.user_id = om.user_id
         AND gm.status <> 'banned'
        LEFT JOIN guild_member_roles gmr ON gmr.guild_member_id = gm.id
        LEFT JOIN roles ON roles.id = gmr.role_id
        WHERE om.user_id = $1
          AND g.deleted_at IS NULL
          AND (
            om.organization_role IN ('owner', 'admin')
            OR gm.id IS NOT NULL
          )
        GROUP BY
          g.id,
          game.name,
          server.code,
          om.organization_role,
          gm.id
        ORDER BY g.created_at ASC
      `,
      [userId]
    )
  ]);

  const user = userResult.rows[0];

  if (!user) {
    throw new NotFoundError("User not found");
  }

  const sessionContext = contextResult.rows[0];
  const requestedOrganizationId = organizationsResult.rows.some(
    (organization) => organization.id === sessionContext?.active_organization_id
  )
    ? sessionContext?.active_organization_id ?? null
    : null;
  const requestedGuildId = guildsResult.rows.some((guild) => guild.id === sessionContext?.active_guild_id)
    ? sessionContext?.active_guild_id ?? null
    : null;
  const activeGuildId =
    requestedGuildId ??
    (requestedOrganizationId
      ? guildsResult.rows.find((guild) => guild.organization_id === requestedOrganizationId)?.id
      : guildsResult.rows[0]?.id) ??
    null;
  const activeGuildRow = guildsResult.rows.find((guild) => guild.id === activeGuildId);
  const activeOrganizationId =
    requestedOrganizationId ?? activeGuildRow?.organization_id ?? organizationsResult.rows[0]?.id ?? null;
  const organizations = organizationsResult.rows.map((organization) => ({
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    role: organization.role,
    isActive: organization.id === activeOrganizationId
  }));
  const guilds = guildsResult.rows.map((guild) => ({
    id: guild.id,
    organizationId: guild.organization_id,
    name: guild.name,
    tag: guild.tag,
    slug: guild.slug,
    language: guild.language,
    style: guild.style,
    game: guild.game,
    realm: guild.realm,
    status: "online",
    organizationRole: guild.organization_role,
    memberId: guild.member_id,
    roleCodes: guild.role_codes ?? [],
    roles: resolveSubjectRoles(user.global_role, guild.organization_role, guild.role_codes ?? []),
    isActive: guild.id === activeGuildId
  }));
  const activeOrganization = organizations.find((organization) => organization.isActive) ?? organizations[0] ?? null;
  const activeGuild = guilds.find((guild) => guild.isActive) ?? guilds[0] ?? null;
  const roles = resolveSubjectRoles(user.global_role, activeOrganization?.role, activeGuild?.roleCodes ?? []);

  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      emailVerifiedAt: user.email_verified_at,
      initials: getInitials(user.display_name),
      preferredLanguage: user.preferred_language,
      globalRole: user.global_role,
      role: roles[0] ?? "membre",
      roles
    },
    context: {
      activeOrganization,
      activeGuild
    },
    organizations,
    guilds
  };
}

export async function setActiveContext(
  db: Queryable,
  input: {
    sessionId: string;
    userId: string;
    activeOrganizationId?: string | null;
    activeGuildId?: string | null;
  }
): Promise<void> {
  let nextOrganizationId = input.activeOrganizationId;
  let nextGuildId = input.activeGuildId;

  if (nextGuildId) {
    const guildResult = await db.query<{ id: string; organization_id: string }>(
      `
        SELECT g.id::text, g.organization_id::text
        FROM guilds g
        JOIN organization_members om ON om.organization_id = g.organization_id
        LEFT JOIN guild_members gm
          ON gm.guild_id = g.id
         AND gm.user_id = om.user_id
         AND gm.status <> 'banned'
        WHERE g.id = $1
          AND om.user_id = $2
          AND g.deleted_at IS NULL
          AND (
            om.organization_role IN ('owner', 'admin')
            OR gm.id IS NOT NULL
          )
        LIMIT 1
      `,
      [nextGuildId, input.userId]
    );
    const guild = guildResult.rows[0];

    if (!guild) {
      throw new ForbiddenError("You cannot activate this guild");
    }

    if (nextOrganizationId && nextOrganizationId !== guild.organization_id) {
      throw new BadRequestError("Active guild must belong to the active organization");
    }

    nextOrganizationId = guild.organization_id;
  }

  if (nextOrganizationId) {
    const orgResult = await db.query<{ id: string }>(
      `
        SELECT organization_id::text AS id
        FROM organization_members
        WHERE organization_id = $1
          AND user_id = $2
        LIMIT 1
      `,
      [nextOrganizationId, input.userId]
    );

    if (!orgResult.rows[0]) {
      throw new ForbiddenError("You cannot activate this organization");
    }
  }

  await db.query(
    `
      UPDATE user_sessions
      SET active_organization_id = COALESCE($2, active_organization_id),
          active_guild_id = $3,
          refreshed_at = now()
      WHERE id = $1
        AND user_id = $4
        AND revoked_at IS NULL
    `,
    [input.sessionId, nextOrganizationId ?? null, nextGuildId ?? null, input.userId]
  );
}

export async function getDefaultSessionContext(
  db: Queryable,
  userId: string
): Promise<{ activeOrganizationId: string | null; activeGuildId: string | null }> {
  const result = await db.query<{ organization_id: string | null; guild_id: string | null }>(
    `
      SELECT
        om.organization_id::text,
        (
          SELECT g.id::text
          FROM guilds g
          LEFT JOIN guild_members gm
            ON gm.guild_id = g.id
           AND gm.user_id = om.user_id
           AND gm.status <> 'banned'
          WHERE g.organization_id = om.organization_id
            AND g.deleted_at IS NULL
            AND (
              om.organization_role IN ('owner', 'admin')
              OR gm.id IS NOT NULL
            )
          ORDER BY g.created_at ASC
          LIMIT 1
        ) AS guild_id
      FROM organization_members om
      WHERE om.user_id = $1
      ORDER BY om.created_at ASC
      LIMIT 1
    `,
    [userId]
  );
  const row = result.rows[0];

  return {
    activeOrganizationId: row?.organization_id ?? null,
    activeGuildId: row?.guild_id ?? null
  };
}

function resolveSubjectRoles(globalRole: string, organizationRole?: string | null, guildRoleCodes: string[] = []): string[] {
  if (globalRole === "admin") {
    return ["admin"];
  }

  if (guildRoleCodes.length > 0) {
    return guildRoleCodes;
  }

  if (organizationRole === "owner" || organizationRole === "admin") {
    return ["admin"];
  }

  return ["membre"];
}

function getInitials(displayName: string): string {
  return displayName
    .split(/[\s_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

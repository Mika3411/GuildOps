import { Router } from "express";
import { z } from "zod";
import { database, query, withClient, type Queryable } from "../db/pool.js";
import { asyncHandler } from "../http/async-handler.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../http/errors.js";
import { validate } from "../http/validate.js";
import { getAuth, requireAuth } from "../security/auth.js";
import { assertGuildAccess, assertOrganizationAccess } from "./access.js";
import { seedDefaultGuildModules } from "./guild-modules.service.js";
import { languageSchema, slugify, slugSchema, uuidSchema } from "./helpers.js";

export const guildsRouter = Router();

const createGuildBodySchema = z
  .object({
    organizationId: uuidSchema,
    name: z.string().trim().min(2).max(120),
    tag: z.string().trim().min(1).max(12).optional(),
    slug: slugSchema.optional(),
    gameName: z.string().trim().min(2).max(120),
    serverCode: z.string().trim().min(1).max(40).optional(),
    serverName: z.string().trim().min(1).max(120).optional(),
    serverRegion: z.string().trim().min(1).max(60).optional(),
    timezone: z.string().trim().min(1).max(80).default("UTC"),
    defaultLanguage: languageSchema.optional().default("fr"),
    playStyle: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(2000).optional(),
    isPublic: z.boolean().default(false)
  })
  .strict();

const guildIdParamsSchema = z.object({
  guildId: uuidSchema
});

const createGuildMemberBodySchema = z
  .object({
    userId: uuidSchema.optional(),
    email: z.string().email().max(320).transform((value) => value.toLowerCase()).optional(),
    nickname: z.string().trim().min(1).max(80),
    status: z.enum(["invited", "active", "inactive", "left"]).default("active"),
    roleCodes: z.array(z.string().trim().min(1).max(48).transform((value) => value.toLowerCase())).max(12).optional()
  })
  .strict();

const publishGuildSiteBodySchema = z
  .object({
    publicSlug: slugSchema.optional(),
    public_slug: slugSchema.optional(),
    title: z.string().trim().min(1).max(160),
    guildName: z.string().trim().min(1).max(120).optional(),
    guild_name: z.string().trim().min(1).max(120).optional(),
    game: z.string().trim().min(1).max(120).optional(),
    realm: z.string().trim().max(80).optional(),
    tagline: z.string().trim().max(240).optional(),
    objective: z.string().trim().max(500).optional(),
    heroText: z.string().trim().max(500).optional(),
    hero_text: z.string().trim().max(500).optional(),
    theme: z.string().trim().min(1).max(80).optional(),
    colors: z.record(z.string(), z.unknown()).optional(),
    colors_json: z.record(z.string(), z.unknown()).optional(),
    typography: z.record(z.string(), z.unknown()).optional(),
    typography_json: z.record(z.string(), z.unknown()).optional(),
    sections: z.record(z.string(), z.unknown()).optional(),
    sections_json: z.record(z.string(), z.unknown()).optional(),
    themeJson: z.record(z.string(), z.unknown()).optional(),
    theme_json: z.record(z.string(), z.unknown()).optional(),
    pagesJson: z.record(z.string(), z.unknown()).optional(),
    pages_json: z.record(z.string(), z.unknown()).optional(),
    seoJson: z.record(z.string(), z.unknown()).optional(),
    seo_json: z.record(z.string(), z.unknown()).optional(),
    status: z.enum(["draft", "published", "archived"]).default("published")
  })
  .passthrough();

guildsRouter.get(
  "/guilds",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const auth = getAuth(res);
    const result = await query(
      `
        SELECT
          g.id::text,
          g.name,
          g.tag,
          g.slug::text,
          g.default_language AS "defaultLanguage",
          g.play_style AS "playStyle",
          g.description,
          g.is_public AS "isPublic",
          o.id::text AS "organizationId",
          o.name AS "organizationName",
          ga.name AS game,
          s.code AS server,
          om.organization_role AS "organizationRole",
          gm.id::text AS "memberId",
          g.created_at AS "createdAt"
        FROM organization_members om
        JOIN organizations o ON o.id = om.organization_id
        JOIN guilds g ON g.organization_id = o.id
        JOIN games ga ON ga.id = g.game_id
        LEFT JOIN servers s ON s.id = g.server_id
        LEFT JOIN guild_members gm
          ON gm.guild_id = g.id
         AND gm.user_id = om.user_id
         AND gm.status <> 'banned'
        WHERE om.user_id = $1
          AND g.deleted_at IS NULL
          AND (
            om.organization_role IN ('owner', 'admin')
            OR gm.id IS NOT NULL
          )
        ORDER BY g.created_at DESC
      `,
      [auth.user.id]
    );

    res.json({ guilds: result.rows });
  })
);

guildsRouter.post(
  "/guilds",
  requireAuth,
  validate({ body: createGuildBodySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const body = req.body as z.infer<typeof createGuildBodySchema>;
    const guildSlug = body.slug ?? slugify(body.name);

    const guild = await withClient(async (client) => {
      await client.query("BEGIN");

      try {
        await assertOrganizationAccess(client, body.organizationId, auth.user.id, ["owner", "admin"]);

        const gameResult = await client.query<{ id: string }>(
          `
            INSERT INTO games (name, slug)
            VALUES ($1, $2)
            ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
            RETURNING id::text
          `,
          [body.gameName, slugify(body.gameName)]
        );
        const game = gameResult.rows[0];

        if (!game) {
          throw new BadRequestError("Game could not be created");
        }

        let serverId: string | null = null;

        if (body.serverCode) {
          const serverResult = await client.query<{ id: string }>(
            `
              INSERT INTO servers (game_id, code, name, region, timezone)
              VALUES ($1, $2, $3, $4, $5)
              ON CONFLICT (game_id, code)
              DO UPDATE SET
                name = COALESCE(EXCLUDED.name, servers.name),
                region = COALESCE(EXCLUDED.region, servers.region),
                timezone = EXCLUDED.timezone
              RETURNING id::text
            `,
            [game.id, body.serverCode, body.serverName ?? null, body.serverRegion ?? null, body.timezone]
          );
          serverId = serverResult.rows[0]?.id ?? null;
        }

        const guildResult = await client.query(
          `
            INSERT INTO guilds (
              organization_id,
              game_id,
              server_id,
              name,
              tag,
              slug,
              default_language,
              play_style,
              description,
              is_public,
              created_by
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING
              id::text,
              organization_id::text AS "organizationId",
              name,
              tag,
              slug::text,
              default_language AS "defaultLanguage",
              play_style AS "playStyle",
              description,
              is_public AS "isPublic",
              created_at AS "createdAt"
          `,
          [
            body.organizationId,
            game.id,
            serverId,
            body.name,
            body.tag ?? null,
            guildSlug,
            body.defaultLanguage,
            body.playStyle ?? null,
            body.description ?? null,
            body.isPublic,
            auth.user.id
          ]
        );
        const createdGuild = guildResult.rows[0];

        if (!createdGuild) {
          throw new BadRequestError("Guild could not be created");
        }

        await client.query(
          `
            INSERT INTO guild_sites (guild_id, public_slug, title, hero_text, status, published_at)
            VALUES ($1, $2, $3, $4, $5, CASE WHEN $5 = 'published' THEN now() ELSE NULL END)
          `,
          [
            createdGuild.id,
            guildSlug,
            body.name,
            body.description ?? null,
            body.isPublic ? "published" : "draft"
          ]
        );

        await client.query("INSERT INTO banks (guild_id, server_id) VALUES ($1, $2)", [createdGuild.id, serverId]);
        await client.query("SELECT seed_guildops_default_roles($1, $2)", [body.organizationId, createdGuild.id]);
        await seedDefaultGuildModules(client, createdGuild.id, auth.user.id);

        const founderMemberResult = await client.query<{ id: string }>(
          `
            INSERT INTO guild_members (guild_id, user_id, nickname, status, joined_at)
            VALUES ($1, $2, $3, 'active', now())
            ON CONFLICT (guild_id, user_id)
            DO UPDATE SET status = 'active',
                          updated_at = now()
            RETURNING id::text
          `,
          [createdGuild.id, auth.user.id, auth.user.displayName]
        );
        const founderMemberId = founderMemberResult.rows[0]?.id;

        if (founderMemberId) {
          await client.query(
            `
              INSERT INTO guild_member_roles (guild_member_id, role_id, assigned_by)
              SELECT $1, roles.id, $2
              FROM roles
              WHERE roles.guild_id = $3
                AND roles.code::text = 'admin'
              ON CONFLICT DO NOTHING
            `,
            [founderMemberId, auth.user.id, createdGuild.id]
          );
        }

        await client.query("COMMIT");

        return createdGuild;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });

    res.status(201).json({ guild });
  })
);

guildsRouter.get(
  "/guilds/:guildId",
  requireAuth,
  validate({ params: guildIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId } = req.params as unknown as z.infer<typeof guildIdParamsSchema>;
    await assertGuildAccess(database, guildId, auth.user.id);

    const result = await query(
      `
        SELECT
          g.id::text,
          g.organization_id::text AS "organizationId",
          g.name,
          g.tag,
          g.slug::text,
          g.default_language AS "defaultLanguage",
          g.play_style AS "playStyle",
          g.description,
          g.logo_url AS "logoUrl",
          g.is_public AS "isPublic",
          ga.name AS game,
          s.code AS server,
          s.timezone,
          g.created_at AS "createdAt",
          g.updated_at AS "updatedAt"
        FROM guilds g
        JOIN games ga ON ga.id = g.game_id
        LEFT JOIN servers s ON s.id = g.server_id
        WHERE g.id = $1
          AND g.deleted_at IS NULL
        LIMIT 1
      `,
      [guildId]
    );

    res.json({ guild: result.rows[0] });
  })
);

guildsRouter.post(
  "/guilds/:guildId/site/publish",
  requireAuth,
  validate({ params: guildIdParamsSchema, body: publishGuildSiteBodySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId } = req.params as unknown as z.infer<typeof guildIdParamsSchema>;
    const body = req.body as z.infer<typeof publishGuildSiteBodySchema>;
    const access = await assertGuildAccess(database, guildId, auth.user.id);
    await assertCanManageSite(guildId, auth.user.id, access.organization_role, auth.user.globalRole);

    const publicSlug = body.publicSlug || body.public_slug || slugify(body.title);
    const guildName = body.guildName || body.guild_name || body.title;
    const heroText = body.heroText || body.hero_text || body.objective || body.tagline || "";
    const colors = body.colors || body.colors_json || {};
    const typography = body.typography || body.typography_json || {};
    const sections = body.sections || body.sections_json || {};
    const themeJson = body.themeJson || body.theme_json || { theme: body.theme || "camp-nord", colors, typography };
    const memberInviteUrl =
      stringBodyValue((body as Record<string, unknown>).memberInviteUrl) ||
      stringBodyValue((body as Record<string, unknown>).member_invite_url);
    let pagesJson = body.pagesJson || body.pages_json || {
      tagline: body.tagline || "",
      objective: body.objective || heroText,
      sections
    };
    const pageRecord = pagesJson as Record<string, unknown>;
    if (memberInviteUrl && !stringBodyValue(pageRecord.memberInviteUrl) && !stringBodyValue(pageRecord.member_invite_url)) {
      pagesJson = {
        ...pageRecord,
        memberInviteUrl,
        member_invite_url: memberInviteUrl
      };
    }
    const seoJson = body.seoJson || body.seo_json || {
      title: body.title,
      description: [body.tagline, body.objective || heroText].filter(Boolean).join(" ")
    };

    await query("UPDATE guilds SET is_public = $2, updated_at = now() WHERE id = $1", [
      guildId,
      body.status === "published"
    ]);

    const result = await query(
      `
        INSERT INTO guild_sites (
          guild_id,
          public_slug,
          title,
          guild_name,
          game,
          realm,
          tagline,
          objective,
          theme,
          colors_json,
          typography_json,
          sections_json,
          hero_text,
          theme_json,
          pages_json,
          seo_json,
          status,
          published_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          $10::jsonb, $11::jsonb, $12::jsonb, $13, $14::jsonb, $15::jsonb, $16::jsonb,
          $17,
          CASE WHEN $17 = 'published' THEN now() ELSE NULL END
        )
        ON CONFLICT (guild_id)
        DO UPDATE SET
          public_slug = EXCLUDED.public_slug,
          title = EXCLUDED.title,
          guild_name = EXCLUDED.guild_name,
          game = EXCLUDED.game,
          realm = EXCLUDED.realm,
          tagline = EXCLUDED.tagline,
          objective = EXCLUDED.objective,
          theme = EXCLUDED.theme,
          colors_json = EXCLUDED.colors_json,
          typography_json = EXCLUDED.typography_json,
          sections_json = EXCLUDED.sections_json,
          hero_text = EXCLUDED.hero_text,
          theme_json = EXCLUDED.theme_json,
          pages_json = EXCLUDED.pages_json,
          seo_json = EXCLUDED.seo_json,
          status = EXCLUDED.status,
          published_at = CASE WHEN EXCLUDED.status = 'published' THEN now() ELSE guild_sites.published_at END,
          updated_at = now()
        RETURNING
          id::text,
          guild_id::text AS "guildId",
          public_slug::text AS "publicSlug",
          title,
          guild_name AS "guildName",
          game,
          realm,
          tagline,
          objective,
          theme,
          colors_json AS colors,
          typography_json AS typography,
          sections_json AS sections,
          hero_text AS "heroText",
          theme_json AS "themeJson",
          pages_json AS "pagesJson",
          seo_json AS "seoJson",
          status,
          (status = 'published') AS published,
          published_at AS "publishedAt"
      `,
      [
        guildId,
        publicSlug,
        body.title,
        guildName,
        body.game ?? "",
        body.realm ?? "",
        body.tagline ?? "",
        body.objective ?? heroText,
        body.theme ?? "camp-nord",
        JSON.stringify(colors),
        JSON.stringify(typography),
        JSON.stringify(sections),
        heroText,
        JSON.stringify(themeJson),
        JSON.stringify(pagesJson),
        JSON.stringify(seoJson),
        body.status
      ]
    );

    res.json({ site: result.rows[0] });
  })
);

guildsRouter.get(
  "/guilds/:guildId/members",
  requireAuth,
  validate({ params: guildIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId } = req.params as unknown as z.infer<typeof guildIdParamsSchema>;
    await assertGuildAccess(database, guildId, auth.user.id);

    const result = await query<GuildMemberRow>(
      `
        SELECT
          gm.id::text,
          gm.user_id::text,
          gm.nickname,
          gm.external_game_id,
          gm.power_score::text,
          gm.language,
          gm.timezone,
          gm.status,
          gm.joined_at::text,
          gm.created_at::text,
          gm.updated_at::text,
          u.email::text,
          u.display_name,
          COALESCE(array_remove(array_agg(DISTINCT roles.code::text), NULL), ARRAY[]::text[]) AS role_codes
        FROM guild_members gm
        LEFT JOIN users u ON u.id = gm.user_id
        LEFT JOIN guild_member_roles gmr ON gmr.guild_member_id = gm.id
        LEFT JOIN roles ON roles.id = gmr.role_id
        WHERE gm.guild_id = $1
          AND gm.status <> 'banned'
        GROUP BY gm.id, u.id
        ORDER BY
          CASE gm.status WHEN 'active' THEN 0 WHEN 'invited' THEN 1 ELSE 2 END,
          gm.nickname ASC
      `,
      [guildId]
    );

    res.json({ members: result.rows.map(mapGuildMember) });
  })
);

guildsRouter.post(
  "/guilds/:guildId/members",
  requireAuth,
  validate({ params: guildIdParamsSchema, body: createGuildMemberBodySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId } = req.params as unknown as z.infer<typeof guildIdParamsSchema>;
    const body = req.body as z.infer<typeof createGuildMemberBodySchema>;
    const access = await assertGuildAccess(database, guildId, auth.user.id);
    await assertCanManageGuildMembers(guildId, auth.user.id, access.organization_role, auth.user.globalRole);
    const requestedRoleCodes = body.roleCodes !== undefined ? Array.from(new Set(body.roleCodes)) : null;
    const roleManagementAccess = requestedRoleCodes !== null
      ? await assertCanManageGuildRoles(guildId, auth.user.id, access.organization_role, auth.user.globalRole)
      : null;

    const memberId = await withClient(async (client) => {
      await client.query("BEGIN");

      try {
        let userId = body.userId ?? null;

        if (!userId && body.email) {
          const userResult = await client.query<{ id: string }>(
            `
              SELECT id::text
              FROM users
              WHERE email = $1
                AND disabled_at IS NULL
              LIMIT 1
            `,
            [body.email]
          );
          userId = userResult.rows[0]?.id ?? null;
        }

        if (body.userId) {
          const userResult = await client.query<{ id: string }>(
            `
              SELECT id::text
              FROM users
              WHERE id = $1
                AND disabled_at IS NULL
              LIMIT 1
            `,
            [body.userId]
          );

          if (!userResult.rows[0]) {
            throw new NotFoundError("User not found");
          }
        }

        const memberResult = userId
          ? await client.query<GuildMemberRow>(
              `
                INSERT INTO guild_members (guild_id, user_id, invited_by, nickname, status, joined_at)
                VALUES ($1, $2, $3, $4, $5, CASE WHEN $5 = 'active' THEN now() ELSE NULL END)
                ON CONFLICT (guild_id, user_id)
                DO UPDATE SET
                  nickname = EXCLUDED.nickname,
                  status = EXCLUDED.status,
                  joined_at = COALESCE(guild_members.joined_at, EXCLUDED.joined_at),
                  updated_at = now()
                RETURNING
                  id::text,
                  user_id::text,
                  nickname,
                  external_game_id,
                  power_score::text,
                  language,
                  timezone,
                  status,
                  joined_at::text,
                  created_at::text,
                  updated_at::text,
                  NULL::text AS email,
                  NULL::text AS display_name,
                  ARRAY[]::text[] AS role_codes
              `,
              [guildId, userId, auth.user.id, body.nickname, body.status]
            )
          : await client.query<GuildMemberRow>(
              `
                INSERT INTO guild_members (guild_id, invited_by, nickname, status, joined_at)
                VALUES ($1, $2, $3, $4, CASE WHEN $4 = 'active' THEN now() ELSE NULL END)
                ON CONFLICT (guild_id, nickname)
                DO UPDATE SET
                  status = EXCLUDED.status,
                  joined_at = COALESCE(guild_members.joined_at, EXCLUDED.joined_at),
                  updated_at = now()
                RETURNING
                  id::text,
                  user_id::text,
                  nickname,
                  external_game_id,
                  power_score::text,
                  language,
                  timezone,
                  status,
                  joined_at::text,
                  created_at::text,
                  updated_at::text,
                  NULL::text AS email,
                  NULL::text AS display_name,
                  ARRAY[]::text[] AS role_codes
              `,
              [guildId, auth.user.id, body.nickname, body.status]
            );
        const createdMember = memberResult.rows[0];

        if (!createdMember) {
          throw new BadRequestError("Guild member could not be created");
        }

        if (requestedRoleCodes !== null) {
          if (createdMember.user_id === auth.user.id) {
            throw new ForbiddenError("Cannot assign roles to yourself");
          }

          const rolesToAssign = await getAssignableGuildRoles(client, guildId, requestedRoleCodes, roleManagementAccess);

          await client.query("DELETE FROM guild_member_roles WHERE guild_member_id = $1", [createdMember.id]);

          if (rolesToAssign.length > 0) {
            await client.query(
              `
                INSERT INTO guild_member_roles (guild_member_id, role_id, assigned_by)
                SELECT $1, requested.role_id, $2
                FROM unnest($3::uuid[]) AS requested(role_id)
                ON CONFLICT DO NOTHING
              `,
              [createdMember.id, auth.user.id, rolesToAssign.map((role) => role.id)]
            );
          }
        }

        await client.query("COMMIT");
        return createdMember.id;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
    const member = await getGuildMember(memberId);

    res.status(201).json({ member });
  })
);

type GuildMemberRow = {
  id: string;
  user_id: string | null;
  nickname: string;
  external_game_id: string | null;
  power_score: string | null;
  language: string | null;
  timezone: string | null;
  status: string;
  joined_at: string | null;
  created_at: string;
  updated_at: string;
  email: string | null;
  display_name: string | null;
  role_codes: string[] | null;
};

type GuildRoleRow = {
  id: string;
  code: string;
  rank: number;
};

type RoleManagementAccess = {
  canAssignAnyRank: boolean;
  maxRoleRank: number | null;
};

async function assertCanManageGuildMembers(
  guildId: string,
  userId: string,
  organizationRole: string,
  globalRole: string
): Promise<void> {
  if (globalRole === "admin" || ["owner", "admin"].includes(organizationRole)) {
    return;
  }

  const result = await query<{ allowed: boolean }>(
    `
      SELECT true AS allowed
      FROM guild_members gm
      JOIN guild_member_roles gmr ON gmr.guild_member_id = gm.id
      JOIN role_permissions rp ON rp.role_id = gmr.role_id
      JOIN permissions p ON p.id = rp.permission_id
      WHERE gm.guild_id = $1
        AND gm.user_id = $2
        AND gm.status = 'active'
        AND p.key IN ('manage_members', 'admin_all')
      LIMIT 1
    `,
    [guildId, userId]
  );

  if (!result.rows[0]?.allowed) {
    throw new ForbiddenError("Permission manage_members is required");
  }
}

async function assertCanManageGuildRoles(
  guildId: string,
  userId: string,
  organizationRole: string,
  globalRole: string
): Promise<RoleManagementAccess> {
  if (globalRole === "admin" || ["owner", "admin"].includes(organizationRole)) {
    return { canAssignAnyRank: true, maxRoleRank: null };
  }

  const result = await query<{
    has_permission: boolean;
    has_admin_all: boolean;
    max_role_rank: number | null;
  }>(
    `
      WITH actor_roles AS (
        SELECT roles.id, roles.rank
        FROM guild_members gm
        JOIN guild_member_roles gmr ON gmr.guild_member_id = gm.id
        JOIN roles ON roles.id = gmr.role_id
        WHERE gm.guild_id = $1
          AND gm.user_id = $2
          AND gm.status = 'active'
      )
      SELECT
        COALESCE(bool_or(p.key IN ('manage_roles', 'admin_all')), false) AS has_permission,
        COALESCE(bool_or(p.key = 'admin_all'), false) AS has_admin_all,
        MAX(actor_roles.rank)::int AS max_role_rank
      FROM actor_roles
      LEFT JOIN role_permissions rp ON rp.role_id = actor_roles.id
      LEFT JOIN permissions p ON p.id = rp.permission_id
    `,
    [guildId, userId]
  );

  const row = result.rows[0];

  if (!row?.has_permission) {
    throw new ForbiddenError("Permission manage_roles is required");
  }

  return {
    canAssignAnyRank: row.has_admin_all,
    maxRoleRank: row.max_role_rank
  };
}

async function getAssignableGuildRoles(
  db: Queryable,
  guildId: string,
  roleCodes: string[],
  access: RoleManagementAccess | null
): Promise<GuildRoleRow[]> {
  if (!access) {
    throw new ForbiddenError("Permission manage_roles is required");
  }

  if (roleCodes.length === 0) {
    return [];
  }

  const result = await db.query<GuildRoleRow>(
    `
      SELECT roles.id::text, lower(roles.code::text) AS code, roles.rank
      FROM roles
      JOIN guilds g ON g.id = $1
      WHERE lower(roles.code::text) = ANY($2::text[])
        AND (
          roles.guild_id = g.id
          OR (roles.guild_id IS NULL AND roles.organization_id = g.organization_id)
        )
    `,
    [guildId, roleCodes]
  );

  const matchedRoleCodes = new Set(result.rows.map((role) => role.code));
  const missingRoleCodes = roleCodes.filter((roleCode) => !matchedRoleCodes.has(roleCode));

  if (missingRoleCodes.length > 0) {
    throw new BadRequestError("One or more roles do not exist", { roleCodes: missingRoleCodes });
  }

  if (!access.canAssignAnyRank) {
    const blockedRoleCodes = result.rows
      .filter((role) => access.maxRoleRank === null || role.rank > access.maxRoleRank)
      .map((role) => role.code);

    if (blockedRoleCodes.length > 0) {
      throw new ForbiddenError("Cannot assign roles above your role rank", { roleCodes: blockedRoleCodes });
    }
  }

  return result.rows;
}

async function assertCanManageSite(
  guildId: string,
  userId: string,
  organizationRole: string,
  globalRole: string
): Promise<void> {
  if (globalRole === "admin" || ["owner", "admin"].includes(organizationRole)) {
    return;
  }

  const result = await query<{ allowed: boolean }>(
    `
      SELECT true AS allowed
      FROM guild_members gm
      JOIN guild_member_roles gmr ON gmr.guild_member_id = gm.id
      JOIN role_permissions rp ON rp.role_id = gmr.role_id
      JOIN permissions p ON p.id = rp.permission_id
      WHERE gm.guild_id = $1
        AND gm.user_id = $2
        AND gm.status = 'active'
        AND p.key IN ('manage_site', 'admin_all')
      LIMIT 1
    `,
    [guildId, userId]
  );

  if (!result.rows[0]?.allowed) {
    throw new ForbiddenError("Permission manage_site is required");
  }
}

async function getGuildMember(memberId: string) {
  const result = await query<GuildMemberRow>(
    `
      SELECT
        gm.id::text,
        gm.user_id::text,
        gm.nickname,
        gm.external_game_id,
        gm.power_score::text,
        gm.language,
        gm.timezone,
        gm.status,
        gm.joined_at::text,
        gm.created_at::text,
        gm.updated_at::text,
        u.email::text,
        u.display_name,
        COALESCE(array_remove(array_agg(DISTINCT roles.code::text), NULL), ARRAY[]::text[]) AS role_codes
      FROM guild_members gm
      LEFT JOIN users u ON u.id = gm.user_id
      LEFT JOIN guild_member_roles gmr ON gmr.guild_member_id = gm.id
      LEFT JOIN roles ON roles.id = gmr.role_id
      WHERE gm.id = $1
      GROUP BY gm.id, u.id
      LIMIT 1
    `,
    [memberId]
  );
  const member = result.rows[0];

  if (!member) {
    throw new NotFoundError("Guild member not found");
  }

  return mapGuildMember(member);
}

function mapGuildMember(row: GuildMemberRow) {
  return {
    id: row.id,
    userId: row.user_id,
    nickname: row.nickname,
    name: row.nickname,
    email: row.email,
    displayName: row.display_name,
    externalGameId: row.external_game_id,
    powerScore: row.power_score,
    power: row.power_score ?? "",
    language: row.language,
    timezone: row.timezone,
    status: row.status,
    joinedAt: row.joined_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    roleCodes: row.role_codes ?? []
  };
}

function stringBodyValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

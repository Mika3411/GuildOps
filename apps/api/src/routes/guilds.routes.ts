import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { database, query, withClient, type Queryable } from "../db/pool.js";
import { asyncHandler } from "../http/async-handler.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../http/errors.js";
import { validate } from "../http/validate.js";
import { getAuth, requireAuth } from "../security/auth.js";
import { assertGuildAccess, assertOrganizationAccess } from "./access.js";
import {
  isGuildModuleKey,
  listGuildModules,
  seedDefaultGuildModules,
  syncGuildModules,
  withDefaultGuildModuleKeys
} from "./guild-modules.service.js";
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

const memberIdParamsSchema = z.object({
  guildId: uuidSchema,
  memberId: uuidSchema
});

const memberBlockIdParamsSchema = z.object({
  guildId: uuidSchema,
  blockId: uuidSchema
});

const membershipRequestParamsSchema = z.object({
  guildId: uuidSchema,
  requestId: uuidSchema
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

const decideMembershipRequestBodySchema = z
  .object({
    decision: z.enum(["approved", "refused", "approve", "refuse"])
  })
  .strict();

const banGuildMemberBodySchema = z
  .object({
    reason: z.string().trim().max(500).optional(),
    block: z.boolean().default(true)
  })
  .strict();

const blockGuildMemberBodySchema = z
  .object({
    userId: uuidSchema.optional(),
    nickname: z.string().trim().min(1).max(80),
    reason: z.string().trim().max(500).optional()
  })
  .strict();

const unblockGuildMemberBodySchema = z
  .object({
    reason: z.string().trim().max(500).optional()
  })
  .strict()
  .default({});

const CLIENT_ONLY_GUILD_MODULE_KEYS = ["administration", "member_space", "shop"] as const;
const CLIENT_ONLY_GUILD_MODULE_KEY_SET = new Set<string>(CLIENT_ONLY_GUILD_MODULE_KEYS);
const enabledModulesSchema = z.array(z.string().trim().min(1).max(80)).max(20);

const guildModulesBodySchema = z
  .object({
    enabledModules: enabledModulesSchema.optional(),
    enabled_modules: enabledModulesSchema.optional(),
    modules: enabledModulesSchema.optional()
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
    inviteToken: z.string().trim().min(8).max(96).optional(),
    invite_token: z.string().trim().min(8).max(96).optional(),
    inviteRotatedAt: z.string().trim().nullish(),
    invite_rotated_at: z.string().trim().nullish(),
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
    enabledModules: enabledModulesSchema.optional(),
    enabled_modules: enabledModulesSchema.optional(),
    modules: enabledModulesSchema.optional(),
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
         AND gm.status NOT IN ('banned', 'left')
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

guildsRouter.get(
  "/guilds/:guildId/modules",
  requireAuth,
  validate({ params: guildIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId } = req.params as unknown as z.infer<typeof guildIdParamsSchema>;
    await assertGuildAccess(database, guildId, auth.user.id);

    const modules = await listGuildModules(database, guildId);

    res.json({
      modules,
      enabledModules: getEnabledGuildModuleKeys(modules)
    });
  })
);

guildsRouter.put(
  "/guilds/:guildId/modules",
  requireAuth,
  validate({ params: guildIdParamsSchema, body: guildModulesBodySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId } = req.params as unknown as z.infer<typeof guildIdParamsSchema>;
    const body = req.body as z.infer<typeof guildModulesBodySchema>;
    const moduleInput = getEnabledModuleInput(body);

    if (moduleInput === null) {
      throw new BadRequestError("enabledModules is required");
    }

    assertKnownGuildModuleInput(moduleInput);

    const access = await assertGuildAccess(database, guildId, auth.user.id);
    await assertCanManageSite(guildId, auth.user.id, access.organization_role, auth.user.globalRole);

    const enabledModules = await syncGuildModules(database, guildId, moduleInput, auth.user.id);
    const modules = await listGuildModules(database, guildId);

    res.json({ enabledModules, modules });
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
    const moduleInput = getEnabledModuleInput(body as Record<string, unknown>);
    if (moduleInput !== null) {
      assertKnownGuildModuleInput(moduleInput);
    }

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
    const inviteToken =
      normalizeInviteToken(body.inviteToken || body.invite_token) ||
      extractInviteToken(memberInviteUrl) ||
      createInviteToken();
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
        member_invite_url: memberInviteUrl,
        inviteToken,
        inviteRotatedAt: body.inviteRotatedAt || body.invite_rotated_at || new Date().toISOString()
      };
    }
    const seoJson = body.seoJson || body.seo_json || {
      title: body.title,
      description: [body.tagline, body.objective || heroText].filter(Boolean).join(" ")
    };

    const publishResult = await withClient(async (client) => {
      await client.query("BEGIN");

      try {
        await client.query("UPDATE guilds SET is_public = $2, updated_at = now() WHERE id = $1", [
          guildId,
          body.status === "published"
        ]);

        const result = await client.query(
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
              invite_token,
              invite_rotated_at,
              invite_rotated_by,
              theme_json,
              pages_json,
              seo_json,
              status,
              published_at
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9,
              $10::jsonb, $11::jsonb, $12::jsonb, $13, $14, now(), $15,
              $16::jsonb, $17::jsonb, $18::jsonb,
              $19,
              CASE WHEN $19 = 'published' THEN now() ELSE NULL END
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
              invite_token = COALESCE(NULLIF(guild_sites.invite_token, ''), EXCLUDED.invite_token),
              invite_rotated_at = COALESCE(guild_sites.invite_rotated_at, EXCLUDED.invite_rotated_at),
              invite_rotated_by = COALESCE(guild_sites.invite_rotated_by, EXCLUDED.invite_rotated_by),
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
              invite_token AS "inviteToken",
              invite_rotated_at AS "inviteRotatedAt",
              CONCAT('/join/', public_slug::text, '?invite=', invite_token) AS "memberInviteUrl",
              CONCAT('/join/', public_slug::text, '?invite=', invite_token) AS "member_invite_url",
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
            inviteToken,
            auth.user.id,
            JSON.stringify(themeJson),
            JSON.stringify(pagesJson),
            JSON.stringify(seoJson),
            body.status
          ]
        );
        const enabledModules = moduleInput !== null
          ? await syncGuildModules(client, guildId, moduleInput, auth.user.id)
          : null;

        await client.query("COMMIT");
        return { enabledModules, site: result.rows[0] };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });

    res.json({
      site: publishResult.site,
      ...(publishResult.enabledModules ? { enabledModules: publishResult.enabledModules } : {})
    });
  })
);

guildsRouter.post(
  "/guilds/:guildId/invite-link/rotate",
  requireAuth,
  validate({ params: guildIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId } = req.params as unknown as z.infer<typeof guildIdParamsSchema>;
    const access = await assertGuildAccess(database, guildId, auth.user.id);
    await assertCanManageInviteLink(guildId, auth.user.id, access.organization_role, auth.user.globalRole);

    const inviteToken = createInviteToken();
    const result = await query<{
      guildId: string;
      publicSlug: string;
      inviteToken: string;
      inviteRotatedAt: string;
      memberInviteUrl: string;
      member_invite_url: string;
    }>(
      `
        UPDATE guild_sites
        SET invite_token = $2,
            invite_rotated_at = now(),
            invite_rotated_by = $3,
            updated_at = now()
        WHERE guild_id = $1
        RETURNING
          guild_id::text AS "guildId",
          public_slug::text AS "publicSlug",
          invite_token AS "inviteToken",
          invite_rotated_at::text AS "inviteRotatedAt",
          CONCAT('/join/', public_slug::text, '?invite=', invite_token) AS "memberInviteUrl",
          CONCAT('/join/', public_slug::text, '?invite=', invite_token) AS "member_invite_url"
      `,
      [guildId, inviteToken, auth.user.id]
    );
    const invite = result.rows[0];

    if (!invite) {
      throw new NotFoundError("Publish the guild site before rotating its invite link");
    }

    res.json(invite);
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
          AND gm.status NOT IN ('banned', 'left')
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

guildsRouter.get(
  "/guilds/:guildId/member-blocks",
  requireAuth,
  validate({ params: guildIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId } = req.params as unknown as z.infer<typeof guildIdParamsSchema>;
    const access = await assertGuildAccess(database, guildId, auth.user.id);
    await assertCanManageGuildMembers(guildId, auth.user.id, access.organization_role, auth.user.globalRole);

    const result = await query<MemberBlockRow>(
      `
        SELECT
          block.id::text,
          block.guild_id::text,
          block.user_id::text,
          block.nickname,
          block.normalized_nickname::text,
          block.reason,
          block.blocked_by::text,
          blocker.display_name AS blocked_by_name,
          block.blocked_at::text,
          block.expires_at::text,
          block.lifted_at::text,
          block.lifted_by::text,
          lifter.display_name AS lifted_by_name,
          block.lift_reason,
          block.created_at::text,
          block.updated_at::text
        FROM guild_member_blocks block
        LEFT JOIN users blocker ON blocker.id = block.blocked_by
        LEFT JOIN users lifter ON lifter.id = block.lifted_by
        WHERE block.guild_id = $1
        ORDER BY
          CASE WHEN block.lifted_at IS NULL THEN 0 ELSE 1 END,
          block.blocked_at DESC
      `,
      [guildId]
    );

    res.json({ blocks: result.rows.map(mapMemberBlock) });
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

        await assertGuildJoinNotBlocked(client, guildId, userId, body.nickname);

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

guildsRouter.post(
  "/guilds/:guildId/members/:memberId/ban",
  requireAuth,
  validate({ params: memberIdParamsSchema, body: banGuildMemberBodySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId, memberId } = req.params as unknown as z.infer<typeof memberIdParamsSchema>;
    const body = req.body as z.infer<typeof banGuildMemberBodySchema>;
    const access = await assertGuildAccess(database, guildId, auth.user.id);
    await assertCanManageGuildMembers(guildId, auth.user.id, access.organization_role, auth.user.globalRole);

    const result = await withClient(async (client) => {
      await client.query("BEGIN");

      try {
        const memberResult = await client.query<GuildMemberRow>(
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
              ARRAY[]::text[] AS role_codes
            FROM guild_members gm
            LEFT JOIN users u ON u.id = gm.user_id
            WHERE gm.guild_id = $1
              AND gm.id = $2
            FOR UPDATE OF gm
          `,
          [guildId, memberId]
        );
        const targetMember = memberResult.rows[0];

        if (!targetMember) {
          throw new NotFoundError("Guild member not found");
        }

        if (targetMember.user_id === auth.user.id) {
          throw new ForbiddenError("Cannot ban yourself");
        }

        await client.query("DELETE FROM guild_member_roles WHERE guild_member_id = $1", [memberId]);

        await client.query(
          `
            UPDATE guild_members
            SET status = 'banned',
                updated_at = now()
            WHERE guild_id = $1
              AND id = $2
          `,
          [guildId, memberId]
        );

        let block: ReturnType<typeof mapMemberBlock> | null = null;

        if (body.block !== false) {
          const blockRow = await upsertActiveMemberBlock(client, {
            actorUserId: auth.user.id,
            guildId,
            nickname: targetMember.nickname,
            reason: body.reason || "Membre banni et bloque par moderation.",
            userId: targetMember.user_id
          });
          block = mapMemberBlock(blockRow);
        }

        await refusePendingMembershipRequests(client, {
          actorUserId: auth.user.id,
          guildId,
          nickname: targetMember.nickname,
          userId: targetMember.user_id
        });

        const member = await getGuildMember(memberId, client);

        await client.query("COMMIT");
        return { block, member };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });

    res.json(result);
  })
);

guildsRouter.post(
  "/guilds/:guildId/member-blocks",
  requireAuth,
  validate({ params: guildIdParamsSchema, body: blockGuildMemberBodySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId } = req.params as unknown as z.infer<typeof guildIdParamsSchema>;
    const body = req.body as z.infer<typeof blockGuildMemberBodySchema>;
    const access = await assertGuildAccess(database, guildId, auth.user.id);
    await assertCanManageGuildMembers(guildId, auth.user.id, access.organization_role, auth.user.globalRole);

    const blocked = await withClient(async (client) => {
      await client.query("BEGIN");

      try {
        if (body.userId === auth.user.id) {
          throw new ForbiddenError("Cannot block yourself");
        }

        const blockRow = await upsertActiveMemberBlock(client, {
          actorUserId: auth.user.id,
          guildId,
          nickname: body.nickname,
          reason: body.reason || "Joueur bloque par moderation.",
          userId: body.userId ?? null
        });

        await client.query(
          `
            DELETE FROM guild_member_roles
            WHERE guild_member_id IN (
              SELECT id
              FROM guild_members
              WHERE guild_id = $1
                AND (
                  ($2::uuid IS NOT NULL AND user_id = $2)
                  OR lower(nickname) = lower($3)
                )
            )
          `,
          [guildId, body.userId ?? null, normalizeBlockNickname(body.nickname)]
        );

        await client.query(
          `
            UPDATE guild_members
            SET status = 'banned',
                updated_at = now()
            WHERE guild_id = $1
              AND (
                ($2::uuid IS NOT NULL AND user_id = $2)
                OR lower(nickname) = lower($3)
              )
          `,
          [guildId, body.userId ?? null, normalizeBlockNickname(body.nickname)]
        );

        await refusePendingMembershipRequests(client, {
          actorUserId: auth.user.id,
          guildId,
          nickname: body.nickname,
          userId: body.userId ?? null
        });

        await client.query("COMMIT");
        return mapMemberBlock(blockRow);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });

    res.status(201).json({ block: blocked });
  })
);

guildsRouter.delete(
  "/guilds/:guildId/member-blocks/:blockId",
  requireAuth,
  validate({ params: memberBlockIdParamsSchema, body: unblockGuildMemberBodySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId, blockId } = req.params as unknown as z.infer<typeof memberBlockIdParamsSchema>;
    const body = req.body as z.infer<typeof unblockGuildMemberBodySchema>;
    const access = await assertGuildAccess(database, guildId, auth.user.id);
    await assertCanManageGuildMembers(guildId, auth.user.id, access.organization_role, auth.user.globalRole);

    const result = await query<MemberBlockRow>(
      `
        UPDATE guild_member_blocks block
        SET lifted_at = COALESCE(block.lifted_at, now()),
            lifted_by = COALESCE(block.lifted_by, $3),
            lift_reason = COALESCE(NULLIF($4, ''), block.lift_reason),
            updated_at = now()
        WHERE block.guild_id = $1
          AND block.id = $2
        RETURNING
          block.id::text,
          block.guild_id::text,
          block.user_id::text,
          block.nickname,
          block.normalized_nickname::text,
          block.reason,
          block.blocked_by::text,
          (SELECT display_name FROM users WHERE id = block.blocked_by) AS blocked_by_name,
          block.blocked_at::text,
          block.expires_at::text,
          block.lifted_at::text,
          block.lifted_by::text,
          $5::text AS lifted_by_name,
          block.lift_reason,
          block.created_at::text,
          block.updated_at::text
      `,
      [guildId, blockId, auth.user.id, body.reason || "", auth.user.displayName]
    );
    const block = result.rows[0];

    if (!block) {
      throw new NotFoundError("Member block not found");
    }

    res.json({ block: mapMemberBlock(block) });
  })
);

guildsRouter.get(
  "/guilds/:guildId/membership-requests",
  requireAuth,
  validate({ params: guildIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId } = req.params as unknown as z.infer<typeof guildIdParamsSchema>;
    const access = await assertGuildAccess(database, guildId, auth.user.id);
    await assertCanApproveMembershipRequests(guildId, auth.user.id, access.organization_role, auth.user.globalRole);

    const result = await query<MembershipRequestRow>(
      `
        SELECT
          mr.id::text,
          mr.guild_id::text,
          g.name AS guild_name,
          COALESCE(gs.public_slug::text, g.slug::text) AS guild_slug,
          ga.name AS game,
          s.code AS realm,
          mr.user_id::text,
          u.email::text,
          u.display_name,
          mr.nickname,
          mr.message,
          mr.source,
          mr.status,
          mr.requested_at::text,
          mr.decided_at::text,
          mr.decided_by::text,
          decider.display_name AS decided_by_name
        FROM membership_requests mr
        JOIN guilds g ON g.id = mr.guild_id
        JOIN games ga ON ga.id = g.game_id
        LEFT JOIN servers s ON s.id = g.server_id
        LEFT JOIN guild_sites gs ON gs.guild_id = g.id
        JOIN users u ON u.id = mr.user_id
        LEFT JOIN users decider ON decider.id = mr.decided_by
        WHERE mr.guild_id = $1
        ORDER BY
          CASE mr.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
          mr.requested_at DESC
      `,
      [guildId]
    );

    res.json({ requests: result.rows.map(mapMembershipRequest) });
  })
);

guildsRouter.patch(
  "/guilds/:guildId/membership-requests/:requestId",
  requireAuth,
  validate({ params: membershipRequestParamsSchema, body: decideMembershipRequestBodySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId, requestId } = req.params as unknown as z.infer<typeof membershipRequestParamsSchema>;
    const body = req.body as z.infer<typeof decideMembershipRequestBodySchema>;
    const decision = body.decision === "approve" ? "approved" : body.decision === "refuse" ? "refused" : body.decision;
    const access = await assertGuildAccess(database, guildId, auth.user.id);
    await assertCanApproveMembershipRequests(guildId, auth.user.id, access.organization_role, auth.user.globalRole);

    const decided = await withClient(async (client) => {
      await client.query("BEGIN");

      try {
        const requestResult = await client.query<MembershipRequestRow>(
          `
            SELECT
              mr.id::text,
              mr.guild_id::text,
              g.organization_id::text,
              g.name AS guild_name,
              COALESCE(gs.public_slug::text, g.slug::text) AS guild_slug,
              ga.name AS game,
              s.code AS realm,
              mr.user_id::text,
              u.email::text,
              u.display_name,
              mr.nickname,
              mr.message,
              mr.source,
              mr.status,
              mr.requested_at::text,
              mr.decided_at::text,
              mr.decided_by::text,
              decider.display_name AS decided_by_name
            FROM membership_requests mr
            JOIN guilds g ON g.id = mr.guild_id
            JOIN games ga ON ga.id = g.game_id
            LEFT JOIN servers s ON s.id = g.server_id
            LEFT JOIN guild_sites gs ON gs.guild_id = g.id
            JOIN users u ON u.id = mr.user_id
            LEFT JOIN users decider ON decider.id = mr.decided_by
            WHERE mr.guild_id = $1
              AND mr.id = $2
            FOR UPDATE OF mr
          `,
          [guildId, requestId]
        );
        const pendingRequest = requestResult.rows[0];

        if (!pendingRequest) {
          throw new NotFoundError("Membership request not found");
        }

        if (pendingRequest.status !== "pending") {
          throw new BadRequestError("Membership request has already been decided");
        }

        let member: Awaited<ReturnType<typeof getGuildMember>> | null = null;

        if (decision === "approved") {
          await assertGuildJoinNotBlocked(client, guildId, pendingRequest.user_id, pendingRequest.nickname);

          await client.query(
            `
              INSERT INTO organization_members (organization_id, user_id, organization_role)
              VALUES ($1, $2, 'member')
              ON CONFLICT (organization_id, user_id) DO NOTHING
            `,
            [pendingRequest.organization_id, pendingRequest.user_id]
          );

          const memberResult = await client.query<{ id: string }>(
            `
              INSERT INTO guild_members (guild_id, user_id, invited_by, nickname, status, joined_at)
              VALUES ($1, $2, $3, $4, 'active', now())
              ON CONFLICT (guild_id, user_id)
              DO UPDATE SET
                nickname = EXCLUDED.nickname,
                invited_by = COALESCE(guild_members.invited_by, EXCLUDED.invited_by),
                status = 'active',
                joined_at = COALESCE(guild_members.joined_at, now()),
                updated_at = now()
              RETURNING id::text
            `,
            [guildId, pendingRequest.user_id, auth.user.id, pendingRequest.nickname]
          );
          const memberId = memberResult.rows[0]?.id;

          if (!memberId) {
            throw new BadRequestError("Guild member could not be activated");
          }

          await client.query(
            `
              INSERT INTO guild_member_roles (guild_member_id, role_id, assigned_by)
              SELECT $1, roles.id, $2
              FROM roles
              WHERE roles.guild_id = $3
                AND roles.code::text = 'membre'
              ON CONFLICT DO NOTHING
            `,
            [memberId, auth.user.id, guildId]
          );

          member = await getGuildMember(memberId, client);
        }

        const updatedRequestResult = await client.query<MembershipRequestRow>(
          `
            UPDATE membership_requests
            SET status = $3,
                decided_at = now(),
                decided_by = $4,
                updated_at = now()
            WHERE guild_id = $1
              AND id = $2
            RETURNING
              id::text,
              guild_id::text,
              $5::text AS guild_name,
              $6::text AS guild_slug,
              $7::text AS game,
              $8::text AS realm,
              user_id::text,
              $9::text AS email,
              $10::text AS display_name,
              nickname,
              message,
              source,
              status,
              requested_at::text,
              decided_at::text,
              decided_by::text,
              $11::text AS decided_by_name
          `,
          [
            guildId,
            requestId,
            decision,
            auth.user.id,
            pendingRequest.guild_name,
            pendingRequest.guild_slug,
            pendingRequest.game,
            pendingRequest.realm,
            pendingRequest.email,
            pendingRequest.display_name,
            auth.user.displayName
          ]
        );
        const updatedRequest = updatedRequestResult.rows[0];

        if (!updatedRequest) {
          throw new NotFoundError("Membership request not found");
        }

        await client.query("COMMIT");
        return { member, request: updatedRequest };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });

    res.json({
      request: mapMembershipRequest(decided.request),
      member: decided.member
    });
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

type MembershipRequestRow = {
  id: string;
  guild_id: string;
  organization_id?: string;
  guild_name: string;
  guild_slug: string;
  game: string;
  realm: string | null;
  user_id: string;
  email: string | null;
  display_name: string | null;
  nickname: string;
  message: string;
  source: string;
  status: string;
  requested_at: string;
  decided_at: string | null;
  decided_by: string | null;
  decided_by_name: string | null;
};

type MemberBlockRow = {
  id: string;
  guild_id: string;
  user_id: string | null;
  nickname: string;
  normalized_nickname: string;
  reason: string;
  blocked_by: string | null;
  blocked_by_name: string | null;
  blocked_at: string;
  expires_at: string | null;
  lifted_at: string | null;
  lifted_by: string | null;
  lifted_by_name: string | null;
  lift_reason: string | null;
  created_at: string;
  updated_at: string;
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

export async function canManageGuildMembers(
  guildId: string,
  userId: string,
  organizationRole: string,
  globalRole: string
): Promise<boolean> {
  if (globalRole === "admin" || ["owner", "admin"].includes(organizationRole)) {
    return true;
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

  return Boolean(result.rows[0]?.allowed);
}

async function assertCanManageGuildMembers(
  guildId: string,
  userId: string,
  organizationRole: string,
  globalRole: string
): Promise<void> {
  if (!(await canManageGuildMembers(guildId, userId, organizationRole, globalRole))) {
    throw new ForbiddenError("Permission manage_members is required");
  }
}

export async function canApproveMembershipRequests(
  db: Queryable,
  guildId: string,
  userId: string,
  organizationRole: string,
  globalRole: string
): Promise<boolean> {
  if (globalRole === "admin" || ["owner", "admin"].includes(organizationRole)) {
    return true;
  }

  const result = await db.query<{ allowed: boolean }>(
    `
      SELECT true AS allowed
      FROM guild_members gm
      JOIN guild_member_roles gmr ON gmr.guild_member_id = gm.id
      JOIN role_permissions rp ON rp.role_id = gmr.role_id
      JOIN permissions p ON p.id = rp.permission_id
      WHERE gm.guild_id = $1
        AND gm.user_id = $2
        AND gm.status = 'active'
        AND p.key IN ('approve_members', 'manage_members', 'admin_all')
      LIMIT 1
    `,
    [guildId, userId]
  );

  return Boolean(result.rows[0]?.allowed);
}

async function assertCanApproveMembershipRequests(
  guildId: string,
  userId: string,
  organizationRole: string,
  globalRole: string
): Promise<void> {
  if (!(await canApproveMembershipRequests(database, guildId, userId, organizationRole, globalRole))) {
    throw new ForbiddenError("Permission approve_members is required");
  }
}

async function assertCanManageInviteLink(
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
        AND p.key IN ('approve_members', 'manage_members', 'manage_site', 'admin_all')
      LIMIT 1
    `,
    [guildId, userId]
  );

  if (!result.rows[0]?.allowed) {
    throw new ForbiddenError("Permission approve_members or manage_site is required");
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

async function getGuildMember(memberId: string, db: Queryable = database) {
  const result = await db.query<GuildMemberRow>(
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

function mapMembershipRequest(row: MembershipRequestRow) {
  return {
    id: row.id,
    guildId: row.guild_id,
    guildName: row.guild_name,
    guildSlug: row.guild_slug,
    game: row.game,
    realm: row.realm,
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    nickname: row.nickname,
    message: row.message,
    source: row.source,
    status: row.status,
    requestedAt: row.requested_at,
    decidedAt: row.decided_at,
    decidedBy: row.decided_by_name || row.decided_by || ""
  };
}

function mapMemberBlock(row: MemberBlockRow) {
  return {
    id: row.id,
    guildId: row.guild_id,
    userId: row.user_id,
    nickname: row.nickname,
    normalizedNickname: row.normalized_nickname,
    reason: row.reason,
    blockedBy: row.blocked_by,
    blockedByName: row.blocked_by_name,
    blockedAt: row.blocked_at,
    expiresAt: row.expires_at,
    liftedAt: row.lifted_at,
    liftedBy: row.lifted_by,
    liftedByName: row.lifted_by_name,
    liftReason: row.lift_reason,
    active: !row.lifted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeBlockNickname(value: string): string {
  return stringBodyValue(value).replace(/\s+/g, " ").slice(0, 80);
}

function normalizeBlockKey(value: string): string {
  return normalizeBlockNickname(value).toLowerCase();
}

async function findActiveMemberBlock(
  db: Queryable,
  guildId: string,
  userId: string | null,
  nickname: string
): Promise<MemberBlockRow | null> {
  const normalizedNickname = normalizeBlockKey(nickname);

  if (!userId && !normalizedNickname) {
    return null;
  }

  const result = await db.query<MemberBlockRow>(
    `
      SELECT
        block.id::text,
        block.guild_id::text,
        block.user_id::text,
        block.nickname,
        block.normalized_nickname::text,
        block.reason,
        block.blocked_by::text,
        blocker.display_name AS blocked_by_name,
        block.blocked_at::text,
        block.expires_at::text,
        block.lifted_at::text,
        block.lifted_by::text,
        lifter.display_name AS lifted_by_name,
        block.lift_reason,
        block.created_at::text,
        block.updated_at::text
      FROM guild_member_blocks block
      LEFT JOIN users blocker ON blocker.id = block.blocked_by
      LEFT JOIN users lifter ON lifter.id = block.lifted_by
      WHERE block.guild_id = $1
        AND block.lifted_at IS NULL
        AND (
          ($2::uuid IS NOT NULL AND block.user_id = $2)
          OR block.normalized_nickname = $3::citext
        )
      ORDER BY block.blocked_at DESC
      LIMIT 1
    `,
    [guildId, userId, normalizedNickname]
  );

  return result.rows[0] ?? null;
}

async function assertGuildJoinNotBlocked(
  db: Queryable,
  guildId: string,
  userId: string | null,
  nickname: string
): Promise<void> {
  const block = await findActiveMemberBlock(db, guildId, userId, nickname);

  if (block) {
    throw new ForbiddenError("Ce joueur est bloque pour cette guilde.", {
      blockId: block.id,
      nickname: block.nickname
    });
  }
}

async function upsertActiveMemberBlock(
  db: Queryable,
  options: {
    actorUserId: string;
    guildId: string;
    nickname: string;
    reason: string;
    userId: string | null;
  }
): Promise<MemberBlockRow> {
  const nickname = normalizeBlockNickname(options.nickname);
  const normalizedNickname = normalizeBlockKey(nickname);

  if (!nickname || !normalizedNickname) {
    throw new BadRequestError("Nickname is required to block a member");
  }

  const existingBlock = await findActiveMemberBlock(db, options.guildId, options.userId, nickname);

  const result = existingBlock
    ? await db.query<MemberBlockRow>(
        `
          UPDATE guild_member_blocks block
          SET user_id = COALESCE(block.user_id, $3),
              nickname = $4,
              normalized_nickname = $5,
              reason = COALESCE(NULLIF($6, ''), block.reason),
              blocked_by = COALESCE(block.blocked_by, $7),
              updated_at = now()
          WHERE block.guild_id = $1
            AND block.id = $2
          RETURNING
            block.id::text,
            block.guild_id::text,
            block.user_id::text,
            block.nickname,
            block.normalized_nickname::text,
            block.reason,
            block.blocked_by::text,
            (SELECT display_name FROM users WHERE id = block.blocked_by) AS blocked_by_name,
            block.blocked_at::text,
            block.expires_at::text,
            block.lifted_at::text,
            block.lifted_by::text,
            (SELECT display_name FROM users WHERE id = block.lifted_by) AS lifted_by_name,
            block.lift_reason,
            block.created_at::text,
            block.updated_at::text
        `,
        [options.guildId, existingBlock.id, options.userId, nickname, normalizedNickname, options.reason, options.actorUserId]
      )
    : await db.query<MemberBlockRow>(
        `
          INSERT INTO guild_member_blocks (
            guild_id,
            user_id,
            nickname,
            normalized_nickname,
            reason,
            blocked_by,
            blocked_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, now())
          RETURNING
            id::text,
            guild_id::text,
            user_id::text,
            nickname,
            normalized_nickname::text,
            reason,
            blocked_by::text,
            (SELECT display_name FROM users WHERE id = blocked_by) AS blocked_by_name,
            blocked_at::text,
            expires_at::text,
            lifted_at::text,
            lifted_by::text,
            (SELECT display_name FROM users WHERE id = lifted_by) AS lifted_by_name,
            lift_reason,
            created_at::text,
            updated_at::text
        `,
        [options.guildId, options.userId, nickname, normalizedNickname, options.reason, options.actorUserId]
      );
  const block = result.rows[0];

  if (!block) {
    throw new BadRequestError("Member block could not be created");
  }

  return block;
}

async function refusePendingMembershipRequests(
  db: Queryable,
  options: {
    actorUserId: string;
    guildId: string;
    nickname: string;
    userId: string | null;
  }
): Promise<void> {
  await db.query(
    `
      UPDATE membership_requests
      SET status = 'refused',
          decided_at = now(),
          decided_by = $4,
          updated_at = now()
      WHERE guild_id = $1
        AND status = 'pending'
        AND (
          ($2::uuid IS NOT NULL AND user_id = $2)
          OR lower(nickname) = lower($3)
        )
    `,
    [options.guildId, options.userId, normalizeBlockNickname(options.nickname), options.actorUserId]
  );
}

function createInviteToken(): string {
  return randomBytes(18).toString("base64url");
}

function normalizeInviteToken(value: unknown): string {
  return stringBodyValue(value).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 96);
}

function extractInviteToken(value: string): string {
  if (!value) return "";

  try {
    const url = new URL(value, "https://guildops.local");
    const token = normalizeInviteToken(url.searchParams.get("invite"));
    return token === "active" ? "" : token;
  } catch {
    return "";
  }
}

function getEnabledModuleInput(body: Record<string, unknown>): string[] | null {
  const moduleValue = body.enabledModules ?? body.enabled_modules ?? body.modules;

  if (moduleValue === undefined) return null;
  if (!Array.isArray(moduleValue)) return null;

  return moduleValue
    .map((moduleKey) => String(moduleKey).trim())
    .filter(Boolean);
}

function assertKnownGuildModuleInput(moduleKeys: readonly string[]): void {
  const unknownModuleKeys = moduleKeys.filter(
    (moduleKey) => !isGuildModuleKey(moduleKey) && !CLIENT_ONLY_GUILD_MODULE_KEY_SET.has(moduleKey)
  );

  if (unknownModuleKeys.length > 0) {
    throw new BadRequestError("Unknown guild module keys", { moduleKeys: unknownModuleKeys });
  }
}

function getEnabledGuildModuleKeys(modules: Array<{ moduleKey: string; status: string }>): string[] {
  return withDefaultGuildModuleKeys(
    modules
      .filter((module) => module.status === "enabled")
      .map((module) => module.moduleKey)
  );
}

function stringBodyValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

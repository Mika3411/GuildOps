import { Router } from "express";
import { z } from "zod";
import { database, query, withClient, type Queryable } from "../db/pool.js";
import { asyncHandler } from "../http/async-handler.js";
import { ConflictError, ForbiddenError, NotFoundError } from "../http/errors.js";
import { validate } from "../http/validate.js";
import { getAuth, requireAuth } from "../security/auth.js";
import { slugSchema, slugify } from "./helpers.js";
import { buildMePayload, setActiveContext } from "./me.service.js";

export const publicRouter = Router();

const directoryQuerySchema = z.object({
  game: z.string().trim().min(1).max(80).optional(),
  server: z.string().trim().min(1).max(80).optional(),
  language: z.string().trim().min(2).max(12).optional(),
  style: z.string().trim().min(1).max(80).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

const joinPublicGuildBodySchema = z
  .object({
    nickname: z.string().trim().min(1).max(80).optional(),
    inviteToken: z.string().trim().min(8).max(96).optional(),
    invite_token: z.string().trim().min(8).max(96).optional()
  })
  .strict();

const createMembershipRequestBodySchema = z
  .object({
    nickname: z.string().trim().min(1).max(80).optional(),
    message: z.string().trim().max(500).optional()
  })
  .strict();

type PublicGuildSiteRow = {
  id?: string | null;
  guildId?: string | null;
  guild_id?: string | null;
  name?: string | null;
  guildName?: string | null;
  guild_name?: string | null;
  title?: string | null;
  game?: string | null;
  server?: string | null;
  realm?: string | null;
  publicSlug?: string | null;
  public_slug?: string | null;
  slug?: string | null;
  tagline?: string | null;
  objective?: string | null;
  heroText?: string | null;
  hero_text?: string | null;
  memberInviteUrl?: string | null;
  member_invite_url?: string | null;
  playStyle?: string | null;
  play_style?: string | null;
  theme?: string | Record<string, unknown> | null;
  colors?: Record<string, unknown> | null;
  typography?: Record<string, unknown> | null;
  sections?: Record<string, unknown> | null;
  themeJson?: Record<string, unknown> | null;
  theme_json?: Record<string, unknown> | null;
  pagesJson?: Record<string, unknown> | null;
  pages_json?: Record<string, unknown> | null;
  seoJson?: Record<string, unknown> | null;
  seo_json?: Record<string, unknown> | null;
  status?: string | null;
  published?: boolean | null;
  publishedAt?: string | Date | null;
  published_at?: string | Date | null;
};

type PublicEventRow = {
  id: string;
  title: string;
  eventType: string;
  startsAt: string | Date;
  endsAt: string | Date | null;
  realm: string | null;
};

type PublicObjectiveRow = {
  id: string;
  title: string;
  status: string;
  dueAt: string | Date | null;
  eventTitle: string | null;
};

type PublicWarsSnapshot = {
  nextEvent: ReturnType<typeof toPublicEventResource> | null;
  events: ReturnType<typeof toPublicEventResource>[];
  weeklyObjectives: {
    total: number;
    done: number;
    completionRate: number;
    objectives: ReturnType<typeof toPublicObjectiveResource>[];
  };
};

type PublicDirectoryGuildRow = {
  id: string;
  name: string;
  tag: string | null;
  slug: string;
  defaultLanguage: string;
  playStyle: string | null;
  description: string | null;
  game: string;
  server: string | null;
  publicSlug: string | null;
  siteStatus: string | null;
  themeJson?: Record<string, unknown> | null;
  memberCount: string;
};

type PublicGuildMemberRow = {
  nickname?: string | null;
  power?: string | null;
  powerScore?: string | null;
  power_score?: string | null;
  language?: string | null;
  status?: string | null;
  roleCodes?: string[] | null;
  role_codes?: string[] | null;
};

type PublicForumCategoryRow = {
  id: string;
  name: string;
  description: string | null;
  thread_count: string;
  post_count: string;
  last_post_at: string | null;
};

type PublicForumThreadRow = {
  id: string;
  category_id: string;
  category_name: string;
  author_name: string | null;
  title: string;
  pinned_at: string | null;
  locked_at: string | null;
  last_post_at: string | null;
  created_at: string;
  post_count: number;
  reply_count: number;
  preview: string | null;
};

type PublicForumLockedRow = {
  private_category_count: string;
  private_thread_count: string;
};

type PublicBankGuildRow = {
  id: string;
  bank_section_enabled: boolean | null;
  bank_module_enabled: boolean | null;
};

type PublicJoinGuildRow = {
  id: string;
  organization_id: string;
  name: string;
  tag: string | null;
  slug: string;
  invite_token?: string | null;
};

type PublicJoinMemberRow = {
  id: string;
  user_id: string;
  nickname: string;
  status: string;
  joined_at: string | null;
};

type PublicMembershipRequestRow = {
  id: string;
  guild_id: string;
  user_id: string;
  nickname: string;
  message: string;
  source: string;
  status: string;
  requested_at: string;
  decided_at: string | null;
  decided_by: string | null;
};

type PublicBankRow = {
  name: string;
  settings: Record<string, unknown> | null;
};

type PublicBankResourceRow = {
  resourceCode: string;
  resourceName: string;
  amount: string;
  unit: string | null;
  updatedAt: string;
};

type PublicBankRequestRow = {
  id: string;
  requester: string;
  resourceCode: string;
  resource: string;
  amount: string;
  unit: string | null;
  reason: string | null;
  status: string;
  createdAt: string;
};

type PublicBankMode = "public" | "masked" | "aggregate" | "private";

type PublicBankSnapshotInput = {
  bank: PublicBankRow | null;
  moduleEnabled?: boolean;
  resources?: PublicBankResourceRow[];
  requests?: PublicBankRequestRow[];
};

const DEFAULT_PUBLIC_BANK_RULES = Object.freeze([
  "Une demande doit indiquer la ressource, le montant et le motif.",
  "Les officiers ou banquiers valident selon les priorites de guilde.",
  "Les informations internes de stock, logs et arbitrages restent privees."
]);

publicRouter.get(
  "/directory/guilds",
  validate({ query: directoryQuerySchema }),
  asyncHandler(async (req, res) => {
    const filters = req.query as unknown as z.infer<typeof directoryQuerySchema>;
    const where = ["g.deleted_at IS NULL", "(g.is_public = true OR gs.status = 'published')"];
    const values: unknown[] = [];

    if (filters.game) {
      values.push(slugify(filters.game));
      where.push(`ga.slug = $${values.length}`);
    }

    if (filters.server) {
      values.push(filters.server);
      where.push(`s.code ILIKE $${values.length}`);
    }

    if (filters.language) {
      values.push(filters.language);
      where.push(`g.default_language = $${values.length}`);
    }

    if (filters.style) {
      values.push(`%${filters.style}%`);
      where.push(`g.play_style ILIKE $${values.length}`);
    }

    values.push(filters.limit);

    const result = await query<PublicDirectoryGuildRow>(
      `
        SELECT
          g.id::text,
          g.name,
          g.tag,
          g.slug::text,
          g.default_language AS "defaultLanguage",
          g.play_style AS "playStyle",
          g.description,
          ga.name AS game,
          s.code AS server,
          COALESCE(gs.public_slug::text, g.slug::text) AS "publicSlug",
          COALESCE(gs.status, CASE WHEN g.is_public THEN 'published' ELSE 'draft' END) AS "siteStatus",
          gs.theme_json AS "themeJson",
          count(gm.id)::text AS "memberCount"
        FROM guilds g
        JOIN games ga ON ga.id = g.game_id
        LEFT JOIN servers s ON s.id = g.server_id
        LEFT JOIN guild_sites gs ON gs.guild_id = g.id
        LEFT JOIN guild_members gm
          ON gm.guild_id = g.id
         AND gm.status = 'active'
        WHERE ${where.join(" AND ")}
        GROUP BY
          g.id,
          ga.name,
          s.code,
          gs.public_slug,
          gs.status,
          gs.theme_json
        ORDER BY
          ga.name ASC,
          COALESCE(s.code, '') ASC,
          g.default_language ASC,
          g.name ASC
        LIMIT $${values.length}
      `,
      values
    );

    res.json({ guilds: result.rows.map(toPublicDirectoryGuildResource) });
  })
);

publicRouter.get(
  "/public/guilds/:slug/bank",
  validate({ params: z.object({ slug: slugSchema }) }),
  asyncHandler(async (req, res) => {
    const { slug } = req.params as { slug: string };
    const guild = await findPublicBankGuildBySlug(slug);

    if (!guild?.bank_section_enabled) {
      throw new NotFoundError("Bank module is disabled");
    }

    const bankResult = await query<PublicBankRow>(
      `
        SELECT
          name,
          COALESCE(settings, '{}'::jsonb) AS settings
        FROM banks
        WHERE guild_id = $1
        ORDER BY created_at ASC
        LIMIT 1
      `,
      [guild.id]
    );
    const bank = bankResult.rows[0] ?? null;

    if (!bank || !guild.bank_module_enabled) {
      res.json({
        bank: toPublicBankSnapshotResource({
          bank,
          moduleEnabled: Boolean(guild.bank_module_enabled)
        })
      });
      return;
    }

    const privacy = normalizePublicBankSettings(bank.settings);
    let resources: PublicBankResourceRow[] = [];
    let requests: PublicBankRequestRow[] = [];

    if (privacy.resourcesMode !== "private") {
      const resourcesResult = await query<PublicBankResourceRow>(
        `
          SELECT
            resource_code::text AS "resourceCode",
            resource_name AS "resourceName",
            amount::text,
            unit,
            updated_at::text AS "updatedAt"
          FROM bank_resources
          WHERE bank_id = (
            SELECT id
            FROM banks
            WHERE guild_id = $1
            ORDER BY created_at ASC
            LIMIT 1
          )
          ORDER BY resource_name ASC
          LIMIT 24
        `,
        [guild.id]
      );
      resources = resourcesResult.rows;
    }

    if (privacy.requestsMode !== "private") {
      const requestsResult = await query<PublicBankRequestRow>(
        `
          SELECT
            br.id::text,
            requester.nickname AS requester,
            br.resource_code::text AS "resourceCode",
            COALESCE(resource.resource_name, br.resource_code::text) AS resource,
            br.amount::text,
            resource.unit,
            br.reason,
            br.status,
            br.created_at::text AS "createdAt"
          FROM bank_requests br
          JOIN banks b ON b.id = br.bank_id
          JOIN guild_members requester ON requester.id = br.requester_member_id
          LEFT JOIN bank_resources resource
            ON resource.bank_id = br.bank_id
           AND resource.resource_code = br.resource_code
          WHERE b.guild_id = $1
            AND br.status IN ('pending', 'approved', 'fulfilled', 'cancelled', 'refused')
          ORDER BY br.created_at DESC
          LIMIT 8
        `,
        [guild.id]
      );
      requests = requestsResult.rows;
    }

    res.json({
      bank: toPublicBankSnapshotResource({
        bank,
        moduleEnabled: true,
        resources,
        requests
      })
    });
  })
);

function toPublicDirectoryGuildResource(row: PublicDirectoryGuildRow) {
  const publicSlug = asString(row.publicSlug) || asString(row.slug);
  const themeJson = asRecord(row.themeJson) ?? {};

  return {
    id: asString(row.id),
    name: asString(row.name),
    tag: asString(row.tag),
    slug: publicSlug,
    publicSlug,
    url: `/g/${publicSlug}`,
    game: asString(row.game),
    server: asString(row.server),
    realm: asString(row.server),
    language: asString(row.defaultLanguage),
    defaultLanguage: asString(row.defaultLanguage),
    playStyle: asString(row.playStyle),
    description: asString(row.description),
    heroImage: asRecord(themeJson.heroImage) ?? null,
    siteStatus: asString(row.siteStatus),
    memberCount: Number(row.memberCount) || 0
  };
}

publicRouter.get(
  "/public/guilds/:slug",
  validate({ params: z.object({ slug: slugSchema }) }),
  asyncHandler(async (req, res) => {
    const { slug } = req.params as { slug: string };
    const result = await query(
      `
        SELECT
          COALESCE(gs.id::text, g.id::text) AS id,
          g.id::text AS "guildId",
          g.name,
          g.tag,
          g.slug::text,
          g.default_language AS "defaultLanguage",
          g.play_style AS "playStyle",
          g.description,
          g.logo_url AS "logoUrl",
          g.is_public AS "isPublic",
          COALESCE(NULLIF(gs.guild_name, ''), g.name) AS "guildName",
          COALESCE(NULLIF(gs.game, ''), ga.name) AS game,
          s.code AS server,
          COALESCE(NULLIF(gs.realm, ''), s.code, '') AS realm,
          COALESCE(gs.public_slug::text, g.slug::text) AS "publicSlug",
          COALESCE(gs.public_slug::text, g.slug::text) AS slug,
          COALESCE(gs.title, g.name) AS title,
          COALESCE(NULLIF(gs.tagline, ''), gs.pages_json->>'tagline', '') AS tagline,
          COALESCE(NULLIF(gs.objective, ''), gs.pages_json->>'objective', gs.hero_text, g.description, '') AS objective,
          COALESCE(NULLIF(gs.theme, ''), gs.theme_json->>'theme', 'camp-nord') AS theme,
          COALESCE(NULLIF(gs.colors_json, '{}'::jsonb), gs.theme_json->'colors', '{}'::jsonb) AS colors,
          COALESCE(NULLIF(gs.typography_json, '{}'::jsonb), gs.theme_json->'typography', '{}'::jsonb) AS typography,
          COALESCE(NULLIF(gs.sections_json, '{}'::jsonb), gs.pages_json->'sections', '{}'::jsonb) AS sections,
          COALESCE(gs.hero_text, gs.objective, g.description) AS "heroText",
          gs.theme_json AS "themeJson",
          gs.pages_json AS "pagesJson",
          gs.seo_json AS "seoJson",
          COALESCE(gs.theme_json, '{}'::jsonb) AS "theme_json",
          COALESCE(gs.pages_json, '{}'::jsonb) AS "pages_json",
          COALESCE(gs.seo_json, '{}'::jsonb) AS "seo_json",
          CASE WHEN g.is_public OR gs.status = 'published' THEN 'published' ELSE COALESCE(gs.status, 'draft') END AS status,
          (g.is_public OR gs.status = 'published') AS published,
          gs.published_at AS "publishedAt"
        FROM guilds g
        JOIN games ga ON ga.id = g.game_id
        LEFT JOIN servers s ON s.id = g.server_id
        LEFT JOIN guild_sites gs ON gs.guild_id = g.id
        WHERE (g.slug = $1 OR gs.public_slug = $1)
          AND g.deleted_at IS NULL
          AND (g.is_public = true OR gs.status = 'published')
        LIMIT 1
      `,
      [slug]
    );
    const guild = result.rows[0];

    if (!guild) {
      throw new NotFoundError("Guild site not found");
    }

    const siteBase = toPublicGuildSiteResource(guild);
    const publicEvents =
      isPublicWarsSectionEnabled(siteBase.sections) && (await isPublicWarsModuleEnabled(siteBase.guildId))
        ? await getPublicWarsSnapshot(siteBase.guildId, siteBase.realm)
        : createEmptyPublicWarsSnapshot();
    const members = isPublicRosterSectionEnabled(siteBase.sections) ? await getPublicGuildMembers(siteBase.guildId) : [];
    const publicForum =
      isPublicForumSectionEnabled(siteBase.sections) && (await isPublicForumModuleEnabled(siteBase.guildId))
        ? await getPublicForumSnapshot(siteBase.guildId)
        : createEmptyPublicForumSnapshot();
    const site = { ...siteBase, members, publicEvents, publicForum };

    res.json({ site, guild: site, members });
  })
);

publicRouter.post(
  "/public/guilds/:slug/membership-requests",
  requireAuth,
  validate({ params: z.object({ slug: slugSchema }), body: createMembershipRequestBodySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { slug } = req.params as { slug: string };
    const body = req.body as z.infer<typeof createMembershipRequestBodySchema>;
    const nickname = body.nickname || auth.user.displayName;
    const message = body.message || "Demande envoyée depuis le site public, sans lien d'invitation actif.";

    const requested = await withClient(async (client) => {
      await client.query("BEGIN");

      try {
        const guildResult = await client.query<PublicJoinGuildRow>(
          `
            SELECT
              g.id::text,
              g.organization_id::text,
              g.name,
              g.tag,
              COALESCE(gs.public_slug::text, g.slug::text) AS slug
            FROM guilds g
            LEFT JOIN guild_sites gs ON gs.guild_id = g.id
            WHERE (g.slug = $1 OR gs.public_slug = $1)
              AND g.deleted_at IS NULL
              AND (g.is_public = true OR gs.status = 'published')
            LIMIT 1
          `,
          [slug]
        );
        const guild = guildResult.rows[0];

        if (!guild) {
          throw new NotFoundError("Guild site not found");
        }

        await assertPublicJoinNotBlocked(client, guild.id, auth.user.id, nickname);

        const existingMemberResult = await client.query<{ status: string }>(
          `
            SELECT status
            FROM guild_members
            WHERE guild_id = $1
              AND user_id = $2
            LIMIT 1
          `,
          [guild.id, auth.user.id]
        );
        const existingStatus = existingMemberResult.rows[0]?.status;

        if (existingStatus === "banned") {
          throw new ForbiddenError("Vous ne pouvez pas demander l'accès à cette guilde.");
        }

        if (existingStatus === "active") {
          throw new ConflictError("Vous êtes déjà membre de cette guilde.");
        }

        const requestResult = await client.query<PublicMembershipRequestRow>(
          `
            INSERT INTO membership_requests (guild_id, user_id, nickname, message, source, status, requested_at)
            VALUES ($1, $2, $3, $4, 'public', 'pending', now())
            ON CONFLICT (guild_id, user_id) WHERE status = 'pending'
            DO UPDATE SET
              nickname = EXCLUDED.nickname,
              message = EXCLUDED.message,
              requested_at = now(),
              updated_at = now()
            RETURNING
              id::text,
              guild_id::text,
              user_id::text,
              nickname,
              message,
              source,
              status,
              requested_at::text,
              decided_at::text,
              decided_by::text
          `,
          [guild.id, auth.user.id, nickname, message]
        );
        const request = requestResult.rows[0];

        if (!request) {
          throw new NotFoundError("Membership request could not be created");
        }

        await client.query("COMMIT");
        return { guild, request };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });

    res.status(201).json({
      status: "pending",
      guild: requested.guild,
      request: toPublicMembershipRequestResource(requested.request)
    });
  })
);

publicRouter.post(
  "/public/guilds/:slug/join",
  requireAuth,
  validate({ params: z.object({ slug: slugSchema }), body: joinPublicGuildBodySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { slug } = req.params as { slug: string };
    const body = req.body as z.infer<typeof joinPublicGuildBodySchema>;
    const nickname = body.nickname || auth.user.displayName;
    const inviteToken = normalizeInviteToken(body.inviteToken || body.invite_token);

    const joined = await withClient(async (client) => {
      await client.query("BEGIN");

      try {
        const guildResult = await client.query<PublicJoinGuildRow>(
          `
            SELECT
              g.id::text,
              g.organization_id::text,
              g.name,
              g.tag,
              COALESCE(gs.public_slug::text, g.slug::text) AS slug,
              gs.invite_token
            FROM guilds g
            JOIN guild_sites gs ON gs.guild_id = g.id
            WHERE (g.slug = $1 OR gs.public_slug = $1)
              AND g.deleted_at IS NULL
              AND gs.status = 'published'
            LIMIT 1
          `,
          [slug]
        );
        const guild = guildResult.rows[0];

        if (!guild) {
          throw new NotFoundError("Guild invite not found");
        }

        if (!inviteToken || inviteToken !== guild.invite_token) {
          throw new ForbiddenError("Ce lien d'invitation n'est plus actif.");
        }

        await assertPublicJoinNotBlocked(client, guild.id, auth.user.id, nickname);

        const existingMemberResult = await client.query<{ status: string }>(
          `
            SELECT status
            FROM guild_members
            WHERE guild_id = $1
              AND user_id = $2
            LIMIT 1
          `,
          [guild.id, auth.user.id]
        );

        if (existingMemberResult.rows[0]?.status === "banned") {
          throw new ForbiddenError("Vous ne pouvez pas rejoindre cette guilde.");
        }

        await client.query(
          `
            INSERT INTO organization_members (organization_id, user_id, organization_role)
            VALUES ($1, $2, 'member')
            ON CONFLICT (organization_id, user_id) DO NOTHING
          `,
          [guild.organization_id, auth.user.id]
        );

        const memberResult = await client.query<PublicJoinMemberRow>(
          `
            INSERT INTO guild_members (guild_id, user_id, invited_by, nickname, status, joined_at)
            VALUES ($1, $2, NULL, $3, 'active', now())
            ON CONFLICT (guild_id, user_id)
            DO UPDATE SET
              nickname = EXCLUDED.nickname,
              status = 'active',
              joined_at = COALESCE(guild_members.joined_at, now()),
              updated_at = now()
            RETURNING
              id::text,
              user_id::text,
              nickname,
              status,
              joined_at::text
          `,
          [guild.id, auth.user.id, nickname]
        );
        const member = memberResult.rows[0];

        if (member) {
          await client.query(
            `
              INSERT INTO guild_member_roles (guild_member_id, role_id, assigned_by)
              SELECT $1, roles.id, NULL
              FROM roles
              WHERE roles.guild_id = $2
                AND roles.code::text = 'membre'
              ON CONFLICT DO NOTHING
            `,
            [member.id, guild.id]
          );
        }

        await setActiveContext(client, {
          sessionId: auth.sessionId,
          userId: auth.user.id,
          activeOrganizationId: guild.organization_id,
          activeGuildId: guild.id
        });

        await client.query("COMMIT");
        return { guild, member };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
    const me = await buildMePayload(database, auth.user.id, auth.sessionId);

    res.json({
      status: "joined",
      guild: joined.guild,
      member: joined.member,
      ...me
    });
  })
);

export function toPublicGuildSiteResource(row: PublicGuildSiteRow) {
  const themeJson = asRecord(row.themeJson) ?? asRecord(row.theme_json) ?? asRecord(row.theme) ?? {};
  const pagesJson = asRecord(row.pagesJson) ?? asRecord(row.pages_json) ?? {};
  const seoJson = asRecord(row.seoJson) ?? asRecord(row.seo_json) ?? {};
  const themeId = typeof row.theme === "string" ? row.theme : asString(themeJson.theme);
  const publicSlug = asString(row.publicSlug) || asString(row.public_slug) || asString(row.slug);
  const memberInviteUrl = `/join/${slugify(publicSlug)}`;

  return {
    ...row,
    id: asString(row.id) || asString(row.guildId) || asString(row.guild_id),
    guildId: asString(row.guildId) || asString(row.guild_id) || asString(row.id),
    guildName: asString(row.guildName) || asString(row.guild_name) || asString(row.name) || asString(row.title),
    game: asString(row.game),
    realm: asString(row.realm) || asString(row.server),
    publicSlug,
    slug: publicSlug,
    tagline: asString(row.tagline) || asString(pagesJson.tagline),
    objective: asString(row.objective) || asString(pagesJson.objective) || asString(row.heroText) || asString(row.hero_text),
    objectiveTag: asString(row.playStyle) || asString(row.play_style) || "Operations",
    memberInviteUrl,
    member_invite_url: memberInviteUrl,
    theme: themeId || "camp-nord",
    heroImage: asRecord(themeJson.heroImage) ?? null,
    colors: asRecord(row.colors) ?? asRecord(themeJson.colors) ?? {},
    typography: asRecord(row.typography) ?? asRecord(themeJson.typography) ?? {},
    sections: asRecord(row.sections) ?? asRecord(pagesJson.sections) ?? {},
    themeJson,
    pagesJson,
    seoJson,
    status: asString(row.status) || (row.published ? "published" : "draft"),
    published: Boolean(row.published || row.status === "published"),
    publishedAt: row.publishedAt || row.published_at || null
  };
}

export function toPublicMembershipRequestResource(row: PublicMembershipRequestRow) {
  return {
    id: row.id,
    guildId: row.guild_id,
    guildSlug: "",
    userId: row.user_id,
    nickname: row.nickname,
    message: row.message,
    source: row.source,
    status: row.status,
    requestedAt: row.requested_at,
    decidedAt: row.decided_at,
    decidedBy: row.decided_by
  };
}

async function findPublicBankGuildBySlug(slug: string): Promise<PublicBankGuildRow | null> {
  const result = await query<PublicBankGuildRow>(
    `
      SELECT
        g.id::text,
        COALESCE(
          (gs.sections_json->>'bank')::boolean,
          (gs.pages_json#>>'{sections,bank}')::boolean,
          true
        ) AS bank_section_enabled,
        COALESCE(gm.status = 'enabled', false) AS bank_module_enabled
      FROM guilds g
      LEFT JOIN guild_sites gs ON gs.guild_id = g.id
      LEFT JOIN guild_modules gm
        ON gm.guild_id = g.id
       AND gm.module_key = 'bank'
      WHERE (g.slug = $1 OR gs.public_slug = $1)
        AND g.deleted_at IS NULL
        AND (g.is_public = true OR gs.status = 'published')
      LIMIT 1
    `,
    [slug]
  );

  return result.rows[0] ?? null;
}

export function toPublicBankSnapshotResource(input: PublicBankSnapshotInput) {
  const settings = normalizePublicBankSettings(input.bank?.settings, {
    forcePrivate: !input.bank || !input.moduleEnabled
  });
  const resources = (input.resources ?? []).map((resource) => toPublicBankResource(resource, settings.resourcesMode));
  const requests = (input.requests ?? []).map((request, index) => toPublicBankRequest(request, settings.requestsMode, index));
  const requestStats = buildPublicBankRequestStats(input.requests ?? []);

  return {
    configured: Boolean(input.bank && input.moduleEnabled),
    moduleEnabled: Boolean(input.moduleEnabled),
    name: input.bank?.name || "Banque de guilde",
    summary: settings.summary,
    resources,
    requests,
    requestStats,
    rules: settings.rules,
    privacy: {
      resources: {
        mode: settings.resourcesMode,
        label: getPublicBankPrivacyLabel(settings.resourcesMode, "resources")
      },
      requests: {
        mode: settings.requestsMode,
        label: getPublicBankPrivacyLabel(settings.requestsMode, "requests")
      },
      note: "Les mouvements, commandes, acteurs internes et arbitrages officiers ne sont jamais exposes sur la page de guilde."
    }
  };
}

function toPublicBankResource(resource: PublicBankResourceRow, mode: PublicBankMode) {
  const isPublic = mode === "public";

  return {
    code: resource.resourceCode,
    resourceCode: resource.resourceCode,
    name: resource.resourceName,
    resourceName: resource.resourceName,
    amount: isPublic ? resource.amount : null,
    amountLabel: isPublic ? null : "Stock agrege",
    unit: isPublic ? resource.unit : null,
    updatedAt: resource.updatedAt,
    visibility: mode
  };
}

function toPublicBankRequest(request: PublicBankRequestRow, mode: PublicBankMode, index: number) {
  const isPublic = mode === "public";

  return {
    id: isPublic ? request.id : `masked-request-${index + 1}`,
    member: isPublic ? request.requester : "Membre masque",
    requester: isPublic ? request.requester : "Membre masque",
    resourceCode: request.resourceCode,
    resource: request.resource,
    amount: isPublic ? request.amount : null,
    amountLabel: isPublic ? null : "Montant prive",
    unit: isPublic ? request.unit : null,
    reason: isPublic ? request.reason : null,
    status: normalizePublicBankStatus(request.status),
    createdAt: request.createdAt,
    visibility: mode,
    masked: !isPublic
  };
}

function buildPublicBankRequestStats(requests: PublicBankRequestRow[]) {
  const counts = requests.reduce<Record<string, number>>((accumulator, request) => {
    const status = normalizePublicBankStatus(request.status);
    accumulator[status] = (accumulator[status] ?? 0) + 1;
    return accumulator;
  }, {});

  return {
    total: requests.length,
    pending: counts.pending ?? 0,
    approved: counts.approved ?? 0,
    fulfilled: counts.fulfilled ?? 0,
    refused: (counts.refused ?? 0) + (counts.cancelled ?? 0)
  };
}

function normalizePublicBankSettings(settings: unknown, options: { forcePrivate?: boolean } = {}) {
  const rawSettings = asRecord(settings) ?? {};
  const publicSettings = asRecord(rawSettings.public) ?? rawSettings;

  if (options.forcePrivate) {
    return {
      resourcesMode: "private" as PublicBankMode,
      requestsMode: "private" as PublicBankMode,
      rules: [...DEFAULT_PUBLIC_BANK_RULES],
      summary: "La banque de guilde reste reservee aux membres autorises."
    };
  }

  const resourcesMode = normalizePublicBankMode(
    publicSettings.resources ?? publicSettings.publicResources ?? publicSettings.resourceVisibility,
    "aggregate"
  );
  const requestsMode = normalizePublicBankMode(
    publicSettings.requests ?? publicSettings.publicRequests ?? publicSettings.requestVisibility,
    "masked"
  );
  const rules = normalizePublicBankRules(publicSettings.rules ?? publicSettings.requestRules);
  const summary =
    asString(publicSettings.summary) ||
    "La banque centralise les demandes de ressources et garde les details sensibles cote membres.";

  return {
    resourcesMode,
    requestsMode,
    rules,
    summary
  };
}

function normalizePublicBankMode(value: unknown, fallback: PublicBankMode): PublicBankMode {
  if (value === true) return "public";
  if (value === false) return "private";

  const mode = asString(value).toLowerCase();
  return ["public", "masked", "aggregate", "private"].includes(mode) ? (mode as PublicBankMode) : fallback;
}

function normalizePublicBankRules(value: unknown): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_PUBLIC_BANK_RULES];

  const rules = value.map(asString).filter(Boolean).slice(0, 6);
  return rules.length ? rules : [...DEFAULT_PUBLIC_BANK_RULES];
}

function normalizePublicBankStatus(status: string): string {
  return status === "rejected" ? "refused" : status;
}

function getPublicBankPrivacyLabel(mode: PublicBankMode, domain: "resources" | "requests") {
  if (mode === "public") return domain === "resources" ? "Stocks detailles" : "Demandes detaillees";
  if (mode === "masked") return "Demandes anonymisees";
  if (mode === "aggregate") return domain === "resources" ? "Stocks agreges" : "Demandes agregees";
  return domain === "resources" ? "Stocks reserves" : "Demandes reservees";
}

function isPublicWarsSectionEnabled(sections: Record<string, unknown>) {
  return sections.wars !== false;
}

function isPublicRosterSectionEnabled(sections: Record<string, unknown>) {
  return sections.roster !== false;
}

function isPublicForumSectionEnabled(sections: Record<string, unknown>) {
  return sections.forum !== false;
}

async function getPublicGuildMembers(guildId: string) {
  if (!guildId) return [];

  const result = await query<PublicGuildMemberRow>(
    `
      SELECT
        gm.nickname,
        gm.power_score::text AS power,
        gm.power_score::text AS "powerScore",
        gm.language,
        gm.status,
        COALESCE(array_remove(array_agg(DISTINCT roles.code::text), NULL), ARRAY[]::text[]) AS "roleCodes"
      FROM guild_members gm
      LEFT JOIN guild_member_roles gmr ON gmr.guild_member_id = gm.id
      LEFT JOIN roles ON roles.id = gmr.role_id
      WHERE gm.guild_id = $1
        AND gm.status IN ('active', 'inactive')
      GROUP BY gm.id
      ORDER BY
        CASE gm.status WHEN 'active' THEN 0 ELSE 1 END,
        gm.nickname ASC
      LIMIT 80
    `,
    [guildId]
  );

  return result.rows.map(toPublicGuildMemberResource);
}

function toPublicGuildMemberResource(row: PublicGuildMemberRow) {
  const nickname = asString(row.nickname);

  return {
    id: slugify(nickname),
    name: nickname,
    nickname,
    power: asString(row.power) || asString(row.powerScore) || asString(row.power_score),
    language: asString(row.language),
    status: asString(row.status),
    roleCodes: Array.isArray(row.roleCodes) ? row.roleCodes : Array.isArray(row.role_codes) ? row.role_codes : []
  };
}

async function isPublicForumModuleEnabled(guildId: string) {
  const result = await query<{ active: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM guild_modules
        WHERE guild_id = $1
          AND module_key = 'forum'
          AND status = 'enabled'
      ) AS active
    `,
    [guildId]
  );

  return Boolean(result.rows[0]?.active);
}

async function getPublicForumSnapshot(guildId: string) {
  const [categoriesResult, threadsResult, lockedResult] = await Promise.all([
    query<PublicForumCategoryRow>(
      `
        SELECT
          fc.id::text,
          fc.name,
          fc.description,
          count(DISTINCT ft.id)::text AS thread_count,
          count(fp.id) FILTER (WHERE fp.deleted_at IS NULL)::text AS post_count,
          max(fp.created_at)::text AS last_post_at
        FROM forum_categories fc
        LEFT JOIN forum_threads ft ON ft.category_id = fc.id
        LEFT JOIN forum_posts fp ON fp.thread_id = ft.id
        WHERE fc.guild_id = $1
          AND fc.visibility = 'public'
        GROUP BY fc.id
        ORDER BY fc.sort_order ASC, fc.name ASC
        LIMIT 12
      `,
      [guildId]
    ),
    query<PublicForumThreadRow>(
      `
        SELECT
          ft.id::text,
          ft.category_id::text,
          fc.name AS category_name,
          author.nickname AS author_name,
          ft.title,
          ft.pinned_at::text,
          ft.locked_at::text,
          ft.last_post_at::text,
          ft.created_at::text,
          count(fp.id) FILTER (WHERE fp.deleted_at IS NULL)::int AS post_count,
          count(fp.id) FILTER (WHERE fp.deleted_at IS NULL)::int - 1 AS reply_count,
          (
            SELECT body
            FROM forum_posts first_post
            WHERE first_post.thread_id = ft.id
              AND first_post.deleted_at IS NULL
            ORDER BY first_post.created_at ASC
            LIMIT 1
          ) AS preview
        FROM forum_threads ft
        JOIN forum_categories fc ON fc.id = ft.category_id
        LEFT JOIN guild_members author ON author.id = ft.author_member_id
        LEFT JOIN forum_posts fp ON fp.thread_id = ft.id
        WHERE fc.guild_id = $1
          AND fc.visibility = 'public'
        GROUP BY ft.id, fc.name, author.nickname
        ORDER BY ft.pinned_at DESC NULLS LAST, COALESCE(ft.last_post_at, ft.created_at) DESC
        LIMIT 12
      `,
      [guildId]
    ),
    query<PublicForumLockedRow>(
      `
        SELECT
          count(DISTINCT fc.id) FILTER (WHERE fc.visibility <> 'public')::text AS private_category_count,
          count(DISTINCT ft.id) FILTER (WHERE fc.visibility <> 'public')::text AS private_thread_count
        FROM forum_categories fc
        LEFT JOIN forum_threads ft ON ft.category_id = fc.id
        WHERE fc.guild_id = $1
      `,
      [guildId]
    )
  ]);

  const locked = lockedResult.rows[0] ?? {
    private_category_count: "0",
    private_thread_count: "0"
  };

  return {
    configured: categoriesResult.rows.length > 0 || threadsResult.rows.length > 0,
    categories: categoriesResult.rows.map(toPublicForumCategoryResource),
    threads: threadsResult.rows.map(toPublicForumThreadResource),
    latestThreads: threadsResult.rows.map(toPublicForumThreadResource),
    locked: {
      privateCategoryCount: Number(locked.private_category_count || 0),
      privateThreadCount: Number(locked.private_thread_count || 0),
      note: "Les categories membres, officiers et admins ne sont pas exposees sur cette page."
    }
  };
}

function toPublicForumCategoryResource(row: PublicForumCategoryRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    threadCount: Number(row.thread_count || 0),
    postCount: Number(row.post_count || 0),
    lastPostAt: row.last_post_at,
    visibility: "public"
  };
}

function toPublicForumThreadResource(row: PublicForumThreadRow) {
  return {
    id: row.id,
    categoryId: row.category_id,
    categoryName: row.category_name,
    authorName: row.author_name ?? "Membre",
    title: row.title,
    pinned: Boolean(row.pinned_at),
    pinnedAt: row.pinned_at,
    locked: Boolean(row.locked_at),
    lockedAt: row.locked_at,
    lastPostAt: row.last_post_at,
    createdAt: row.created_at,
    postCount: Number(row.post_count || 0),
    replyCount: Math.max(0, Number(row.reply_count || 0)),
    preview: row.preview ?? "",
    visibility: "public"
  };
}

function createEmptyPublicForumSnapshot() {
  return {
    configured: false,
    categories: [],
    threads: [],
    latestThreads: [],
    locked: {
      privateCategoryCount: 0,
      privateThreadCount: 0,
      note: "Le forum n'est pas configure ou reste reserve aux membres."
    }
  };
}

async function isPublicWarsModuleEnabled(guildId: string) {
  const result = await query<{ active: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM guild_modules
        WHERE guild_id = $1
          AND module_key = 'wars_events'
          AND status = 'enabled'
      ) AS active
    `,
    [guildId]
  );

  return Boolean(result.rows[0]?.active);
}

async function getPublicWarsSnapshot(guildId: string, fallbackRealm: string): Promise<PublicWarsSnapshot> {
  const [events, weeklyObjectives] = await Promise.all([
    getPublicUpcomingEvents(guildId, fallbackRealm),
    getPublicWeeklyObjectives(guildId)
  ]);

  return {
    nextEvent: events[0] ?? null,
    events,
    weeklyObjectives
  };
}

async function getPublicUpcomingEvents(guildId: string, fallbackRealm: string) {
  const result = await query<PublicEventRow>(
    `
      SELECT
        e.id::text,
        e.title,
        e.event_type AS "eventType",
        e.starts_at AS "startsAt",
        e.ends_at AS "endsAt",
        COALESCE(NULLIF(s.code, ''), $2) AS realm
      FROM events e
      LEFT JOIN servers s ON s.id = e.server_id
      WHERE e.guild_id = $1
        AND e.cancelled_at IS NULL
        AND COALESCE(e.ends_at, e.starts_at) >= now()
      ORDER BY e.starts_at ASC
      LIMIT 6
    `,
    [guildId, fallbackRealm]
  );

  return result.rows.map((row) => toPublicEventResource(row, fallbackRealm));
}

async function getPublicWeeklyObjectives(guildId: string): Promise<PublicWarsSnapshot["weeklyObjectives"]> {
  const stats = await query<{ total: number | string; done: number | string }>(
    `
      WITH bounds AS (
        SELECT date_trunc('week', now()) AS week_start,
               date_trunc('week', now()) + interval '7 days' AS week_end
      ),
      weekly AS (
        SELECT o.*
        FROM objectives o, bounds b
        WHERE o.guild_id = $1
          AND o.status <> 'cancelled'
          AND (
            (o.due_at >= b.week_start AND o.due_at < b.week_end)
            OR (o.due_at IS NULL AND o.created_at >= b.week_start AND o.created_at < b.week_end)
          )
      )
      SELECT
        count(w.id)::int AS total,
        count(w.id) FILTER (WHERE w.status = 'done')::int AS done
      FROM weekly w
    `,
    [guildId]
  );
  const objectives = await query<PublicObjectiveRow>(
    `
      WITH bounds AS (
        SELECT date_trunc('week', now()) AS week_start,
               date_trunc('week', now()) + interval '7 days' AS week_end
      )
      SELECT
        o.id::text,
        o.title,
        o.status,
        o.due_at AS "dueAt",
        e.title AS "eventTitle"
      FROM objectives o
      LEFT JOIN events e ON e.id = o.event_id
      CROSS JOIN bounds b
      WHERE o.guild_id = $1
        AND o.status <> 'cancelled'
        AND (
          (o.due_at >= b.week_start AND o.due_at < b.week_end)
          OR (o.due_at IS NULL AND o.created_at >= b.week_start AND o.created_at < b.week_end)
        )
      ORDER BY o.due_at ASC NULLS LAST, o.created_at DESC
      LIMIT 6
    `,
    [guildId]
  );
  const total = Number(stats.rows[0]?.total ?? 0);
  const done = Number(stats.rows[0]?.done ?? 0);

  return {
    total,
    done,
    completionRate: total ? done / total : 0,
    objectives: objectives.rows.map(toPublicObjectiveResource)
  };
}

function createEmptyPublicWarsSnapshot(): PublicWarsSnapshot {
  return {
    nextEvent: null,
    events: [],
    weeklyObjectives: {
      total: 0,
      done: 0,
      completionRate: 0,
      objectives: []
    }
  };
}

function toPublicEventResource(row: PublicEventRow, fallbackRealm = "") {
  const startsAt = asIsoString(row.startsAt) || "";
  const endsAt = asIsoString(row.endsAt);

  return {
    id: row.id,
    title: asString(row.title),
    label: asString(row.title),
    eventType: asString(row.eventType),
    type: asString(row.eventType),
    startsAt,
    endsAt,
    realm: asString(row.realm) || fallbackRealm,
    status: getPublicEventStatus(startsAt, endsAt)
  };
}

function toPublicObjectiveResource(row: PublicObjectiveRow) {
  return {
    id: row.id,
    title: asString(row.title),
    status: asString(row.status) || "open",
    dueAt: asIsoString(row.dueAt),
    eventTitle: asString(row.eventTitle)
  };
}

function getPublicEventStatus(startsAt: string, endsAt: string | null) {
  const startTime = Date.parse(startsAt);
  const endTime = endsAt ? Date.parse(endsAt) : Number.NaN;
  const now = Date.now();

  if (!Number.isFinite(startTime)) return "scheduled";
  if (startTime <= now && (!Number.isFinite(endTime) || endTime >= now)) return "live";
  if (startTime > now) return "upcoming";
  return "ended";
}

async function assertPublicJoinNotBlocked(
  db: Queryable,
  guildId: string,
  userId: string,
  nickname: string
): Promise<void> {
  const normalizedNickname = normalizeBlockKey(nickname);
  const result = await db.query<{ id: string; nickname: string }>(
    `
      SELECT id::text, nickname
      FROM guild_member_blocks
      WHERE guild_id = $1
        AND lifted_at IS NULL
        AND (
          user_id = $2
          OR normalized_nickname = $3::citext
        )
      LIMIT 1
    `,
    [guildId, userId, normalizedNickname]
  );
  const block = result.rows[0];

  if (block) {
    throw new ForbiddenError("Vous ne pouvez pas rejoindre cette guilde.");
  }
}

function normalizeBlockKey(value: string): string {
  return asString(value).replace(/\s+/g, " ").slice(0, 80).toLowerCase();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeInviteToken(value: unknown): string {
  const token = asString(value).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 96);
  return token === "active" ? "" : token;
}

function asIsoString(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return null;
}

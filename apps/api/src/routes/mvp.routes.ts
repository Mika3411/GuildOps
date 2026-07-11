import { Router } from "express";
import { database, query } from "../db/pool.js";
import { asyncHandler } from "../http/async-handler.js";
import { getAuth, requireAuth } from "../security/auth.js";
import { canSendSos } from "./alerts.routes.js";
import { canManageDiplomacy, getDiplomacySnapshot } from "./diplomacy.routes.js";
import {
  DEFAULT_VISIBLE_GUILD_MODULE_KEYS,
  listActiveGuildModuleKeys,
  withDefaultGuildModuleKeys,
  type GuildModuleKey
} from "./guild-modules.service.js";
import { buildMePayload } from "./me.service.js";

export const mvpRouter = Router();

mvpRouter.get(
  "/mvp/bootstrap",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const auth = getAuth(res);
    const me = await buildMePayload({ query }, auth.user.id, auth.sessionId);
    const activeGuild = me.context.activeGuild;

    if (!activeGuild) {
      res.json({
        authUser: me.user,
        context: me.context,
        organizations: me.organizations,
        guilds: me.guilds,
        enabledModules: [...DEFAULT_VISIBLE_GUILD_MODULE_KEYS],
        events: [],
        members: [],
        diplomacyRows: [],
        napAgreements: [],
        coordinates: [],
        diplomacyAuditLog: [],
        bankRequests: [],
        bankResources: [],
        bankMovements: [],
        bankHistory: [],
        duplicateSuggestions: [],
        permissionRoles: [],
        forumThreads: [],
        publicChat: [],
        internalMessages: [],
        sosAlerts: [],
        site: { published: false }
      });
      return;
    }

    const enabledModules = withDefaultGuildModuleKeys(await listActiveGuildModuleKeys(database, activeGuild.id));
    const enabledModuleSet = new Set<GuildModuleKey>(enabledModules);
    const loadEvents = enabledModuleSet.has("wars_events");
    const loadSos = enabledModuleSet.has("sos_attack");
    const loadBank = enabledModuleSet.has("bank");
    const loadDiplomacy = enabledModuleSet.has("diplomacy");
    const loadForum = enabledModuleSet.has("forum");
    const loadMessages = enabledModuleSet.has("messages");

    const canManageDiplomacySnapshot = loadDiplomacy
      ? await canManageDiplomacy(
          activeGuild.id,
          me.user.id,
          activeGuild.organizationRole,
          me.user.globalRole
        )
      : false;
    const canUseSosSnapshot = loadSos
      ? await canSendSos(
          database,
          activeGuild.id,
          me.user.id,
          activeGuild.organizationRole,
          me.user.globalRole
        )
      : false;

    const [
      site,
      events,
      members,
      bank,
      diplomacy,
      internalMessages,
      publicChat,
      sosAlerts,
      forumThreads
    ] = await Promise.all([
      getSite(activeGuild.id),
      loadEvents ? getEvents(activeGuild.id) : Promise.resolve([]),
      getMembers(activeGuild.id),
      loadBank ? getBank(activeGuild.id) : Promise.resolve(createEmptyBankSnapshot()),
      loadDiplomacy ? getDiplomacySnapshot(activeGuild.id, canManageDiplomacySnapshot) : Promise.resolve(createEmptyDiplomacySnapshot()),
      loadMessages ? getInternalMessages(activeGuild.id, me.user.id) : Promise.resolve([]),
      loadMessages ? getPublicChat(activeGuild.id) : Promise.resolve([]),
      loadSos && canUseSosSnapshot ? getSosAlerts(activeGuild.id) : Promise.resolve([]),
      loadForum ? getForumThreads(activeGuild.id) : Promise.resolve([])
    ]);

    res.json({
      authUser: me.user,
      context: me.context,
      organizations: me.organizations,
      guilds: me.guilds,
      enabledModules,
      events,
      members,
      diplomacyRows: diplomacy.relations,
      napAgreements: diplomacy.napAgreements,
      coordinates: diplomacy.coordinates,
      diplomacyAuditLog: diplomacy.auditLog,
      bankRequests: bank.requests,
      bankResources: bank.resources,
      bankMovements: bank.movements,
      bankHistory: bank.movements.map((movement) => ({
        time: movement.time,
        text:
          movement.type === "command"
            ? movement.note
            : `${movement.actor || "Banque"}: ${movement.type === "in" ? "+" : "-"}${movement.amount}${movement.unit || ""} ${movement.resource || movement.resourceCode || ""}`.trim()
      })),
      permissionRoles: [],
      forumThreads,
      publicChat,
      internalMessages,
      sosAlerts,
      site
    });
  })
);

function createEmptyBankSnapshot() {
  return { resources: [], requests: [], movements: [] };
}

function createEmptyDiplomacySnapshot() {
  return { relations: [], napAgreements: [], coordinates: [], auditLog: [] };
}

async function getSite(guildId: string) {
  const result = await query(
    `
      SELECT
        gs.id::text,
        gs.guild_id::text AS "guildId",
        gs.public_slug::text AS "publicSlug",
        gs.public_slug::text AS slug,
        gs.title,
        gs.guild_name AS "guildName",
        gs.game,
        gs.realm,
        gs.tagline,
        gs.objective,
        gs.theme,
        gs.colors_json AS colors,
        gs.typography_json AS typography,
        gs.sections_json AS sections,
        gs.hero_text AS "heroText",
        gs.status,
        (gs.status = 'published') AS published,
        gs.published_at AS "publishedAt"
      FROM guild_sites gs
      WHERE gs.guild_id = $1
      LIMIT 1
    `,
    [guildId]
  );

  return result.rows[0] ?? { guildId, published: false };
}

async function getEvents(guildId: string) {
  const result = await query(
    `
      SELECT
        id::text,
        title,
        event_type AS "eventType",
        event_type AS type,
        starts_at AS "startsAt",
        ends_at AS "endsAt",
        location_label AS "locationLabel",
        location_x AS "locationX",
        location_y AS "locationY",
        reminder_offsets_minutes AS "reminderOffsetsMinutes",
        to_char(starts_at AT TIME ZONE 'UTC', 'DD/MM HH24:MI') AS time,
        CASE
          WHEN cancelled_at IS NOT NULL THEN 'Annule'
          WHEN starts_at < now() THEN 'Termine'
          ELSE 'Planifie'
        END AS status
      FROM events
      WHERE guild_id = $1
        AND cancelled_at IS NULL
      ORDER BY starts_at ASC
      LIMIT 20
    `,
    [guildId]
  );

  return result.rows;
}

async function getMembers(guildId: string) {
  const result = await query(
    `
      SELECT
        gm.id::text,
        gm.user_id::text AS "userId",
        gm.nickname AS name,
        gm.nickname,
        gm.power_score::text AS power,
        gm.language,
        gm.status,
        COALESCE(array_remove(array_agg(DISTINCT roles.code::text), NULL), ARRAY[]::text[]) AS roles
      FROM guild_members gm
      LEFT JOIN guild_member_roles gmr ON gmr.guild_member_id = gm.id
      LEFT JOIN roles ON roles.id = gmr.role_id
      WHERE gm.guild_id = $1
        AND gm.status NOT IN ('banned', 'left')
      GROUP BY gm.id
      ORDER BY gm.nickname ASC
      LIMIT 200
    `,
    [guildId]
  );

  return result.rows;
}

async function getBank(guildId: string) {
  const bankResult = await query<{ id: string }>("SELECT id::text FROM banks WHERE guild_id = $1 LIMIT 1", [guildId]);
  const bank = bankResult.rows[0];

  if (!bank) {
    return { resources: [], requests: [], movements: [] };
  }

  const [resources, requests, movements] = await Promise.all([
    query(
      `
        SELECT
          resource_code::text AS code,
          resource_code::text AS "resourceCode",
          resource_name AS name,
          resource_name AS "resourceName",
          amount::text,
          unit,
          updated_at AS "updatedAt"
        FROM bank_resources
        WHERE bank_id = $1
        ORDER BY resource_name ASC
      `,
      [bank.id]
    ),
    query(
      `
        SELECT
          br.id::text,
          requester.nickname AS member,
          requester.nickname AS requester,
          br.resource_code::text AS "resourceCode",
          COALESCE(resource.resource_name, br.resource_code::text) AS resource,
          br.amount::text,
          resource.unit,
          br.reason,
          br.status,
          br.created_at AS "createdAt"
        FROM bank_requests br
        JOIN guild_members requester ON requester.id = br.requester_member_id
        LEFT JOIN bank_resources resource
          ON resource.bank_id = br.bank_id
         AND resource.resource_code = br.resource_code
        WHERE br.bank_id = $1
        ORDER BY br.created_at DESC
        LIMIT 50
      `,
      [bank.id]
    ),
    query(
      `
        SELECT
          bm.id::text,
          bm.created_at AS time,
          bm.movement_type AS type,
          bm.resource_code::text AS "resourceCode",
          resource.resource_name AS resource,
          bm.amount::text,
          bm.unit,
          actor.nickname AS actor,
          bm.note
        FROM bank_movements bm
        LEFT JOIN guild_members actor ON actor.id = bm.actor_member_id
        LEFT JOIN bank_resources resource
          ON resource.bank_id = bm.bank_id
         AND resource.resource_code = bm.resource_code
        WHERE bm.bank_id = $1
        ORDER BY bm.created_at DESC
        LIMIT 50
      `,
      [bank.id]
    )
  ]);

  return { resources: resources.rows, requests: requests.rows, movements: movements.rows };
}

async function getPublicChat(guildId: string) {
  const result = await query(
    `
      SELECT
        id::text,
        guest_name AS author,
        source_language AS source,
        body AS text,
        body AS translated,
        true AS public,
        created_at AS "createdAt"
      FROM public_chat_messages
      WHERE guild_id = $1
        AND moderation_status = 'visible'
      ORDER BY created_at DESC
      LIMIT 30
    `,
    [guildId]
  );

  return [...result.rows].reverse();
}

async function getInternalMessages(guildId: string, userId: string) {
  const result = await query(
    `
      SELECT
        pm.id::text,
        COALESCE(sender.display_name, 'GuildOps') AS "from",
        COALESCE(NULLIF(pm.metadata->>'channel', ''), 'general') AS channel,
        pm.body AS text,
        pm.created_at AS "createdAt",
        CASE
          WHEN pm.sender_user_id = $2 THEN 0
          WHEN rr.message_id IS NULL THEN 1
          ELSE 0
        END AS unread
      FROM private_messages pm
      LEFT JOIN users sender ON sender.id = pm.sender_user_id
      LEFT JOIN message_read_receipts rr ON rr.message_id = pm.id AND rr.user_id = $2
      WHERE pm.guild_id = $1
        AND pm.recipient_user_id IS NULL
        AND pm.deleted_by_sender_at IS NULL
        AND pm.deleted_by_recipient_at IS NULL
      ORDER BY pm.created_at DESC
      LIMIT 40
    `,
    [guildId, userId]
  );

  return [...result.rows].reverse();
}

async function getForumThreads(guildId: string) {
  const result = await query(
    `
      SELECT
        ft.id::text,
        ft.category_id::text AS "categoryId",
        fc.name AS "categoryName",
        COALESCE(author.nickname, 'Membre') AS "authorName",
        ft.title,
        ft.pinned_at IS NOT NULL AS pinned,
        ft.locked_at IS NOT NULL AS locked,
        ft.created_at::text AS "createdAt",
        COALESCE(ft.last_post_at, ft.created_at)::text AS "lastPostAt",
        count(fp.id) FILTER (WHERE fp.deleted_at IS NULL)::int AS "postCount",
        GREATEST(count(fp.id) FILTER (WHERE fp.deleted_at IS NULL)::int - 1, 0) AS "replyCount",
        (
          SELECT first_post.body
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
        AND fc.visibility IN ('public', 'members')
      GROUP BY ft.id, fc.name, author.nickname
      ORDER BY ft.pinned_at DESC NULLS LAST, COALESCE(ft.last_post_at, ft.created_at) DESC
      LIMIT 20
    `,
    [guildId]
  );

  return result.rows;
}

async function getSosAlerts(guildId: string) {
  const result = await query(
    `
      SELECT
        id::text,
        title AS target,
        title AS "targetLabel",
        alert_type AS type,
        alert_type AS "attackType",
        message,
        message AS details,
        status,
        created_at AS "createdAt"
      FROM alerts
      WHERE guild_id = $1
        AND alert_type = 'attack'
      ORDER BY created_at DESC
      LIMIT 20
    `,
    [guildId]
  );

  return result.rows;
}

import { Router } from "express";
import { z } from "zod";
import { database, query, withClient, type Queryable } from "../db/pool.js";
import { asyncHandler } from "../http/async-handler.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../http/errors.js";
import { validate } from "../http/validate.js";
import { getAuth, requireAuth, type AuthContext } from "../security/auth.js";
import { assertGuildAccess } from "./access.js";
import { uuidSchema } from "./helpers.js";

export const diplomacyRouter = Router();

const guildParamsSchema = z.object({
  guildId: uuidSchema
});

const relationParamsSchema = z.object({
  guildId: uuidSchema,
  relationId: uuidSchema
});

const napParamsSchema = z.object({
  guildId: uuidSchema,
  agreementId: uuidSchema
});

const coordinateParamsSchema = z.object({
  guildId: uuidSchema,
  coordinateId: uuidSchema
});

const relationBodySchema = z
  .object({
    tag: z.string().trim().max(16).nullable().optional(),
    name: z.string().trim().min(2).max(140),
    relationType: z.enum(["ally", "enemy", "nap", "neutral", "watchlist"]),
    stance: z.string().trim().max(120).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional()
  })
  .strict();

const napBodySchema = z
  .object({
    relationId: uuidSchema.nullable().optional(),
    title: z.string().trim().min(2).max(180),
    terms: z.string().trim().min(2).max(3000),
    startsAt: z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Use an ISO-8601 datetime").nullable().optional(),
    endsAt: z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Use an ISO-8601 datetime").nullable().optional(),
    status: z.enum(["draft", "active", "expired", "cancelled"]).default("active")
  })
  .strict();

const coordinateBodySchema = z
  .object({
    relationId: uuidSchema.nullable().optional(),
    label: z.string().trim().min(2).max(160),
    x: z.coerce.number().int().min(0).max(9999),
    y: z.coerce.number().int().min(0).max(9999),
    category: z.string().trim().min(2).max(80).default("important"),
    visibility: z.enum(["public", "members", "officers", "admins"]).default("members"),
    notes: z.string().trim().max(2000).nullable().optional()
  })
  .strict();

type GuildParams = z.infer<typeof guildParamsSchema>;
type RelationParams = z.infer<typeof relationParamsSchema>;
type NapParams = z.infer<typeof napParamsSchema>;
type CoordinateParams = z.infer<typeof coordinateParamsSchema>;
type RelationBody = z.infer<typeof relationBodySchema>;
type NapBody = z.infer<typeof napBodySchema>;
type CoordinateBody = z.infer<typeof coordinateBodySchema>;

export type DiplomacySnapshot = {
  relations: Record<string, unknown>[];
  napAgreements: Record<string, unknown>[];
  coordinates: Record<string, unknown>[];
  auditLog: Record<string, unknown>[];
};

diplomacyRouter.get(
  "/guilds/:guildId/diplomacy",
  requireAuth,
  validate({ params: guildParamsSchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId } = req.params as GuildParams;
    const access = await assertGuildAccess(database, guildId, auth.user.id);
    const canManage = await canManageDiplomacy(guildId, auth.user.id, access.organization_role, auth.user.globalRole);

    res.json(await getDiplomacySnapshot(guildId, canManage));
  })
);

diplomacyRouter.get(
  "/guilds/:guildId/diplomacy/relations",
  requireAuth,
  validate({ params: guildParamsSchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId } = req.params as GuildParams;
    const access = await assertGuildAccess(database, guildId, auth.user.id);
    const canManage = await canManageDiplomacy(guildId, auth.user.id, access.organization_role, auth.user.globalRole);

    res.json({
      relations: await getDiplomacyRelations(guildId, canManage)
    });
  })
);

diplomacyRouter.post(
  "/guilds/:guildId/diplomacy/relations",
  requireAuth,
  validate({ params: guildParamsSchema, body: relationBodySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId } = req.params as GuildParams;
    const body = req.body as RelationBody;
    const access = await assertGuildAccess(database, guildId, auth.user.id);
    await assertCanManageDiplomacy(guildId, auth.user.id, access.organization_role, auth.user.globalRole);

    await saveRelation(guildId, null, body, auth);
    const snapshot = await getDiplomacySnapshot(guildId, true);
    res.status(201).json(snapshot);
  })
);

diplomacyRouter.patch(
  "/guilds/:guildId/diplomacy/relations/:relationId",
  requireAuth,
  validate({ params: relationParamsSchema, body: relationBodySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId, relationId } = req.params as RelationParams;
    const body = req.body as RelationBody;
    const access = await assertGuildAccess(database, guildId, auth.user.id);
    await assertCanManageDiplomacy(guildId, auth.user.id, access.organization_role, auth.user.globalRole);

    await saveRelation(guildId, relationId, body, auth);
    res.json(await getDiplomacySnapshot(guildId, true));
  })
);

diplomacyRouter.post(
  "/guilds/:guildId/diplomacy/nap",
  requireAuth,
  validate({ params: guildParamsSchema, body: napBodySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId } = req.params as GuildParams;
    const body = req.body as NapBody;
    const access = await assertGuildAccess(database, guildId, auth.user.id);
    await assertCanManageDiplomacy(guildId, auth.user.id, access.organization_role, auth.user.globalRole);

    await saveNapAgreement(guildId, null, body, auth);
    res.status(201).json(await getDiplomacySnapshot(guildId, true));
  })
);

diplomacyRouter.patch(
  "/guilds/:guildId/diplomacy/nap/:agreementId",
  requireAuth,
  validate({ params: napParamsSchema, body: napBodySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId, agreementId } = req.params as NapParams;
    const body = req.body as NapBody;
    const access = await assertGuildAccess(database, guildId, auth.user.id);
    await assertCanManageDiplomacy(guildId, auth.user.id, access.organization_role, auth.user.globalRole);

    await saveNapAgreement(guildId, agreementId, body, auth);
    res.json(await getDiplomacySnapshot(guildId, true));
  })
);

diplomacyRouter.get(
  "/guilds/:guildId/coordinates",
  requireAuth,
  validate({ params: guildParamsSchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId } = req.params as GuildParams;
    const access = await assertGuildAccess(database, guildId, auth.user.id);
    const canManage = await canManageDiplomacy(guildId, auth.user.id, access.organization_role, auth.user.globalRole);

    res.json({
      coordinates: await getCoordinates(guildId, canManage)
    });
  })
);

diplomacyRouter.post(
  "/guilds/:guildId/coordinates",
  requireAuth,
  validate({ params: guildParamsSchema, body: coordinateBodySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId } = req.params as GuildParams;
    const body = req.body as CoordinateBody;
    const access = await assertGuildAccess(database, guildId, auth.user.id);
    await assertCanManageDiplomacy(guildId, auth.user.id, access.organization_role, auth.user.globalRole);

    await saveCoordinate(guildId, null, body, auth);
    res.status(201).json(await getDiplomacySnapshot(guildId, true));
  })
);

diplomacyRouter.patch(
  "/guilds/:guildId/coordinates/:coordinateId",
  requireAuth,
  validate({ params: coordinateParamsSchema, body: coordinateBodySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId, coordinateId } = req.params as CoordinateParams;
    const body = req.body as CoordinateBody;
    const access = await assertGuildAccess(database, guildId, auth.user.id);
    await assertCanManageDiplomacy(guildId, auth.user.id, access.organization_role, auth.user.globalRole);

    await saveCoordinate(guildId, coordinateId, body, auth);
    res.json(await getDiplomacySnapshot(guildId, true));
  })
);

export async function getDiplomacySnapshot(guildId: string, canManage: boolean): Promise<DiplomacySnapshot> {
  return {
    relations: await getDiplomacyRelations(guildId, canManage),
    napAgreements: await getNapAgreements(guildId),
    coordinates: await getCoordinates(guildId, canManage),
    auditLog: canManage ? await getAuditLog(guildId) : []
  };
}

async function getDiplomacyRelations(guildId: string, canManage: boolean): Promise<Record<string, unknown>[]> {
  const result = await query(
    `
      SELECT
        de.id::text,
        de.tag,
        de.name,
        de.relation_type AS "relationType",
        de.stance,
        CASE WHEN $2::boolean THEN de.notes ELSE NULL END AS notes,
        created_by.display_name AS "createdByName",
        updated_by.display_name AS "updatedByName",
        de.created_at::text AS "createdAt",
        de.updated_at::text AS "updatedAt"
      FROM diplomacy_entries de
      LEFT JOIN users created_by ON created_by.id = de.created_by
      LEFT JOIN users updated_by ON updated_by.id = de.updated_by
      WHERE de.guild_id = $1
      ORDER BY
        CASE de.relation_type
          WHEN 'ally' THEN 1
          WHEN 'nap' THEN 2
          WHEN 'enemy' THEN 3
          ELSE 4
        END,
        de.name ASC
    `,
    [guildId, canManage]
  );

  return result.rows;
}

async function getNapAgreements(guildId: string): Promise<Record<string, unknown>[]> {
  const result = await query(
    `
      SELECT
        na.id::text,
        na.diplomacy_entry_id::text AS "relationId",
        de.name AS "relationName",
        de.tag AS "relationTag",
        na.title,
        na.terms,
        na.starts_at::text AS "startsAt",
        na.ends_at::text AS "endsAt",
        CASE
          WHEN na.status = 'active' AND na.ends_at IS NOT NULL AND na.ends_at < now() THEN 'expired'
          ELSE na.status
        END AS status,
        created_by.display_name AS "createdByName",
        na.created_at::text AS "createdAt",
        na.updated_at::text AS "updatedAt"
      FROM nap_agreements na
      LEFT JOIN diplomacy_entries de ON de.id = na.diplomacy_entry_id
      LEFT JOIN users created_by ON created_by.id = na.created_by
      WHERE na.guild_id = $1
      ORDER BY COALESCE(na.ends_at, na.created_at) ASC
    `,
    [guildId]
  );

  return result.rows;
}

async function getCoordinates(guildId: string, canManage: boolean): Promise<Record<string, unknown>[]> {
  const visibilityClause = canManage ? "" : "AND c.visibility IN ('public', 'members')";
  const result = await query(
    `
      SELECT
        c.id::text,
        c.diplomacy_entry_id::text AS "relationId",
        de.name AS "relationName",
        c.label,
        c.x,
        c.y,
        c.category,
        c.visibility,
        CASE WHEN $2::boolean THEN c.notes ELSE NULL END AS notes,
        created_by.display_name AS "createdByName",
        c.created_at::text AS "createdAt",
        c.updated_at::text AS "updatedAt"
      FROM coordinates c
      LEFT JOIN diplomacy_entries de ON de.id = c.diplomacy_entry_id
      LEFT JOIN users created_by ON created_by.id = c.created_by
      WHERE c.guild_id = $1
      ${visibilityClause}
      ORDER BY c.category ASC, c.label ASC
    `,
    [guildId, canManage]
  );

  return result.rows;
}

async function getAuditLog(guildId: string): Promise<Record<string, unknown>[]> {
  const result = await query(
    `
      SELECT
        al.id::text,
        al.action,
        al.target_table AS "targetTable",
        al.target_id::text AS "targetId",
        actor.display_name AS "actorName",
        al.metadata,
        al.created_at::text AS "createdAt"
      FROM audit_logs al
      LEFT JOIN users actor ON actor.id = al.actor_user_id
      WHERE al.guild_id = $1
        AND al.target_table IN ('diplomacy_entries', 'nap_agreements', 'coordinates')
      ORDER BY al.created_at DESC
      LIMIT 40
    `,
    [guildId]
  );

  return result.rows;
}

async function saveRelation(
  guildId: string,
  relationId: string | null,
  body: RelationBody,
  auth: AuthContext
): Promise<void> {
  await withClient(async (client) => {
    await client.query("BEGIN");

    try {
      const memberId = await getGuildMemberId(client, guildId, auth.user.id);
      const result = relationId
        ? await client.query<{ id: string }>(
            `
              UPDATE diplomacy_entries
              SET tag = $3,
                  name = $4,
                  relation_type = $5,
                  stance = $6,
                  notes = $7,
                  updated_by = $8
              WHERE guild_id = $1
                AND id = $2
              RETURNING id::text
            `,
            [
              guildId,
              relationId,
              emptyToNull(body.tag),
              body.name,
              body.relationType,
              emptyToNull(body.stance),
              emptyToNull(body.notes),
              auth.user.id
            ]
          )
        : await client.query<{ id: string }>(
            `
              INSERT INTO diplomacy_entries (guild_id, tag, name, relation_type, stance, notes, created_by, updated_by)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
              RETURNING id::text
            `,
            [
              guildId,
              emptyToNull(body.tag),
              body.name,
              body.relationType,
              emptyToNull(body.stance),
              emptyToNull(body.notes),
              auth.user.id
            ]
          );
      const savedId = result.rows[0]?.id;

      if (!savedId) throw new NotFoundError("Diplomacy relation not found");

      await insertAudit(client, {
        guildId,
        actorUserId: auth.user.id,
        actorMemberId: memberId,
        action: relationId ? "diplomacy.relation.updated" : "diplomacy.relation.created",
        targetTable: "diplomacy_entries",
        targetId: savedId,
        metadata: body
      });

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

async function saveNapAgreement(
  guildId: string,
  agreementId: string | null,
  body: NapBody,
  auth: AuthContext
): Promise<void> {
  await assertRelationBelongsToGuild(guildId, body.relationId ?? null);

  await withClient(async (client) => {
    await client.query("BEGIN");

    try {
      const memberId = await getGuildMemberId(client, guildId, auth.user.id);
      const result = agreementId
        ? await client.query<{ id: string }>(
            `
              UPDATE nap_agreements
              SET diplomacy_entry_id = $3,
                  title = $4,
                  terms = $5,
                  starts_at = $6,
                  ends_at = $7,
                  status = $8
              WHERE guild_id = $1
                AND id = $2
              RETURNING id::text
            `,
            [
              guildId,
              agreementId,
              body.relationId ?? null,
              body.title,
              body.terms,
              body.startsAt ?? null,
              body.endsAt ?? null,
              body.status
            ]
          )
        : await client.query<{ id: string }>(
            `
              INSERT INTO nap_agreements (guild_id, diplomacy_entry_id, title, terms, starts_at, ends_at, status, created_by)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
              RETURNING id::text
            `,
            [
              guildId,
              body.relationId ?? null,
              body.title,
              body.terms,
              body.startsAt ?? null,
              body.endsAt ?? null,
              body.status,
              auth.user.id
            ]
          );
      const savedId = result.rows[0]?.id;

      if (!savedId) throw new NotFoundError("NAP agreement not found");

      await insertAudit(client, {
        guildId,
        actorUserId: auth.user.id,
        actorMemberId: memberId,
        action: agreementId ? "diplomacy.nap.updated" : "diplomacy.nap.created",
        targetTable: "nap_agreements",
        targetId: savedId,
        metadata: body
      });

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

async function saveCoordinate(
  guildId: string,
  coordinateId: string | null,
  body: CoordinateBody,
  auth: AuthContext
): Promise<void> {
  await assertRelationBelongsToGuild(guildId, body.relationId ?? null);

  await withClient(async (client) => {
    await client.query("BEGIN");

    try {
      const memberId = await getGuildMemberId(client, guildId, auth.user.id);
      const result = coordinateId
        ? await client.query<{ id: string }>(
            `
              UPDATE coordinates
              SET diplomacy_entry_id = $3,
                  label = $4,
                  x = $5,
                  y = $6,
                  category = $7,
                  visibility = $8,
                  notes = $9
              WHERE guild_id = $1
                AND id = $2
              RETURNING id::text
            `,
            [
              guildId,
              coordinateId,
              body.relationId ?? null,
              body.label,
              body.x,
              body.y,
              body.category,
              body.visibility,
              emptyToNull(body.notes)
            ]
          )
        : await client.query<{ id: string }>(
            `
              INSERT INTO coordinates (guild_id, diplomacy_entry_id, label, x, y, category, visibility, notes, created_by)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
              RETURNING id::text
            `,
            [
              guildId,
              body.relationId ?? null,
              body.label,
              body.x,
              body.y,
              body.category,
              body.visibility,
              emptyToNull(body.notes),
              auth.user.id
            ]
          );
      const savedId = result.rows[0]?.id;

      if (!savedId) throw new NotFoundError("Coordinate not found");

      await insertAudit(client, {
        guildId,
        actorUserId: auth.user.id,
        actorMemberId: memberId,
        action: coordinateId ? "diplomacy.coordinate.updated" : "diplomacy.coordinate.created",
        targetTable: "coordinates",
        targetId: savedId,
        metadata: body
      });

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

async function assertCanManageDiplomacy(
  guildId: string,
  userId: string,
  organizationRole: string,
  globalRole: string
): Promise<void> {
  const allowed = await canManageDiplomacy(guildId, userId, organizationRole, globalRole);

  if (!allowed) {
    throw new ForbiddenError("Permission manage_diplomacy is required");
  }
}

export async function canManageDiplomacy(
  guildId: string,
  userId: string,
  organizationRole: string,
  globalRole: string
): Promise<boolean> {
  if (["owner", "admin"].includes(organizationRole) || globalRole === "admin") return true;

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
        AND p.key IN ('manage_diplomacy', 'admin_all')
      LIMIT 1
    `,
    [guildId, userId]
  );

  return Boolean(result.rows[0]?.allowed);
}

async function assertRelationBelongsToGuild(guildId: string, relationId: string | null): Promise<void> {
  if (!relationId) return;

  const result = await query<{ id: string }>(
    "SELECT id::text FROM diplomacy_entries WHERE guild_id = $1 AND id = $2 LIMIT 1",
    [guildId, relationId]
  );

  if (!result.rows[0]) {
    throw new BadRequestError("Diplomacy relation does not belong to this guild");
  }
}

async function getGuildMemberId(db: Queryable, guildId: string, userId: string): Promise<string | null> {
  const result = await db.query<{ id: string }>(
    "SELECT id::text FROM guild_members WHERE guild_id = $1 AND user_id = $2 LIMIT 1",
    [guildId, userId]
  );

  return result.rows[0]?.id ?? null;
}

async function insertAudit(
  db: Queryable,
  input: {
    guildId: string;
    actorUserId: string;
    actorMemberId: string | null;
    action: string;
    targetTable: string;
    targetId: string;
    metadata: unknown;
  }
): Promise<void> {
  await db.query(
    `
      INSERT INTO audit_logs (guild_id, actor_user_id, actor_member_id, action, target_table, target_id, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [
      input.guildId,
      input.actorUserId,
      input.actorMemberId,
      input.action,
      input.targetTable,
      input.targetId,
      input.metadata
    ]
  );
}

function emptyToNull(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

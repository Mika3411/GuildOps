import { Router } from "express";
import { z } from "zod";
import { database, query, withClient, type Queryable } from "../db/pool.js";
import { asyncHandler } from "../http/async-handler.js";
import { BadRequestError, NotFoundError } from "../http/errors.js";
import { addGuildAlertClient, publishGuildAlertEvent } from "../realtime/alerts.js";
import { getAuth, requireAuth, type AuthContext } from "../security/auth.js";
import { validate } from "../http/validate.js";
import { assertGuildAccess } from "./access.js";
import { uuidSchema } from "./helpers.js";

export const alertsRouter = Router();

type AlertAcknowledgementResponse = "seen" | "joining" | "cannot_join" | "resolved";
type AlertCallKind = "defense" | "attack";

type AlertResource = {
  id: string;
  guildId: string;
  serverId: string | null;
  createdByMemberId: string | null;
  createdByName: string | null;
  severity: string;
  title: string;
  message: string;
  targetLabel: string | null;
  targetX: number | null;
  targetY: number | null;
  attackType: string;
  callKind: AlertCallKind;
  details: string;
  metadata: Record<string, unknown>;
  status: string;
  expiresAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  acknowledgements: AlertAcknowledgement[];
  acknowledgementSummary: AlertAcknowledgementSummary;
  myAcknowledgement: AlertAcknowledgement | null;
};

type AlertAcknowledgement = {
  memberId: string;
  memberName: string;
  response: AlertAcknowledgementResponse;
  responseLabel: string;
  note: string | null;
  acknowledgedAt: string;
};

type AlertAcknowledgementSummary = {
  seen: number;
  joining: number;
  cannotJoin: number;
  resolved: number;
  total: number;
};

type AlertRow = Omit<AlertResource, "acknowledgements" | "acknowledgementSummary" | "myAcknowledgement"> & {
  acknowledgements: unknown;
  acknowledgementSummary: unknown;
  myAcknowledgement: unknown;
};

const guildParamsSchema = z.object({
  guildId: uuidSchema
});

const alertParamsSchema = z.object({
  guildId: uuidSchema,
  alertId: uuidSchema
});

const alertsQuerySchema = z.object({
  status: z.enum(["active", "resolved", "cancelled", "expired", "all"]).optional().default("active"),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

const createAttackAlertBodySchema = z
  .object({
    serverId: uuidSchema.optional(),
    targetLabel: z.string().trim().min(2).max(160),
    targetX: z.coerce.number().int().optional(),
    targetY: z.coerce.number().int().optional(),
    attackType: z.string().trim().min(2).max(80),
    callKind: z
      .enum(["defense", "attack", "attaque"])
      .transform((value) => (value === "attaque" ? "attack" : value))
      .default("defense"),
    message: z.string().trim().min(3).max(2000),
    severity: z.enum(["low", "medium", "high", "critical"]).default("high"),
    expiresAt: z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Use an ISO-8601 datetime").optional()
  })
  .strict();

const acknowledgementBodySchema = z
  .object({
    response: z.string().trim().transform((value, ctx) => {
      const response = normalizeAcknowledgementResponse(value);

      if (!response) {
        ctx.addIssue({
          code: "custom",
          message: "response must be seen, joining, cannot_join, resolved, vu, en_route or impossible"
        });
        return z.NEVER;
      }

      return response;
    }),
    note: z.string().trim().max(500).nullable().optional()
  })
  .strict();

type GuildParams = z.infer<typeof guildParamsSchema>;
type AlertParams = z.infer<typeof alertParamsSchema>;
type AlertsQuery = z.infer<typeof alertsQuerySchema>;
type CreateAttackAlertBody = z.infer<typeof createAttackAlertBodySchema>;
type AcknowledgementBody = z.infer<typeof acknowledgementBodySchema>;

alertsRouter.get(
  "/guilds/:guildId/alerts/attack/stream",
  requireAuth,
  validate({ params: guildParamsSchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId } = req.params as GuildParams;
    await assertGuildAccess(database, guildId, auth.user.id);
    addGuildAlertClient(guildId, auth.user.id, res);
  })
);

alertsRouter.get(
  "/guilds/:guildId/alerts/attack",
  requireAuth,
  validate({ params: guildParamsSchema, query: alertsQuerySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId } = req.params as GuildParams;
    const filters = req.query as unknown as AlertsQuery;
    await assertGuildAccess(database, guildId, auth.user.id);

    res.json({
      alerts: await getAttackAlerts(guildId, auth.user.id, {
        status: filters.status,
        limit: filters.limit
      })
    });
  })
);

alertsRouter.post(
  "/guilds/:guildId/alerts/attack",
  requireAuth,
  validate({ params: guildParamsSchema, body: createAttackAlertBodySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId } = req.params as GuildParams;
    const body = req.body as CreateAttackAlertBody;
    await assertGuildAccess(database, guildId, auth.user.id);

    const alert = await withClient(async (client) => {
      await client.query("BEGIN");

      try {
        const member = await ensureGuildMemberForUser(client, guildId, auth);
        const insertResult = await client.query<{ id: string }>(
          `
            INSERT INTO alerts (
              guild_id,
              server_id,
              created_by_member_id,
              alert_type,
              severity,
              title,
              message,
              target_label,
              target_x,
              target_y,
              metadata,
              expires_at
            )
            VALUES ($1, $2, $3, 'attack', $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING id::text
          `,
          [
            guildId,
            body.serverId ?? null,
            member.id,
            body.severity,
            `${body.attackType}: ${body.targetLabel}`,
            body.message,
            body.targetLabel,
            body.targetX ?? null,
            body.targetY ?? null,
            {
              attackType: body.attackType,
              callKind: body.callKind,
              details: body.message,
              reminder: {
                createdFor: "render-worker",
                intervalSeconds: 180
              }
            },
            body.expiresAt ?? null
          ]
        );
        const alertId = insertResult.rows[0]?.id;

        if (!alertId) {
          throw new BadRequestError("Attack alert could not be created");
        }

        await enqueueReminderJobs(client, guildId, alertId);
        await client.query("COMMIT");
        return getAttackAlertById(guildId, alertId, auth.user.id);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });

    publishGuildAlertEvent(guildId, "attack-alert.created", { alert });
    res.status(201).json({ alert });
  })
);

alertsRouter.put(
  "/guilds/:guildId/alerts/attack/:alertId/acknowledgement",
  requireAuth,
  validate({ params: alertParamsSchema, body: acknowledgementBodySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId, alertId } = req.params as AlertParams;
    const body = req.body as AcknowledgementBody;
    await assertGuildAccess(database, guildId, auth.user.id);
    await assertAttackAlertExists(guildId, alertId);

    const member = await ensureGuildMemberForUser(database, guildId, auth);
    const acknowledgement = await upsertAcknowledgement(alertId, member.id, body.response, body.note);
    await markReminderJobsAnswered(alertId, member.id);
    const alert = await getAttackAlertById(guildId, alertId, auth.user.id);

    publishGuildAlertEvent(guildId, "attack-alert.acknowledged", {
      alertId,
      acknowledgement,
      acknowledgementSummary: alert.acknowledgementSummary
    });

    res.json({ acknowledgement, alert });
  })
);

alertsRouter.post(
  "/guilds/:guildId/alerts/attack/:alertId/broadcast",
  requireAuth,
  validate({ params: alertParamsSchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId, alertId } = req.params as AlertParams;
    await assertGuildAccess(database, guildId, auth.user.id);
    const alert = await getAttackAlertById(guildId, alertId, auth.user.id);
    await enqueueReminderJobs(database, guildId, alertId);

    publishGuildAlertEvent(guildId, "attack-alert.broadcast", { alert });
    res.json({ alert });
  })
);

alertsRouter.patch(
  "/guilds/:guildId/alerts/attack/:alertId/resolve",
  requireAuth,
  validate({ params: alertParamsSchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId, alertId } = req.params as AlertParams;
    await assertGuildAccess(database, guildId, auth.user.id, ["owner", "admin"]);

    const result = await query<{ id: string }>(
      `
        UPDATE alerts
        SET status = 'resolved',
            resolved_at = now()
        WHERE id = $1
          AND guild_id = $2
          AND alert_type = 'attack'
        RETURNING id::text
      `,
      [alertId, guildId]
    );

    if (!result.rows[0]) {
      throw new NotFoundError("Attack alert not found");
    }

    await query("UPDATE alert_reminder_jobs SET status = 'skipped' WHERE alert_id = $1 AND status = 'queued'", [alertId]);
    const alert = await getAttackAlertById(guildId, alertId, auth.user.id);
    publishGuildAlertEvent(guildId, "attack-alert.resolved", { alert });

    res.json({ alert });
  })
);

async function getAttackAlerts(
  guildId: string,
  userId: string,
  options: { status: AlertsQuery["status"]; limit: number }
): Promise<AlertResource[]> {
  const where = ["a.guild_id = $1", "a.alert_type = 'attack'"];
  const values: unknown[] = [guildId, userId];

  if (options.status !== "all") {
    values.push(options.status);
    where.push(`a.status = $${values.length}`);
  }

  values.push(options.limit);

  const result = await query<AlertRow>(
    `
      ${attackAlertSelectSql()}
      WHERE ${where.join(" AND ")}
      ORDER BY a.created_at DESC
      LIMIT $${values.length}
    `,
    values
  );

  return result.rows.map(toAlertResource);
}

async function getAttackAlertById(guildId: string, alertId: string, userId: string): Promise<AlertResource> {
  const result = await query<AlertRow>(
    `
      ${attackAlertSelectSql()}
      WHERE a.guild_id = $1
        AND a.alert_type = 'attack'
        AND a.id = $3
      LIMIT 1
    `,
    [guildId, userId, alertId]
  );

  const alert = result.rows[0];

  if (!alert) {
    throw new NotFoundError("Attack alert not found");
  }

  return toAlertResource(alert);
}

function attackAlertSelectSql(): string {
  return `
    SELECT
      a.id::text,
      a.guild_id::text AS "guildId",
      a.server_id::text AS "serverId",
      a.created_by_member_id::text AS "createdByMemberId",
      creator.nickname AS "createdByName",
      a.severity,
      a.title,
      a.message,
      a.target_label AS "targetLabel",
      a.target_x AS "targetX",
      a.target_y AS "targetY",
      COALESCE(a.metadata ->> 'attackType', a.title) AS "attackType",
      COALESCE(a.metadata ->> 'callKind', 'defense') AS "callKind",
      COALESCE(a.metadata ->> 'details', a.message) AS details,
      a.metadata,
      a.status,
      a.expires_at AS "expiresAt",
      a.resolved_at AS "resolvedAt",
      a.created_at AS "createdAt",
      COALESCE(acks.acknowledgements, '[]'::jsonb) AS acknowledgements,
      COALESCE(acks.summary, '{"seen":0,"joining":0,"cannotJoin":0,"resolved":0,"total":0}'::jsonb) AS "acknowledgementSummary",
      CASE
        WHEN my_ack.guild_member_id IS NULL THEN NULL
        ELSE jsonb_build_object(
          'memberId', my_member.id::text,
          'memberName', my_member.nickname,
          'response', my_ack.response,
          'responseLabel', CASE my_ack.response
            WHEN 'seen' THEN 'Vu'
            WHEN 'joining' THEN 'En route'
            WHEN 'cannot_join' THEN 'Impossible'
            WHEN 'resolved' THEN 'Résolu'
            ELSE my_ack.response
          END,
          'note', my_ack.note,
          'acknowledgedAt', my_ack.acknowledged_at
        )
      END AS "myAcknowledgement"
    FROM alerts a
    LEFT JOIN guild_members creator ON creator.id = a.created_by_member_id
    LEFT JOIN guild_members my_member
      ON my_member.guild_id = a.guild_id
     AND my_member.user_id = $2
    LEFT JOIN alert_acknowledgements my_ack
      ON my_ack.alert_id = a.id
     AND my_ack.guild_member_id = my_member.id
    LEFT JOIN LATERAL (
      SELECT
        jsonb_agg(
          jsonb_build_object(
            'memberId', gm.id::text,
            'memberName', gm.nickname,
            'response', aa.response,
            'responseLabel', CASE aa.response
              WHEN 'seen' THEN 'Vu'
              WHEN 'joining' THEN 'En route'
              WHEN 'cannot_join' THEN 'Impossible'
              WHEN 'resolved' THEN 'Résolu'
              ELSE aa.response
            END,
            'note', aa.note,
            'acknowledgedAt', aa.acknowledged_at
          )
          ORDER BY aa.acknowledged_at DESC
        ) AS acknowledgements,
        jsonb_build_object(
          'seen', count(*) FILTER (WHERE aa.response = 'seen'),
          'joining', count(*) FILTER (WHERE aa.response = 'joining'),
          'cannotJoin', count(*) FILTER (WHERE aa.response = 'cannot_join'),
          'resolved', count(*) FILTER (WHERE aa.response = 'resolved'),
          'total', count(*)
        ) AS summary
      FROM alert_acknowledgements aa
      JOIN guild_members gm ON gm.id = aa.guild_member_id
      WHERE aa.alert_id = a.id
    ) acks ON true
  `;
}

function toAlertResource(row: AlertRow): AlertResource {
  return {
    ...row,
    metadata: isRecord(row.metadata) ? row.metadata : {},
    acknowledgements: asAcknowledgements(row.acknowledgements),
    acknowledgementSummary: asAcknowledgementSummary(row.acknowledgementSummary),
    myAcknowledgement: asAcknowledgement(row.myAcknowledgement)
  };
}

async function assertAttackAlertExists(guildId: string, alertId: string): Promise<void> {
  const result = await query<{ id: string }>(
    "SELECT id::text FROM alerts WHERE id = $1 AND guild_id = $2 AND alert_type = 'attack' LIMIT 1",
    [alertId, guildId]
  );

  if (!result.rows[0]) {
    throw new NotFoundError("Attack alert not found");
  }
}

async function ensureGuildMemberForUser(
  db: Queryable,
  guildId: string,
  auth: AuthContext
): Promise<{ id: string; nickname: string }> {
  const existing = await db.query<{ id: string; nickname: string }>(
    "SELECT id::text, nickname FROM guild_members WHERE guild_id = $1 AND user_id = $2 LIMIT 1",
    [guildId, auth.user.id]
  );

  if (existing.rows[0]) {
    return existing.rows[0];
  }

  const created = await db.query<{ id: string; nickname: string }>(
    `
      INSERT INTO guild_members (guild_id, user_id, nickname, status, joined_at)
      VALUES ($1, $2, $3, 'active', now())
      RETURNING id::text, nickname
    `,
    [guildId, auth.user.id, auth.user.displayName]
  );

  const member = created.rows[0];

  if (!member) {
    throw new BadRequestError("Guild member could not be created");
  }

  return member;
}

async function upsertAcknowledgement(
  alertId: string,
  memberId: string,
  response: AlertAcknowledgementResponse,
  note: string | null | undefined
): Promise<AlertAcknowledgement> {
  const result = await query<{
    memberId: string;
    memberName: string;
    response: AlertAcknowledgementResponse;
    note: string | null;
    acknowledgedAt: string;
  }>(
    `
      INSERT INTO alert_acknowledgements (alert_id, guild_member_id, response, note, acknowledged_at)
      VALUES ($1, $2, $3, $4, now())
      ON CONFLICT (alert_id, guild_member_id)
      DO UPDATE SET
        response = EXCLUDED.response,
        note = EXCLUDED.note,
        acknowledged_at = now()
      RETURNING
        guild_member_id::text AS "memberId",
        (SELECT nickname FROM guild_members WHERE id = alert_acknowledgements.guild_member_id) AS "memberName",
        response,
        note,
        acknowledged_at AS "acknowledgedAt"
    `,
    [alertId, memberId, response, note ?? null]
  );

  const acknowledgement = result.rows[0];

  if (!acknowledgement) {
    throw new BadRequestError("Acknowledgement could not be saved");
  }

  return {
    ...acknowledgement,
    responseLabel: getAcknowledgementLabel(acknowledgement.response)
  };
}

async function enqueueReminderJobs(db: Queryable, guildId: string, alertId: string): Promise<void> {
  await db.query(
    `
      INSERT INTO alert_reminder_jobs (alert_id, guild_id, guild_member_id, scheduled_at)
      SELECT $1, $2, gm.id, now() + schedules.delay
      FROM guild_members gm
      CROSS JOIN (
        VALUES
          (interval '2 minutes'),
          (interval '5 minutes'),
          (interval '10 minutes')
      ) AS schedules(delay)
      WHERE gm.guild_id = $2
        AND gm.status = 'active'
        AND NOT EXISTS (
          SELECT 1
          FROM alert_acknowledgements aa
          WHERE aa.alert_id = $1
            AND aa.guild_member_id = gm.id
        )
      ON CONFLICT (alert_id, guild_member_id, scheduled_at) DO NOTHING
    `,
    [alertId, guildId]
  );
}

async function markReminderJobsAnswered(alertId: string, memberId: string): Promise<void> {
  await query(
    `
      UPDATE alert_reminder_jobs
      SET status = 'skipped',
          last_error = NULL
      WHERE alert_id = $1
        AND guild_member_id = $2
        AND status = 'queued'
    `,
    [alertId, memberId]
  );
}

function normalizeAcknowledgementResponse(value: string): AlertAcknowledgementResponse | null {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (["seen", "vu"].includes(normalized)) return "seen";
  if (["joining", "en_route", "route", "jarrive"].includes(normalized)) return "joining";
  if (["cannot_join", "impossible", "absent"].includes(normalized)) return "cannot_join";
  if (["resolved", "resolu"].includes(normalized)) return "resolved";
  return null;
}

function getAcknowledgementLabel(response: AlertAcknowledgementResponse): string {
  return (
    {
      seen: "Vu",
      joining: "En route",
      cannot_join: "Impossible",
      resolved: "Résolu"
    }[response] || response
  );
}

function asAcknowledgements(value: unknown): AlertAcknowledgement[] {
  return Array.isArray(value) ? value.map(asAcknowledgement).filter(isAcknowledgement) : [];
}

function asAcknowledgement(value: unknown): AlertAcknowledgement | null {
  if (!isRecord(value)) return null;
  const response = normalizeAcknowledgementResponse(String(value.response ?? ""));

  if (!response) return null;

  return {
    memberId: String(value.memberId ?? ""),
    memberName: String(value.memberName ?? ""),
    response,
    responseLabel: String(value.responseLabel ?? getAcknowledgementLabel(response)),
    note: value.note === null || value.note === undefined ? null : String(value.note),
    acknowledgedAt: String(value.acknowledgedAt ?? "")
  };
}

function isAcknowledgement(value: AlertAcknowledgement | null): value is AlertAcknowledgement {
  return value !== null;
}

function asAcknowledgementSummary(value: unknown): AlertAcknowledgementSummary {
  const record = isRecord(value) ? value : {};

  return {
    seen: Number(record.seen ?? 0),
    joining: Number(record.joining ?? 0),
    cannotJoin: Number(record.cannotJoin ?? 0),
    resolved: Number(record.resolved ?? 0),
    total: Number(record.total ?? 0)
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

import { Router } from "express";
import { z } from "zod";
import { database, query, type Queryable } from "../db/pool.js";
import { asyncHandler } from "../http/async-handler.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../http/errors.js";
import { validate } from "../http/validate.js";
import { getAuth, requireAuth, type AuthContext } from "../security/auth.js";
import { assertGuildAccess } from "./access.js";
import { dateTimeSchema, uuidSchema } from "./helpers.js";

export const eventsRouter = Router();

type AttendanceStatus = "pending" | "confirmed" | "maybe" | "absent";
type AssignmentStatus = "assigned" | "accepted" | "completed" | "missed" | "cancelled";
type ObjectiveStatus = "open" | "in_progress" | "done" | "cancelled";

type EventRow = {
  id: string;
  guildId: string;
  serverId: string | null;
  title: string;
  eventType: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  locationLabel: string | null;
  locationX: number | null;
  locationY: number | null;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
  cancelledAt?: string | null;
};

type EventRowWithStats = EventRow & {
  confirmedCount?: number | string;
  maybeCount?: number | string;
  absentCount?: number | string;
  pendingCount?: number | string;
  respondedCount?: number | string;
};

const attendanceLabels = Object.freeze({
  pending: "Non repondu",
  confirmed: "Confirme",
  maybe: "Peut-etre",
  absent: "Absent"
} satisfies Record<AttendanceStatus, string>);

const guildParamsSchema = z.object({
  guildId: uuidSchema
});

const eventParamsSchema = z.object({
  guildId: uuidSchema,
  eventId: uuidSchema
});

const attendanceMemberParamsSchema = z.object({
  guildId: uuidSchema,
  eventId: uuidSchema,
  memberId: uuidSchema
});

const assignmentParamsSchema = z.object({
  guildId: uuidSchema,
  eventId: uuidSchema,
  assignmentId: uuidSchema
});

const objectiveParamsSchema = z.object({
  guildId: uuidSchema,
  objectiveId: uuidSchema
});

const eventSummaryQuerySchema = z.object({
  eventId: uuidSchema.optional()
});

const eventsQuerySchema = z.object({
  from: dateTimeSchema.optional(),
  to: dateTimeSchema.optional(),
  serverId: uuidSchema.optional(),
  includeCancelled: z.coerce.boolean().optional().default(false),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

const objectiveQuerySchema = z.object({
  eventId: uuidSchema.optional(),
  memberId: uuidSchema.optional(),
  status: z.enum(["open", "in_progress", "done", "cancelled", "all"]).optional().default("all"),
  dueFrom: dateTimeSchema.optional(),
  dueTo: dateTimeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

const createEventBodySchema = z
  .object({
    title: z.string().trim().min(2).max(160),
    eventType: z.string().trim().min(2).max(80),
    description: z.string().trim().max(2000).optional(),
    startsAt: dateTimeSchema,
    endsAt: dateTimeSchema.optional(),
    serverId: uuidSchema.optional(),
    locationLabel: z.string().trim().min(1).max(120).optional(),
    locationX: z.number().int().optional(),
    locationY: z.number().int().optional()
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.endsAt && Date.parse(value.endsAt) <= Date.parse(value.startsAt)) {
      ctx.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "endsAt must be after startsAt"
      });
    }
  });

const updateEventBodySchema = z
  .object({
    title: z.string().trim().min(2).max(160).optional(),
    eventType: z.string().trim().min(2).max(80).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    startsAt: dateTimeSchema.optional(),
    endsAt: dateTimeSchema.nullable().optional(),
    serverId: uuidSchema.nullable().optional(),
    locationLabel: z.string().trim().min(1).max(120).nullable().optional(),
    locationX: z.number().int().nullable().optional(),
    locationY: z.number().int().nullable().optional()
  })
  .strict();

const attendanceStatusSchema = z.string().trim().transform((value, ctx) => {
  const status = normalizeAttendanceStatus(value);

  if (!status) {
    ctx.addIssue({
      code: "custom",
      message: "status must be one of confirmed, maybe, absent, pending, Confirme, Peut-etre, Absent"
    });
    return z.NEVER;
  }

  return status;
});

const attendanceBodySchema = z
  .object({
    status: attendanceStatusSchema,
    note: z.string().trim().max(500).nullable().optional()
  })
  .strict();

const createAssignmentBodySchema = z
  .object({
    guildMemberId: uuidSchema,
    assignmentType: z.string().trim().min(2).max(80),
    objective: z.string().trim().max(500).nullable().optional(),
    target: z.record(z.string(), z.unknown()).optional().default({}),
    status: z.enum(["assigned", "accepted", "completed", "missed", "cancelled"]).optional().default("assigned")
  })
  .strict();

const updateAssignmentBodySchema = z
  .object({
    guildMemberId: uuidSchema.optional(),
    assignmentType: z.string().trim().min(2).max(80).optional(),
    objective: z.string().trim().max(500).nullable().optional(),
    target: z.record(z.string(), z.unknown()).optional(),
    status: z.enum(["assigned", "accepted", "completed", "missed", "cancelled"]).optional()
  })
  .strict();

const createObjectiveBodySchema = z
  .object({
    eventId: uuidSchema.nullable().optional(),
    guildMemberId: uuidSchema.nullable().optional(),
    title: z.string().trim().min(2).max(180),
    description: z.string().trim().max(2000).nullable().optional(),
    dueAt: dateTimeSchema.nullable().optional(),
    status: z.enum(["open", "in_progress", "done", "cancelled"]).optional().default("open"),
    completedAt: dateTimeSchema.nullable().optional()
  })
  .strict();

const updateObjectiveBodySchema = z
  .object({
    eventId: uuidSchema.nullable().optional(),
    guildMemberId: uuidSchema.nullable().optional(),
    title: z.string().trim().min(2).max(180).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    dueAt: dateTimeSchema.nullable().optional(),
    status: z.enum(["open", "in_progress", "done", "cancelled"]).optional(),
    completedAt: dateTimeSchema.nullable().optional()
  })
  .strict();

type GuildParams = z.infer<typeof guildParamsSchema>;
type EventParams = z.infer<typeof eventParamsSchema>;
type AttendanceMemberParams = z.infer<typeof attendanceMemberParamsSchema>;
type AssignmentParams = z.infer<typeof assignmentParamsSchema>;
type ObjectiveParams = z.infer<typeof objectiveParamsSchema>;
type EventSummaryQuery = z.infer<typeof eventSummaryQuerySchema>;
type EventsQuery = z.infer<typeof eventsQuerySchema>;
type ObjectiveQuery = z.infer<typeof objectiveQuerySchema>;

eventsRouter.get(
  "/guilds/:guildId/events/summary/quick",
  requireAuth,
  validate({ params: guildParamsSchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId } = req.params as GuildParams;
    await assertGuildAccess(database, guildId, auth.user.id);

    const nextEvent = await getNextEventSummary(guildId);
    const [attendanceRate, expectedMembers, weeklyObjectives] = await Promise.all([
      getAttendanceRateSummary(guildId, nextEvent?.id),
      nextEvent ? getExpectedMembersSummary(guildId, nextEvent.id) : Promise.resolve([]),
      getWeeklyObjectivesSummary(guildId)
    ]);

    res.json({
      summary: {
        nextEvent,
        attendanceRate,
        expectedMembers,
        weeklyObjectives
      }
    });
  })
);

eventsRouter.get(
  "/guilds/:guildId/events/summary/next",
  requireAuth,
  validate({ params: guildParamsSchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId } = req.params as GuildParams;
    await assertGuildAccess(database, guildId, auth.user.id);

    res.json({ nextEvent: await getNextEventSummary(guildId) });
  })
);

eventsRouter.get(
  "/guilds/:guildId/events/summary/attendance-rate",
  requireAuth,
  validate({ params: guildParamsSchema, query: eventSummaryQuerySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId } = req.params as GuildParams;
    const { eventId } = req.query as unknown as EventSummaryQuery;
    await assertGuildAccess(database, guildId, auth.user.id);

    if (eventId) {
      await assertEventExists(guildId, eventId);
    }

    res.json({ attendanceRate: await getAttendanceRateSummary(guildId, eventId) });
  })
);

eventsRouter.get(
  "/guilds/:guildId/events/summary/expected-members",
  requireAuth,
  validate({ params: guildParamsSchema, query: eventSummaryQuerySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId } = req.params as GuildParams;
    const { eventId } = req.query as unknown as EventSummaryQuery;
    await assertGuildAccess(database, guildId, auth.user.id);

    const targetEventId = eventId ?? (await getNextEventSummary(guildId))?.id;

    if (!targetEventId) {
      res.json({ expectedMembers: [] });
      return;
    }

    await assertEventExists(guildId, targetEventId);
    res.json({ expectedMembers: await getExpectedMembersSummary(guildId, targetEventId) });
  })
);

eventsRouter.get(
  "/guilds/:guildId/objectives/summary/weekly",
  requireAuth,
  validate({ params: guildParamsSchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId } = req.params as GuildParams;
    await assertGuildAccess(database, guildId, auth.user.id);

    res.json({ weeklyObjectives: await getWeeklyObjectivesSummary(guildId) });
  })
);

eventsRouter.get(
  "/guilds/:guildId/events",
  requireAuth,
  validate({ params: guildParamsSchema, query: eventsQuerySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId } = req.params as GuildParams;
    const filters = req.query as unknown as EventsQuery;
    await assertGuildAccess(database, guildId, auth.user.id);

    const where = ["e.guild_id = $1"];
    const values: unknown[] = [guildId];

    if (!filters.includeCancelled) {
      where.push("e.cancelled_at IS NULL");
    }

    if (filters.from) {
      values.push(filters.from);
      where.push(`e.starts_at >= $${values.length}`);
    }

    if (filters.to) {
      values.push(filters.to);
      where.push(`e.starts_at <= $${values.length}`);
    }

    if (filters.serverId) {
      values.push(filters.serverId);
      where.push(`e.server_id = $${values.length}`);
    }

    values.push(filters.limit);

    const result = await query<EventRowWithStats>(
      `
        SELECT
          e.id::text,
          e.guild_id::text AS "guildId",
          e.server_id::text AS "serverId",
          e.title,
          e.event_type AS "eventType",
          e.description,
          e.starts_at AS "startsAt",
          e.ends_at AS "endsAt",
          e.location_label AS "locationLabel",
          e.location_x AS "locationX",
          e.location_y AS "locationY",
          e.created_by::text AS "createdBy",
          e.created_at AS "createdAt",
          e.updated_at AS "updatedAt",
          e.cancelled_at AS "cancelledAt",
          COALESCE(stats.confirmed_count, 0) AS "confirmedCount",
          COALESCE(stats.maybe_count, 0) AS "maybeCount",
          COALESCE(stats.absent_count, 0) AS "absentCount",
          COALESCE(stats.responded_count, 0) AS "respondedCount"
        FROM events e
        LEFT JOIN LATERAL (
          SELECT
            count(*) FILTER (WHERE ea.status = 'confirmed')::int AS confirmed_count,
            count(*) FILTER (WHERE ea.status = 'maybe')::int AS maybe_count,
            count(*) FILTER (WHERE ea.status = 'absent')::int AS absent_count,
            count(*) FILTER (WHERE ea.status <> 'pending')::int AS responded_count
          FROM event_attendance ea
          WHERE ea.event_id = e.id
        ) stats ON true
        WHERE ${where.join(" AND ")}
        ORDER BY e.starts_at ASC
        LIMIT $${values.length}
      `,
      values
    );

    res.json({ events: result.rows.map(toEventResource) });
  })
);

eventsRouter.post(
  "/guilds/:guildId/events",
  requireAuth,
  validate({ params: guildParamsSchema, body: createEventBodySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId } = req.params as GuildParams;
    const body = req.body as z.infer<typeof createEventBodySchema>;
    const access = await assertGuildAccess(database, guildId, auth.user.id);
    await assertCanManageEvents(guildId, auth.user.id, access.organization_role, auth.user.globalRole);

    const result = await query<EventRow>(
      `
        INSERT INTO events (
          guild_id,
          server_id,
          title,
          event_type,
          description,
          starts_at,
          ends_at,
          location_label,
          location_x,
          location_y,
          created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING
          id::text,
          guild_id::text AS "guildId",
          server_id::text AS "serverId",
          title,
          event_type AS "eventType",
          description,
          starts_at AS "startsAt",
          ends_at AS "endsAt",
          location_label AS "locationLabel",
          location_x AS "locationX",
          location_y AS "locationY",
          created_by::text AS "createdBy",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          cancelled_at AS "cancelledAt"
      `,
      [
        guildId,
        body.serverId ?? null,
        body.title,
        body.eventType,
        body.description ?? null,
        body.startsAt,
        body.endsAt ?? null,
        body.locationLabel ?? null,
        body.locationX ?? null,
        body.locationY ?? null,
        auth.user.id
      ]
    );

    res.status(201).json({ event: toEventResource(result.rows[0]) });
  })
);

eventsRouter.get(
  "/guilds/:guildId/events/:eventId",
  requireAuth,
  validate({ params: eventParamsSchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId, eventId } = req.params as EventParams;
    await assertGuildAccess(database, guildId, auth.user.id);

    res.json({ event: await getEventDetail(guildId, eventId) });
  })
);

eventsRouter.patch(
  "/guilds/:guildId/events/:eventId",
  requireAuth,
  validate({ params: eventParamsSchema, body: updateEventBodySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId, eventId } = req.params as EventParams;
    const body = req.body as z.infer<typeof updateEventBodySchema>;
    const access = await assertGuildAccess(database, guildId, auth.user.id);
    await assertCanManageEvents(guildId, auth.user.id, access.organization_role, auth.user.globalRole);

    const current = await assertEventExists(guildId, eventId);
    const nextStartsAt = body.startsAt ?? current.startsAt;
    const nextEndsAt = hasOwn(body, "endsAt") ? body.endsAt : current.endsAt;

    if (nextEndsAt && Date.parse(nextEndsAt) <= Date.parse(nextStartsAt)) {
      throw new BadRequestError("endsAt must be after startsAt");
    }

    const values: unknown[] = [eventId, guildId];
    const sets: string[] = [];
    addPatchValue(body, "serverId", "server_id", values, sets);
    addPatchValue(body, "title", "title", values, sets);
    addPatchValue(body, "eventType", "event_type", values, sets);
    addPatchValue(body, "description", "description", values, sets);
    addPatchValue(body, "startsAt", "starts_at", values, sets);
    addPatchValue(body, "endsAt", "ends_at", values, sets);
    addPatchValue(body, "locationLabel", "location_label", values, sets);
    addPatchValue(body, "locationX", "location_x", values, sets);
    addPatchValue(body, "locationY", "location_y", values, sets);

    if (!sets.length) {
      throw new BadRequestError("No event fields to update");
    }

    const result = await query<EventRow>(
      `
        UPDATE events
        SET ${sets.join(", ")}
        WHERE id = $1
          AND guild_id = $2
          AND cancelled_at IS NULL
        RETURNING
          id::text,
          guild_id::text AS "guildId",
          server_id::text AS "serverId",
          title,
          event_type AS "eventType",
          description,
          starts_at AS "startsAt",
          ends_at AS "endsAt",
          location_label AS "locationLabel",
          location_x AS "locationX",
          location_y AS "locationY",
          created_by::text AS "createdBy",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          cancelled_at AS "cancelledAt"
      `,
      values
    );

    const event = result.rows[0];

    if (!event) {
      throw new NotFoundError("Event not found");
    }

    res.json({ event: toEventResource(event) });
  })
);

eventsRouter.delete(
  "/guilds/:guildId/events/:eventId",
  requireAuth,
  validate({ params: eventParamsSchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId, eventId } = req.params as EventParams;
    const access = await assertGuildAccess(database, guildId, auth.user.id);
    await assertCanManageEvents(guildId, auth.user.id, access.organization_role, auth.user.globalRole);

    const result = await query<{ id: string; cancelledAt: string }>(
      `
        UPDATE events
        SET cancelled_at = now()
        WHERE id = $1
          AND guild_id = $2
          AND cancelled_at IS NULL
        RETURNING id::text, cancelled_at AS "cancelledAt"
      `,
      [eventId, guildId]
    );

    const event = result.rows[0];

    if (!event) {
      throw new NotFoundError("Event not found");
    }

    res.json({ event });
  })
);

eventsRouter.get(
  "/guilds/:guildId/events/:eventId/attendance",
  requireAuth,
  validate({ params: eventParamsSchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId, eventId } = req.params as EventParams;
    await assertGuildAccess(database, guildId, auth.user.id);
    await assertEventExists(guildId, eventId);

    res.json({ attendance: await getAttendanceRows(guildId, eventId) });
  })
);

eventsRouter.put(
  "/guilds/:guildId/events/:eventId/attendance/me",
  requireAuth,
  validate({ params: eventParamsSchema, body: attendanceBodySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId, eventId } = req.params as EventParams;
    const body = req.body as z.infer<typeof attendanceBodySchema>;
    await assertGuildAccess(database, guildId, auth.user.id);
    await assertEventExists(guildId, eventId);

    const member = await ensureGuildMemberForUser(database, guildId, auth);
    const attendance = await upsertAttendance(eventId, member.id, body.status, body.note);

    res.json({ attendance });
  })
);

eventsRouter.put(
  "/guilds/:guildId/events/:eventId/attendance/:memberId",
  requireAuth,
  validate({ params: attendanceMemberParamsSchema, body: attendanceBodySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId, eventId, memberId } = req.params as AttendanceMemberParams;
    const body = req.body as z.infer<typeof attendanceBodySchema>;
    const access = await assertGuildAccess(database, guildId, auth.user.id);
    await assertCanManageEvents(guildId, auth.user.id, access.organization_role, auth.user.globalRole);
    await assertEventExists(guildId, eventId);
    await assertGuildMemberExists(guildId, memberId);

    const attendance = await upsertAttendance(eventId, memberId, body.status, body.note);
    res.json({ attendance });
  })
);

eventsRouter.delete(
  "/guilds/:guildId/events/:eventId/attendance/:memberId",
  requireAuth,
  validate({ params: attendanceMemberParamsSchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId, eventId, memberId } = req.params as AttendanceMemberParams;
    const access = await assertGuildAccess(database, guildId, auth.user.id);
    await assertCanManageEvents(guildId, auth.user.id, access.organization_role, auth.user.globalRole);
    await assertEventExists(guildId, eventId);
    await assertGuildMemberExists(guildId, memberId);

    await query("DELETE FROM event_attendance WHERE event_id = $1 AND guild_member_id = $2", [eventId, memberId]);
    res.status(204).send();
  })
);

eventsRouter.get(
  "/guilds/:guildId/events/:eventId/assignments",
  requireAuth,
  validate({ params: eventParamsSchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId, eventId } = req.params as EventParams;
    await assertGuildAccess(database, guildId, auth.user.id);
    await assertEventExists(guildId, eventId);

    res.json({ assignments: await getAssignmentRows(guildId, eventId) });
  })
);

eventsRouter.post(
  "/guilds/:guildId/events/:eventId/assignments",
  requireAuth,
  validate({ params: eventParamsSchema, body: createAssignmentBodySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId, eventId } = req.params as EventParams;
    const body = req.body as z.infer<typeof createAssignmentBodySchema>;
    const access = await assertGuildAccess(database, guildId, auth.user.id);
    await assertCanManageEvents(guildId, auth.user.id, access.organization_role, auth.user.globalRole);
    await assertEventExists(guildId, eventId);
    await assertGuildMemberExists(guildId, body.guildMemberId);

    const result = await query(
      `
        INSERT INTO event_assignments (
          event_id,
          guild_member_id,
          assigned_by,
          assignment_type,
          objective,
          target_json,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id::text
      `,
      [
        eventId,
        body.guildMemberId,
        auth.user.id,
        body.assignmentType,
        body.objective ?? null,
        body.target,
        body.status
      ]
    );

    const assignment = await getAssignmentById(guildId, eventId, String(result.rows[0]?.id));
    res.status(201).json({ assignment });
  })
);

eventsRouter.patch(
  "/guilds/:guildId/events/:eventId/assignments/:assignmentId",
  requireAuth,
  validate({ params: assignmentParamsSchema, body: updateAssignmentBodySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId, eventId, assignmentId } = req.params as AssignmentParams;
    const body = req.body as z.infer<typeof updateAssignmentBodySchema>;
    const access = await assertGuildAccess(database, guildId, auth.user.id);
    await assertCanManageEvents(guildId, auth.user.id, access.organization_role, auth.user.globalRole);
    await assertEventExists(guildId, eventId);

    if (body.guildMemberId) {
      await assertGuildMemberExists(guildId, body.guildMemberId);
    }

    const values: unknown[] = [assignmentId, eventId];
    const sets: string[] = [];
    addPatchValue(body, "guildMemberId", "guild_member_id", values, sets);
    addPatchValue(body, "assignmentType", "assignment_type", values, sets);
    addPatchValue(body, "objective", "objective", values, sets);
    addPatchValue(body, "target", "target_json", values, sets);
    addPatchValue(body, "status", "status", values, sets);

    if (!sets.length) {
      throw new BadRequestError("No assignment fields to update");
    }

    const result = await query<{ id: string }>(
      `
        UPDATE event_assignments
        SET ${sets.join(", ")}
        WHERE id = $1
          AND event_id = $2
        RETURNING id::text
      `,
      values
    );

    if (!result.rows[0]) {
      throw new NotFoundError("Assignment not found");
    }

    res.json({ assignment: await getAssignmentById(guildId, eventId, assignmentId) });
  })
);

eventsRouter.delete(
  "/guilds/:guildId/events/:eventId/assignments/:assignmentId",
  requireAuth,
  validate({ params: assignmentParamsSchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId, eventId, assignmentId } = req.params as AssignmentParams;
    const access = await assertGuildAccess(database, guildId, auth.user.id);
    await assertCanManageEvents(guildId, auth.user.id, access.organization_role, auth.user.globalRole);
    await assertEventExists(guildId, eventId);

    const result = await query<{ id: string }>(
      `
        UPDATE event_assignments
        SET status = 'cancelled'
        WHERE id = $1
          AND event_id = $2
        RETURNING id::text
      `,
      [assignmentId, eventId]
    );

    if (!result.rows[0]) {
      throw new NotFoundError("Assignment not found");
    }

    res.json({ assignment: await getAssignmentById(guildId, eventId, assignmentId) });
  })
);

eventsRouter.get(
  "/guilds/:guildId/objectives",
  requireAuth,
  validate({ params: guildParamsSchema, query: objectiveQuerySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId } = req.params as GuildParams;
    const filters = req.query as unknown as ObjectiveQuery;
    await assertGuildAccess(database, guildId, auth.user.id);

    const where = ["o.guild_id = $1"];
    const values: unknown[] = [guildId];

    if (filters.eventId) {
      values.push(filters.eventId);
      where.push(`o.event_id = $${values.length}`);
    }

    if (filters.memberId) {
      values.push(filters.memberId);
      where.push(`o.guild_member_id = $${values.length}`);
    }

    if (filters.status !== "all") {
      values.push(filters.status);
      where.push(`o.status = $${values.length}`);
    }

    if (filters.dueFrom) {
      values.push(filters.dueFrom);
      where.push(`o.due_at >= $${values.length}`);
    }

    if (filters.dueTo) {
      values.push(filters.dueTo);
      where.push(`o.due_at <= $${values.length}`);
    }

    values.push(filters.limit);

    const objectives = await getObjectiveRows(where, values);
    res.json({ objectives });
  })
);

eventsRouter.post(
  "/guilds/:guildId/objectives",
  requireAuth,
  validate({ params: guildParamsSchema, body: createObjectiveBodySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId } = req.params as GuildParams;
    const body = req.body as z.infer<typeof createObjectiveBodySchema>;
    const access = await assertGuildAccess(database, guildId, auth.user.id);
    await assertCanManageEvents(guildId, auth.user.id, access.organization_role, auth.user.globalRole);
    await assertObjectiveRelations(guildId, body.eventId, body.guildMemberId);

    const status = body.status;
    const completedAt = getObjectiveCompletedAt(status, body.completedAt);
    const result = await query<{ id: string }>(
      `
        INSERT INTO objectives (
          guild_id,
          event_id,
          guild_member_id,
          assigned_by,
          title,
          description,
          due_at,
          status,
          completed_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id::text
      `,
      [
        guildId,
        body.eventId ?? null,
        body.guildMemberId ?? null,
        auth.user.id,
        body.title,
        body.description ?? null,
        body.dueAt ?? null,
        status,
        completedAt
      ]
    );

    res.status(201).json({ objective: await getObjectiveById(guildId, String(result.rows[0]?.id)) });
  })
);

eventsRouter.get(
  "/guilds/:guildId/objectives/:objectiveId",
  requireAuth,
  validate({ params: objectiveParamsSchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId, objectiveId } = req.params as ObjectiveParams;
    await assertGuildAccess(database, guildId, auth.user.id);

    res.json({ objective: await getObjectiveById(guildId, objectiveId) });
  })
);

eventsRouter.patch(
  "/guilds/:guildId/objectives/:objectiveId",
  requireAuth,
  validate({ params: objectiveParamsSchema, body: updateObjectiveBodySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId, objectiveId } = req.params as ObjectiveParams;
    const body = req.body as z.infer<typeof updateObjectiveBodySchema>;
    const access = await assertGuildAccess(database, guildId, auth.user.id);
    await assertCanManageEvents(guildId, auth.user.id, access.organization_role, auth.user.globalRole);
    await assertObjectiveRelations(guildId, body.eventId, body.guildMemberId);

    const values: unknown[] = [objectiveId, guildId];
    const sets: string[] = [];
    addPatchValue(body, "eventId", "event_id", values, sets);
    addPatchValue(body, "guildMemberId", "guild_member_id", values, sets);
    addPatchValue(body, "title", "title", values, sets);
    addPatchValue(body, "description", "description", values, sets);
    addPatchValue(body, "dueAt", "due_at", values, sets);
    addPatchValue(body, "status", "status", values, sets);

    if (hasOwn(body, "completedAt")) {
      addRawPatchValue("completed_at", body.completedAt, values, sets);
    } else if (body.status === "done") {
      sets.push("completed_at = COALESCE(completed_at, now())");
    } else if (body.status) {
      sets.push("completed_at = NULL");
    }

    if (!sets.length) {
      throw new BadRequestError("No objective fields to update");
    }

    const result = await query<{ id: string }>(
      `
        UPDATE objectives
        SET ${sets.join(", ")}
        WHERE id = $1
          AND guild_id = $2
        RETURNING id::text
      `,
      values
    );

    if (!result.rows[0]) {
      throw new NotFoundError("Objective not found");
    }

    res.json({ objective: await getObjectiveById(guildId, objectiveId) });
  })
);

eventsRouter.delete(
  "/guilds/:guildId/objectives/:objectiveId",
  requireAuth,
  validate({ params: objectiveParamsSchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId, objectiveId } = req.params as ObjectiveParams;
    const access = await assertGuildAccess(database, guildId, auth.user.id);
    await assertCanManageEvents(guildId, auth.user.id, access.organization_role, auth.user.globalRole);

    const result = await query<{ id: string }>(
      `
        UPDATE objectives
        SET status = 'cancelled',
            completed_at = NULL
        WHERE id = $1
          AND guild_id = $2
        RETURNING id::text
      `,
      [objectiveId, guildId]
    );

    if (!result.rows[0]) {
      throw new NotFoundError("Objective not found");
    }

    res.json({ objective: await getObjectiveById(guildId, objectiveId) });
  })
);

async function assertCanManageEvents(
  guildId: string,
  userId: string,
  organizationRole: string,
  globalRole: string
): Promise<void> {
  const allowed = await canManageEvents(database, guildId, userId, organizationRole, globalRole);

  if (!allowed) {
    throw new ForbiddenError("Permission manage_events is required");
  }
}

export async function canManageEvents(
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
        AND p.key IN ('manage_events', 'admin_all')
      LIMIT 1
    `,
    [guildId, userId]
  );

  return Boolean(result.rows[0]?.allowed);
}

function normalizeAttendanceStatus(value: string): AttendanceStatus | null {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");

  if (["confirmed", "confirm", "confirme"].includes(normalized)) return "confirmed";
  if (["maybe", "peut-etre", "peutetre"].includes(normalized)) return "maybe";
  if (normalized === "absent") return "absent";
  if (["pending", "non-repondu", "nonrepondu"].includes(normalized)) return "pending";
  return null;
}

function toAttendanceResource<T extends { status: AttendanceStatus }>(row: T): T & { statusLabel: string } {
  return {
    ...row,
    statusLabel: attendanceLabels[row.status]
  };
}

function toEventResource(row: EventRowWithStats | undefined): EventRow & {
  attendanceSummary: {
    confirmed: number;
    maybe: number;
    absent: number;
    pending: number;
    responded: number;
  };
} {
  if (!row) {
    throw new NotFoundError("Event not found");
  }

  const {
    confirmedCount = 0,
    maybeCount = 0,
    absentCount = 0,
    pendingCount = 0,
    respondedCount = 0,
    ...event
  } = row;

  return {
    ...event,
    attendanceSummary: {
      confirmed: Number(confirmedCount),
      maybe: Number(maybeCount),
      absent: Number(absentCount),
      pending: Number(pendingCount),
      responded: Number(respondedCount)
    }
  };
}

async function assertEventExists(guildId: string, eventId: string): Promise<EventRow> {
  const result = await query<EventRow>(
    `
      SELECT
        id::text,
        guild_id::text AS "guildId",
        server_id::text AS "serverId",
        title,
        event_type AS "eventType",
        description,
        starts_at AS "startsAt",
        ends_at AS "endsAt",
        location_label AS "locationLabel",
        location_x AS "locationX",
        location_y AS "locationY",
        created_by::text AS "createdBy",
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        cancelled_at AS "cancelledAt"
      FROM events
      WHERE id = $1
        AND guild_id = $2
        AND cancelled_at IS NULL
      LIMIT 1
    `,
    [eventId, guildId]
  );

  const event = result.rows[0];

  if (!event) {
    throw new NotFoundError("Event not found");
  }

  return event;
}

async function assertGuildMemberExists(guildId: string, memberId: string): Promise<{ id: string }> {
  const result = await query<{ id: string }>(
    "SELECT id::text FROM guild_members WHERE id = $1 AND guild_id = $2 LIMIT 1",
    [memberId, guildId]
  );
  const member = result.rows[0];

  if (!member) {
    throw new NotFoundError("Guild member not found");
  }

  return member;
}

async function ensureGuildMemberForUser(
  db: Queryable,
  guildId: string,
  auth: AuthContext
): Promise<{ id: string }> {
  const existing = await db.query<{ id: string }>(
    "SELECT id::text FROM guild_members WHERE guild_id = $1 AND user_id = $2 LIMIT 1",
    [guildId, auth.user.id]
  );

  if (existing.rows[0]) {
    return existing.rows[0];
  }

  const created = await db.query<{ id: string }>(
    `
      INSERT INTO guild_members (guild_id, user_id, nickname, status, joined_at)
      VALUES ($1, $2, $3, 'active', now())
      RETURNING id::text
    `,
    [guildId, auth.user.id, auth.user.displayName]
  );

  const member = created.rows[0];

  if (!member) {
    throw new BadRequestError("Guild member could not be created");
  }

  return member;
}

async function getEventDetail(guildId: string, eventId: string) {
  const event = await assertEventExists(guildId, eventId);
  const [attendance, assignments, objectives, attendanceRate] = await Promise.all([
    getAttendanceRows(guildId, eventId),
    getAssignmentRows(guildId, eventId),
    getObjectiveRows(["o.guild_id = $1", "o.event_id = $2"], [guildId, eventId, 100]),
    getAttendanceRateSummary(guildId, eventId)
  ]);

  return {
    ...toEventResource(event),
    attendanceRate,
    attendance,
    assignments,
    objectives
  };
}

async function getAttendanceRows(guildId: string, eventId: string) {
  const result = await query<{
    memberId: string;
    userId: string | null;
    nickname: string;
    powerScore: string | null;
    memberStatus: string;
    status: AttendanceStatus;
    note: string | null;
    respondedAt: string | null;
    updatedAt: string | null;
  }>(
    `
      SELECT
        gm.id::text AS "memberId",
        gm.user_id::text AS "userId",
        gm.nickname,
        gm.power_score::text AS "powerScore",
        gm.status AS "memberStatus",
        COALESCE(ea.status, 'pending') AS status,
        ea.note,
        ea.responded_at AS "respondedAt",
        ea.updated_at AS "updatedAt"
      FROM guild_members gm
      LEFT JOIN event_attendance ea
        ON ea.guild_member_id = gm.id
       AND ea.event_id = $2
      WHERE gm.guild_id = $1
        AND gm.status = 'active'
      ORDER BY
        CASE COALESCE(ea.status, 'pending')
          WHEN 'confirmed' THEN 1
          WHEN 'maybe' THEN 2
          WHEN 'absent' THEN 3
          ELSE 4
        END,
        gm.power_score DESC NULLS LAST,
        gm.nickname ASC
    `,
    [guildId, eventId]
  );

  return result.rows.map(toAttendanceResource);
}

async function upsertAttendance(
  eventId: string,
  memberId: string,
  status: AttendanceStatus,
  note: string | null | undefined
) {
  const result = await query<{
    eventId: string;
    memberId: string;
    status: AttendanceStatus;
    note: string | null;
    respondedAt: string | null;
    updatedAt: string;
  }>(
    `
      INSERT INTO event_attendance (event_id, guild_member_id, status, note, responded_at)
      VALUES ($1, $2, $3, $4, CASE WHEN $3 = 'pending' THEN NULL ELSE now() END)
      ON CONFLICT (event_id, guild_member_id)
      DO UPDATE SET
        status = EXCLUDED.status,
        note = EXCLUDED.note,
        responded_at = CASE WHEN EXCLUDED.status = 'pending' THEN NULL ELSE now() END
      RETURNING
        event_id::text AS "eventId",
        guild_member_id::text AS "memberId",
        status,
        note,
        responded_at AS "respondedAt",
        updated_at AS "updatedAt"
    `,
    [eventId, memberId, status, note ?? null]
  );

  const attendance = result.rows[0];

  if (!attendance) {
    throw new BadRequestError("Attendance could not be saved");
  }

  return toAttendanceResource(attendance);
}

async function getAssignmentRows(guildId: string, eventId: string) {
  const result = await query<{
    id: string;
    eventId: string;
    guildMemberId: string;
    memberName: string;
    assignedBy: string | null;
    assignmentType: string;
    objective: string | null;
    target: Record<string, unknown>;
    status: AssignmentStatus;
    createdAt: string;
    updatedAt: string;
  }>(
    `
      SELECT
        ea.id::text,
        ea.event_id::text AS "eventId",
        ea.guild_member_id::text AS "guildMemberId",
        gm.nickname AS "memberName",
        ea.assigned_by::text AS "assignedBy",
        ea.assignment_type AS "assignmentType",
        ea.objective,
        ea.target_json AS target,
        ea.status,
        ea.created_at AS "createdAt",
        ea.updated_at AS "updatedAt"
      FROM event_assignments ea
      JOIN events e ON e.id = ea.event_id
      JOIN guild_members gm ON gm.id = ea.guild_member_id
      WHERE e.guild_id = $1
        AND ea.event_id = $2
      ORDER BY ea.created_at DESC
    `,
    [guildId, eventId]
  );

  return result.rows;
}

async function getAssignmentById(guildId: string, eventId: string, assignmentId: string) {
  const result = await query<{
    id: string;
    eventId: string;
    guildMemberId: string;
    memberName: string;
    assignedBy: string | null;
    assignmentType: string;
    objective: string | null;
    target: Record<string, unknown>;
    status: AssignmentStatus;
    createdAt: string;
    updatedAt: string;
  }>(
    `
      SELECT
        ea.id::text,
        ea.event_id::text AS "eventId",
        ea.guild_member_id::text AS "guildMemberId",
        gm.nickname AS "memberName",
        ea.assigned_by::text AS "assignedBy",
        ea.assignment_type AS "assignmentType",
        ea.objective,
        ea.target_json AS target,
        ea.status,
        ea.created_at AS "createdAt",
        ea.updated_at AS "updatedAt"
      FROM event_assignments ea
      JOIN events e ON e.id = ea.event_id
      JOIN guild_members gm ON gm.id = ea.guild_member_id
      WHERE e.guild_id = $1
        AND ea.event_id = $2
        AND ea.id = $3
      LIMIT 1
    `,
    [guildId, eventId, assignmentId]
  );

  const assignment = result.rows[0];

  if (!assignment) {
    throw new NotFoundError("Assignment not found");
  }

  return assignment;
}

async function getObjectiveRows(where: string[], values: unknown[]) {
  const limit = values[values.length - 1];
  const params = typeof limit === "number" ? values : [...values, 50];

  const result = await query<{
    id: string;
    guildId: string;
    eventId: string | null;
    eventTitle: string | null;
    guildMemberId: string | null;
    memberName: string | null;
    assignedBy: string | null;
    title: string;
    description: string | null;
    dueAt: string | null;
    status: ObjectiveStatus;
    completedAt: string | null;
    createdAt: string;
    updatedAt: string;
  }>(
    `
      SELECT
        o.id::text,
        o.guild_id::text AS "guildId",
        o.event_id::text AS "eventId",
        e.title AS "eventTitle",
        o.guild_member_id::text AS "guildMemberId",
        gm.nickname AS "memberName",
        o.assigned_by::text AS "assignedBy",
        o.title,
        o.description,
        o.due_at AS "dueAt",
        o.status,
        o.completed_at AS "completedAt",
        o.created_at AS "createdAt",
        o.updated_at AS "updatedAt"
      FROM objectives o
      LEFT JOIN events e ON e.id = o.event_id
      LEFT JOIN guild_members gm ON gm.id = o.guild_member_id
      WHERE ${where.join(" AND ")}
      ORDER BY o.due_at ASC NULLS LAST, o.created_at DESC
      LIMIT $${params.length}
    `,
    params
  );

  return result.rows;
}

async function getObjectiveById(guildId: string, objectiveId: string) {
  const objectives = await getObjectiveRows(["o.guild_id = $1", "o.id = $2"], [guildId, objectiveId, 1]);
  const objective = objectives[0];

  if (!objective) {
    throw new NotFoundError("Objective not found");
  }

  return objective;
}

async function assertObjectiveRelations(
  guildId: string,
  eventId: string | null | undefined,
  memberId: string | null | undefined
) {
  if (eventId) {
    await assertEventExists(guildId, eventId);
  }

  if (memberId) {
    await assertGuildMemberExists(guildId, memberId);
  }
}

async function getNextEventSummary(guildId: string) {
  const result = await query<EventRowWithStats>(
    `
      SELECT
        e.id::text,
        e.guild_id::text AS "guildId",
        e.server_id::text AS "serverId",
        e.title,
        e.event_type AS "eventType",
        e.description,
        e.starts_at AS "startsAt",
        e.ends_at AS "endsAt",
        e.location_label AS "locationLabel",
        e.location_x AS "locationX",
        e.location_y AS "locationY",
        e.created_by::text AS "createdBy",
        e.created_at AS "createdAt",
        e.updated_at AS "updatedAt",
        e.cancelled_at AS "cancelledAt",
        COALESCE(stats.confirmed_count, 0) AS "confirmedCount",
        COALESCE(stats.maybe_count, 0) AS "maybeCount",
        COALESCE(stats.absent_count, 0) AS "absentCount",
        COALESCE(stats.responded_count, 0) AS "respondedCount"
      FROM events e
      LEFT JOIN LATERAL (
        SELECT
          count(*) FILTER (WHERE status = 'confirmed')::int AS confirmed_count,
          count(*) FILTER (WHERE status = 'maybe')::int AS maybe_count,
          count(*) FILTER (WHERE status = 'absent')::int AS absent_count,
          count(*) FILTER (WHERE status <> 'pending')::int AS responded_count
        FROM event_attendance
        WHERE event_id = e.id
      ) stats ON true
      WHERE e.guild_id = $1
        AND e.cancelled_at IS NULL
        AND e.starts_at >= now()
      ORDER BY e.starts_at ASC
      LIMIT 1
    `,
    [guildId]
  );

  return result.rows[0] ? toEventResource(result.rows[0]) : null;
}

async function getAttendanceRateSummary(guildId: string, eventId?: string) {
  const targetEventId = eventId ?? (await getNextEventSummary(guildId))?.id;

  if (!targetEventId) {
    return null;
  }

  const result = await query<{
    activeMembers: number | string;
    confirmed: number | string;
    maybe: number | string;
    absent: number | string;
    pending: number | string;
  }>(
    `
      WITH active_members AS (
        SELECT id
        FROM guild_members
        WHERE guild_id = $1
          AND status = 'active'
      )
      SELECT
        count(am.id)::int AS "activeMembers",
        count(ea.guild_member_id) FILTER (WHERE ea.status = 'confirmed')::int AS confirmed,
        count(ea.guild_member_id) FILTER (WHERE ea.status = 'maybe')::int AS maybe,
        count(ea.guild_member_id) FILTER (WHERE ea.status = 'absent')::int AS absent,
        count(am.id) FILTER (WHERE ea.guild_member_id IS NULL OR ea.status = 'pending')::int AS pending
      FROM active_members am
      LEFT JOIN event_attendance ea
        ON ea.guild_member_id = am.id
       AND ea.event_id = $2
    `,
    [guildId, targetEventId]
  );

  const row = result.rows[0];
  const activeMembers = Number(row?.activeMembers ?? 0);
  const confirmed = Number(row?.confirmed ?? 0);
  const maybe = Number(row?.maybe ?? 0);
  const absent = Number(row?.absent ?? 0);
  const pending = Number(row?.pending ?? 0);

  return {
    eventId: targetEventId,
    activeMembers,
    confirmed,
    maybe,
    absent,
    pending,
    expected: confirmed + maybe,
    rate: activeMembers ? confirmed / activeMembers : 0
  };
}

async function getExpectedMembersSummary(guildId: string, eventId: string) {
  const result = await query<{
    memberId: string;
    userId: string | null;
    nickname: string;
    powerScore: string | null;
    status: AttendanceStatus;
    note: string | null;
    respondedAt: string | null;
  }>(
    `
      SELECT
        gm.id::text AS "memberId",
        gm.user_id::text AS "userId",
        gm.nickname,
        gm.power_score::text AS "powerScore",
        ea.status,
        ea.note,
        ea.responded_at AS "respondedAt"
      FROM event_attendance ea
      JOIN guild_members gm ON gm.id = ea.guild_member_id
      WHERE gm.guild_id = $1
        AND ea.event_id = $2
        AND ea.status IN ('confirmed', 'maybe')
      ORDER BY
        CASE ea.status WHEN 'confirmed' THEN 1 ELSE 2 END,
        gm.power_score DESC NULLS LAST,
        gm.nickname ASC
    `,
    [guildId, eventId]
  );

  return result.rows.map(toAttendanceResource);
}

async function getWeeklyObjectivesSummary(guildId: string) {
  const stats = await query<{
    weekStart: string;
    weekEnd: string;
    total: number | string;
    open: number | string;
    inProgress: number | string;
    done: number | string;
    cancelled: number | string;
  }>(
    `
      WITH bounds AS (
        SELECT date_trunc('week', now()) AS week_start,
               date_trunc('week', now()) + interval '7 days' AS week_end
      ),
      weekly AS (
        SELECT o.*
        FROM objectives o, bounds b
        WHERE o.guild_id = $1
          AND (
            (o.due_at >= b.week_start AND o.due_at < b.week_end)
            OR (o.due_at IS NULL AND o.created_at >= b.week_start AND o.created_at < b.week_end)
          )
      )
      SELECT
        b.week_start AS "weekStart",
        b.week_end AS "weekEnd",
        count(w.id)::int AS total,
        count(w.id) FILTER (WHERE w.status = 'open')::int AS open,
        count(w.id) FILTER (WHERE w.status = 'in_progress')::int AS "inProgress",
        count(w.id) FILTER (WHERE w.status = 'done')::int AS done,
        count(w.id) FILTER (WHERE w.status = 'cancelled')::int AS cancelled
      FROM bounds b
      LEFT JOIN weekly w ON true
      GROUP BY b.week_start, b.week_end
    `,
    [guildId]
  );

  const row = stats.rows[0];
  const objectives = await getObjectiveRows(
    [
      "o.guild_id = $1",
      "((o.due_at >= date_trunc('week', now()) AND o.due_at < date_trunc('week', now()) + interval '7 days') OR (o.due_at IS NULL AND o.created_at >= date_trunc('week', now()) AND o.created_at < date_trunc('week', now()) + interval '7 days'))"
    ],
    [guildId, 10]
  );
  const total = Number(row?.total ?? 0);
  const done = Number(row?.done ?? 0);

  return {
    weekStart: row?.weekStart ?? null,
    weekEnd: row?.weekEnd ?? null,
    total,
    open: Number(row?.open ?? 0),
    inProgress: Number(row?.inProgress ?? 0),
    done,
    cancelled: Number(row?.cancelled ?? 0),
    completionRate: total ? done / total : 0,
    objectives
  };
}

function getObjectiveCompletedAt(status: ObjectiveStatus, completedAt?: string | null): string | null {
  if (completedAt !== undefined) {
    return completedAt;
  }

  return status === "done" ? new Date().toISOString() : null;
}

function addPatchValue<T extends Record<string, unknown>>(
  body: T,
  bodyKey: keyof T & string,
  column: string,
  values: unknown[],
  sets: string[]
) {
  if (!hasOwn(body, bodyKey)) {
    return;
  }

  addRawPatchValue(column, body[bodyKey], values, sets);
}

function addRawPatchValue(column: string, value: unknown, values: unknown[], sets: string[]) {
  values.push(value);
  sets.push(`${column} = $${values.length}`);
}

function hasOwn<T extends object, K extends PropertyKey>(value: T, key: K): value is T & Record<K, unknown> {
  return Object.prototype.hasOwnProperty.call(value, key);
}

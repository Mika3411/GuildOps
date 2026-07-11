import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";
import { database, query, withClient } from "../db/pool.js";
import { asyncHandler } from "../http/async-handler.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../http/errors.js";
import { validate } from "../http/validate.js";
import {
  createGuildNotificationsForPermission,
  deliverPushNotifications,
  type GuildNotification
} from "../notifications/notifications.js";
import { getAuth, requireAuth } from "../security/auth.js";
import { assertGuildAccess } from "./access.js";
import { uuidSchema } from "./helpers.js";

export const bankRouter = Router();

const guildParamsSchema = z.object({
  guildId: uuidSchema
});

const bankCommandBodySchema = z
  .object({
    command: z.string().trim().min(1).max(80),
    context: z.record(z.string(), z.unknown()).optional()
  })
  .strict();

const bankRequestBodySchema = z
  .object({
    resourceCode: z.string().trim().min(1).max(48),
    amount: z.coerce.number().positive(),
    reason: z.string().trim().max(240).optional()
  })
  .strict();

const bankRequestStatusBodySchema = z
  .object({
    status: z.enum(["pending", "approved", "rejected", "refused", "fulfilled", "cancelled"])
  })
  .strict();

const bankMovementBodySchema = z
  .object({
    type: z.enum(["in", "out"]),
    resourceCode: z.string().trim().min(1).max(48),
    amount: z.coerce.number().positive(),
    note: z.string().trim().max(240).optional()
  })
  .strict();

const bankResourceBodySchema = z
  .object({
    resourceName: z.string().trim().min(1).max(120),
    amount: z.coerce.number().nonnegative(),
    unit: z.string().trim().max(24).nullable().optional()
  })
  .strict();

const bankRequestParamsSchema = z.object({
  guildId: uuidSchema,
  requestId: uuidSchema
});

const bankResourceParamsSchema = z.object({
  guildId: uuidSchema,
  resourceCode: z.string().trim().min(1).max(48)
});

bankRouter.get(
  "/guilds/:guildId/bank",
  requireAuth,
  validate({ params: guildParamsSchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId } = req.params as unknown as z.infer<typeof guildParamsSchema>;
    await assertGuildAccess(database, guildId, auth.user.id);

    const snapshot = await getBankSnapshot(guildId);
    res.json(snapshot);
  })
);

bankRouter.get(
  "/guilds/:guildId/bank/history",
  requireAuth,
  validate({ params: guildParamsSchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId } = req.params as unknown as z.infer<typeof guildParamsSchema>;
    await assertGuildAccess(database, guildId, auth.user.id);

    const snapshot = await getBankSnapshot(guildId);
    if (!snapshot.bank) {
      res.json({ movements: [] });
      return;
    }

    const movements = await getBankMovements(snapshot.bank.id);
    res.json({ movements });
  })
);

bankRouter.put(
  "/guilds/:guildId/bank/resources/:resourceCode",
  requireAuth,
  validate({ params: bankResourceParamsSchema, body: bankResourceBodySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId, resourceCode } = req.params as unknown as z.infer<typeof bankResourceParamsSchema>;
    const body = req.body as z.infer<typeof bankResourceBodySchema>;
    const access = await assertGuildAccess(database, guildId, auth.user.id);
    await assertCanManageBank(guildId, auth.user.id, access.organization_role, auth.user.globalRole);

    const snapshot = await getBankSnapshot(guildId);
    if (!snapshot.bank) {
      throw new BadRequestError("No bank is configured for this guild");
    }

    const actorMemberId = await getGuildMemberId(guildId, auth.user.id);
    const resource = await saveBankResource({
      bankId: snapshot.bank.id,
      resourceCode,
      resourceName: body.resourceName,
      amount: String(body.amount),
      unit: typeof body.unit === "string" ? body.unit.trim() || null : null,
      actorMemberId
    });

    res.json({ resource });
  })
);

bankRouter.post(
  "/guilds/:guildId/bank/movements",
  requireAuth,
  validate({ params: guildParamsSchema, body: bankMovementBodySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId } = req.params as unknown as z.infer<typeof guildParamsSchema>;
    const body = req.body as z.infer<typeof bankMovementBodySchema>;
    const access = await assertGuildAccess(database, guildId, auth.user.id);
    await assertCanManageBank(guildId, auth.user.id, access.organization_role, auth.user.globalRole);

    const snapshot = await getBankSnapshot(guildId);
    if (!snapshot.bank) {
      throw new BadRequestError("No bank is configured for this guild");
    }

    const actorMemberId = await getGuildMemberId(guildId, auth.user.id);
    const movement = await createBankMovement({
      bankId: snapshot.bank.id,
      resourceCode: body.resourceCode,
      movementType: body.type,
      amount: String(body.amount),
      actorMemberId,
      note: body.note?.trim() || (body.type === "in" ? "Depot banque" : "Sortie banque")
    });

    res.status(201).json({ movement });
  })
);

bankRouter.get(
  "/guilds/:guildId/bank/requests",
  requireAuth,
  validate({ params: guildParamsSchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId } = req.params as unknown as z.infer<typeof guildParamsSchema>;
    await assertGuildAccess(database, guildId, auth.user.id);

    const snapshot = await getBankSnapshot(guildId);
    res.json({ requests: snapshot.requests });
  })
);

bankRouter.post(
  "/guilds/:guildId/bank/commands",
  requireAuth,
  validate({ params: guildParamsSchema, body: bankCommandBodySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId } = req.params as unknown as z.infer<typeof guildParamsSchema>;
    const body = req.body as z.infer<typeof bankCommandBodySchema>;
    await assertGuildAccess(database, guildId, auth.user.id);

    const snapshot = await getBankSnapshot(guildId);

    if (!snapshot.bank) {
      throw new BadRequestError("No bank is configured for this guild");
    }

    if (body.command.toLowerCase() !== snapshot.bank.commandAlias.toLowerCase()) {
      throw new BadRequestError(`Unsupported bank command. Expected ${snapshot.bank.commandAlias}`);
    }

    const pendingResult = await query<{ count: string }>(
      `
        SELECT count(*)::text
        FROM bank_requests br
        WHERE br.bank_id = $1
          AND br.status = 'pending'
      `,
      [snapshot.bank.id]
    );
    const pendingRequests = Number(pendingResult.rows[0]?.count ?? 0);
    const resourceSummary = snapshot.resources.length
      ? snapshot.resources.map((resource) => `${resource.resourceName}: ${resource.amount}`).join(", ")
      : "aucune ressource enregistree";
    const actorMemberId = await getGuildMemberId(guildId, auth.user.id);

    await query(
      `
        INSERT INTO bank_movements (bank_id, movement_type, amount, actor_member_id, note)
        VALUES ($1, 'command', 0, $2, $3)
      `,
      [snapshot.bank.id, actorMemberId, `Commande ${body.command} executee`]
    );

    res.json({
      command: body.command,
      response: `Banque ${snapshot.bank.name}: ${resourceSummary}. Demandes en attente: ${pendingRequests}.`,
      bank: snapshot.bank,
      resources: snapshot.resources,
      pendingRequests
    });
  })
);

bankRouter.post(
  "/guilds/:guildId/bank/requests",
  requireAuth,
  validate({ params: guildParamsSchema, body: bankRequestBodySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId } = req.params as unknown as z.infer<typeof guildParamsSchema>;
    const body = req.body as z.infer<typeof bankRequestBodySchema>;
    await assertGuildAccess(database, guildId, auth.user.id);

    const snapshot = await getBankSnapshot(guildId);
    if (!snapshot.bank) {
      throw new BadRequestError("No bank is configured for this guild");
    }
    const bank = snapshot.bank;

    const memberId = await getGuildMemberId(guildId, auth.user.id);
    if (!memberId) {
      throw new BadRequestError("A guild membership is required to request resources");
    }

    const resource = snapshot.resources.find((item) => item.resourceCode === body.resourceCode);
    const resourceName = resource?.resourceName || body.resourceCode;
    const requester = await getGuildMemberDisplayName(guildId, auth.user.id);
    let notifications: GuildNotification[] = [];

    const result = await withClient(async (client) => {
      await client.query("BEGIN");

      try {
        const requestResult = await client.query<{ id: string }>(
          `
            INSERT INTO bank_requests (bank_id, requester_member_id, resource_code, amount, reason)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id::text
          `,
          [bank.id, memberId, body.resourceCode, body.amount, body.reason ?? null]
        );
        const requestId = requestResult.rows[0]?.id;

        if (!requestId) {
          throw new BadRequestError("Bank request could not be created");
        }

        notifications = await createGuildNotificationsForPermission(client, {
          guildId,
          actorUserId: auth.user.id,
          permissionKeys: ["manage_bank", "admin_all"],
          type: "bank.request.created",
          title: "Nouvelle demande de ressources",
          body: `${requester}: ${formatBankNotificationAmount(body.amount, resource?.unit)} ${resourceName}`,
          data: {
            url: "/app/bank",
            requestId,
            resourceCode: body.resourceCode,
            resourceName,
            amount: body.amount,
            unit: resource?.unit || "",
            reason: body.reason ?? null
          }
        });

        await client.query("COMMIT");
        return { id: requestId };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });

    void deliverPushNotifications(notifications);

    res.status(201).json({ id: result.id, status: "pending" });
  })
);

bankRouter.patch(
  "/guilds/:guildId/bank/requests/:requestId/approve",
  requireAuth,
  validate({ params: bankRequestParamsSchema }),
  asyncHandler(async (req, res) => {
    req.body = { status: "approved" };
    await updateBankRequestStatus(req, res);
  })
);

bankRouter.patch(
  "/guilds/:guildId/bank/requests/:requestId/status",
  requireAuth,
  validate({ params: bankRequestParamsSchema, body: bankRequestStatusBodySchema }),
  asyncHandler(updateBankRequestStatus)
);

async function getBankSnapshot(guildId: string): Promise<{
  bank: null | {
    id: string;
    name: string;
    commandAlias: string;
  };
  resources: Array<{
    resourceCode: string;
    resourceName: string;
    amount: string;
    unit: string | null;
    updatedAt: string;
  }>;
  requests: Array<BankRequestSummary>;
  movements: Array<BankMovementSummary>;
}> {
  const bankResult = await query<{ id: string; name: string; command_alias: string }>(
    `
      SELECT id::text, name, command_alias::text
      FROM banks
      WHERE guild_id = $1
      ORDER BY created_at ASC
      LIMIT 1
    `,
    [guildId]
  );
  const bank = bankResult.rows[0];

  if (!bank) {
    return { bank: null, resources: [], requests: [], movements: [] };
  }

  const resourcesResult = await query<{
    resource_code: string;
    resource_name: string;
    amount: string;
    unit: string | null;
    updated_at: string;
  }>(
    `
      SELECT
        resource_code::text,
        resource_name,
        amount::text,
        unit,
        updated_at::text
      FROM bank_resources
      WHERE bank_id = $1
      ORDER BY resource_name ASC
    `,
    [bank.id]
  );

  const requests = await getBankRequests(bank.id);
  const movements = await getBankMovements(bank.id);

  return {
    bank: {
      id: bank.id,
      name: bank.name,
      commandAlias: bank.command_alias
    },
    resources: resourcesResult.rows.map(mapBankResource),
    requests,
    movements
  };
}

type BankResourceSummary = {
  resourceCode: string;
  resourceName: string;
  amount: string;
  unit: string | null;
  updatedAt: string;
};

type BankRequestSummary = {
  id: string;
  member: string;
  requester: string;
  resourceCode: string;
  resource: string;
  amount: string;
  unit: string | null;
  reason: string | null;
  status: string;
  createdAt: string;
};

type BankMovementSummary = {
  id: string;
  resourceCode: string | null;
  resource: string | null;
  type: string;
  movementType: string;
  amount: string;
  unit: string | null;
  actor: string | null;
  note: string;
  time: string;
  createdAt: string;
};

type BankStoredRequestStatus = "pending" | "approved" | "refused" | "fulfilled" | "cancelled";
type BankRequestStatus = "pending" | "approved" | "refused" | "fulfilled" | "cancelled";

async function getGuildMemberId(guildId: string, userId: string): Promise<string | null> {
  const result = await query<{ id: string }>(
    `
      SELECT id::text
      FROM guild_members
      WHERE guild_id = $1
        AND user_id = $2
      LIMIT 1
    `,
    [guildId, userId]
  );

  return result.rows[0]?.id ?? null;
}

async function getGuildMemberDisplayName(guildId: string, userId: string): Promise<string> {
  const result = await query<{ nickname: string }>(
    `
      SELECT nickname
      FROM guild_members
      WHERE guild_id = $1
        AND user_id = $2
      LIMIT 1
    `,
    [guildId, userId]
  );

  return result.rows[0]?.nickname || "Membre";
}

function formatBankNotificationAmount(amount: number, unit?: string | null): string {
  return `${amount.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}${unit || ""}`;
}

async function getBankRequests(bankId: string): Promise<BankRequestSummary[]> {
  const result = await query<{
    id: string;
    requester: string;
    resource_code: string;
    resource_name: string;
    amount: string;
    unit: string | null;
    reason: string | null;
    status: string;
    created_at: string;
  }>(
    `
      SELECT
        br.id::text,
        requester.nickname AS requester,
        br.resource_code::text,
        COALESCE(resource.resource_name, br.resource_code::text) AS resource_name,
        br.amount::text,
        resource.unit,
        br.reason,
        br.status,
        br.created_at::text
      FROM bank_requests br
      JOIN guild_members requester ON requester.id = br.requester_member_id
      LEFT JOIN bank_resources resource
        ON resource.bank_id = br.bank_id
       AND resource.resource_code = br.resource_code
      WHERE br.bank_id = $1
      ORDER BY br.created_at DESC
      LIMIT 50
    `,
    [bankId]
  );

  return result.rows.map((request) => ({
    id: request.id,
    member: request.requester,
    requester: request.requester,
    resourceCode: request.resource_code,
    resource: request.resource_name,
    amount: request.amount,
    unit: request.unit,
    reason: request.reason,
    status: normalizeStoredBankStatus(request.status),
    createdAt: request.created_at
  }));
}

async function getBankMovements(bankId: string): Promise<BankMovementSummary[]> {
  const result = await query<{
    id: string;
    resource_code: string | null;
    resource_name: string | null;
    movement_type: string;
    amount: string;
    unit: string | null;
    actor: string | null;
    note: string;
    created_at: string;
  }>(
    `
      SELECT
        bm.id::text,
        bm.resource_code::text,
        resource.resource_name,
        bm.movement_type,
        bm.amount::text,
        bm.unit,
        actor.nickname AS actor,
        bm.note,
        bm.created_at::text
      FROM bank_movements bm
      LEFT JOIN guild_members actor ON actor.id = bm.actor_member_id
      LEFT JOIN bank_resources resource
        ON resource.bank_id = bm.bank_id
       AND resource.resource_code = bm.resource_code
      WHERE bm.bank_id = $1
      ORDER BY bm.created_at DESC
      LIMIT 50
    `,
    [bankId]
  );

  return result.rows.map(mapBankMovement);
}

async function assertCanManageBank(
  guildId: string,
  userId: string,
  organizationRole: string,
  globalRole: string
): Promise<void> {
  if (["owner", "admin"].includes(organizationRole) || globalRole === "admin") {
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
        AND p.key IN ('manage_bank', 'admin_all')
      LIMIT 1
    `,
    [guildId, userId]
  );

  if (!result.rows[0]?.allowed) {
    throw new ForbiddenError("Permission manage_bank is required");
  }
}

async function createBankMovement(input: {
  bankId: string;
  resourceCode: string;
  movementType: "in" | "out";
  amount: string;
  actorMemberId: string | null;
  note: string;
}): Promise<BankMovementSummary> {
  return withClient(async (client) => {
    await client.query("BEGIN");

    try {
      const stockOperator = input.movementType === "in" ? "+" : "-";
      const resourceResult = await client.query<{ amount: string; unit: string | null }>(
        `
          UPDATE bank_resources
          SET
            amount = amount ${stockOperator} $3::numeric,
            updated_by_member_id = $4,
            updated_at = now()
          WHERE bank_id = $1
            AND resource_code = $2
            ${input.movementType === "out" ? "AND amount >= $3::numeric" : ""}
          RETURNING amount::text, unit
        `,
        [input.bankId, input.resourceCode, input.amount, input.actorMemberId]
      );

      const resource = resourceResult.rows[0];
      if (!resource) {
        throw new BadRequestError("Bank resource not found or stock is insufficient");
      }

      const movementResult = await client.query<{
        id: string;
        resource_code: string | null;
        resource_name: string | null;
        movement_type: string;
        amount: string;
        unit: string | null;
        actor: string | null;
        note: string;
        created_at: string;
      }>(
        `
          INSERT INTO bank_movements (bank_id, resource_code, movement_type, amount, unit, actor_member_id, note)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING
            id::text,
            resource_code::text,
            (
              SELECT resource_name
              FROM bank_resources
              WHERE bank_id = $1
                AND resource_code = $2
              LIMIT 1
            ) AS resource_name,
            movement_type,
            amount::text,
            unit,
            (
              SELECT nickname
              FROM guild_members
              WHERE id = $6
              LIMIT 1
            ) AS actor,
            note,
            created_at::text
        `,
        [input.bankId, input.resourceCode, input.movementType, input.amount, resource.unit, input.actorMemberId, input.note]
      );

      await client.query("COMMIT");
      const movement = movementResult.rows[0];

      if (!movement) {
        throw new BadRequestError("Bank movement could not be created");
      }

      return mapBankMovement(movement);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

async function saveBankResource(input: {
  bankId: string;
  resourceCode: string;
  resourceName: string;
  amount: string;
  unit: string | null;
  actorMemberId: string | null;
}): Promise<BankResourceSummary> {
  return withClient(async (client) => {
    await client.query("BEGIN");

    try {
      const previousResult = await client.query<{ amount: string }>(
        `
          SELECT amount::text
          FROM bank_resources
          WHERE bank_id = $1
            AND resource_code = $2
          FOR UPDATE
        `,
        [input.bankId, input.resourceCode]
      );
      const previousAmount = Number(previousResult.rows[0]?.amount ?? 0);
      const nextAmount = Number(input.amount);

      const resourceResult = await client.query<{
        resource_code: string;
        resource_name: string;
        amount: string;
        unit: string | null;
        updated_at: string;
      }>(
        `
          INSERT INTO bank_resources (
            bank_id,
            resource_code,
            resource_name,
            amount,
            unit,
            updated_by_member_id
          )
          VALUES ($1, $2, $3, $4::numeric, $5, $6)
          ON CONFLICT (bank_id, resource_code)
          DO UPDATE SET
            resource_name = EXCLUDED.resource_name,
            amount = EXCLUDED.amount,
            unit = EXCLUDED.unit,
            updated_by_member_id = EXCLUDED.updated_by_member_id,
            updated_at = now()
          RETURNING
            resource_code::text,
            resource_name,
            amount::text,
            unit,
            updated_at::text
        `,
        [input.bankId, input.resourceCode, input.resourceName, input.amount, input.unit, input.actorMemberId]
      );

      const resource = resourceResult.rows[0];
      if (!resource) {
        throw new BadRequestError("Bank resource could not be saved");
      }

      const movementAmount = previousResult.rows[0] ? Math.abs(nextAmount - previousAmount) : nextAmount;
      const movementNote = previousResult.rows[0]
        ? `Ajustement ressource ${resource.resource_name}`
        : `Creation ressource ${resource.resource_name}`;

      await client.query(
        `
          INSERT INTO bank_movements (bank_id, resource_code, movement_type, amount, unit, actor_member_id, note)
          VALUES ($1, $2, 'adjustment', $3::numeric, $4, $5, $6)
        `,
        [input.bankId, input.resourceCode, String(movementAmount), resource.unit, input.actorMemberId, movementNote]
      );

      await client.query("COMMIT");
      return mapBankResource(resource);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

async function updateBankRequestStatus(req: Request, res: Response): Promise<void> {
  const auth = getAuth(res);
  const { guildId, requestId } = bankRequestParamsSchema.parse(req.params);
  const body = bankRequestStatusBodySchema.parse(req.body);
  const nextStatus = normalizeIncomingBankStatus(body.status);
  const access = await assertGuildAccess(database, guildId, auth.user.id);
  await assertCanManageBank(guildId, auth.user.id, access.organization_role, auth.user.globalRole);

  const decidedByMemberId = await getGuildMemberId(guildId, auth.user.id);
  const request = await withClient(async (client) => {
    await client.query("BEGIN");

    try {
      const targetResult = await client.query<{
        id: string;
        bank_id: string;
        requester: string;
        resource_code: string;
        resource_name: string;
        amount: string;
        unit: string | null;
        reason: string | null;
        status: string;
        created_at: string;
      }>(
        `
          SELECT
            br.id::text,
            br.bank_id::text,
            requester.nickname AS requester,
            br.resource_code::text,
            COALESCE(resource.resource_name, br.resource_code::text) AS resource_name,
            br.amount::text,
            resource.unit,
            br.reason,
            br.status,
            br.created_at::text
          FROM bank_requests br
          JOIN banks b ON b.id = br.bank_id
          JOIN guild_members requester ON requester.id = br.requester_member_id
          LEFT JOIN bank_resources resource
            ON resource.bank_id = br.bank_id
           AND resource.resource_code = br.resource_code
          WHERE br.id = $2
            AND b.guild_id = $1
          FOR UPDATE OF br
          LIMIT 1
        `,
        [guildId, requestId]
      );

      const bankRequest = targetResult.rows[0];
      if (!bankRequest) {
        throw new NotFoundError("Bank request not found");
      }

      const previousStatus = normalizeStoredBankStatus(bankRequest.status);
      if (previousStatus === "fulfilled" && nextStatus !== "fulfilled") {
        throw new BadRequestError("Fulfilled bank requests cannot be reopened");
      }

      if (nextStatus === "fulfilled" && previousStatus !== "fulfilled") {
        const stockResult = await client.query<{ amount: string }>(
          `
            UPDATE bank_resources
            SET
              amount = amount - $3::numeric,
              updated_by_member_id = $4,
              updated_at = now()
            WHERE bank_id = $1
              AND resource_code = $2
              AND amount >= $3::numeric
            RETURNING amount::text
          `,
          [bankRequest.bank_id, bankRequest.resource_code, bankRequest.amount, decidedByMemberId]
        );

        if (!stockResult.rows[0]) {
          throw new BadRequestError("Bank stock is insufficient to fulfill this request");
        }

        await client.query(
          `
            INSERT INTO bank_movements (bank_id, resource_code, movement_type, amount, unit, actor_member_id, note)
            VALUES ($1, $2, 'out', $3, $4, $5, $6)
          `,
          [
            bankRequest.bank_id,
            bankRequest.resource_code,
            bankRequest.amount,
            bankRequest.unit,
            decidedByMemberId,
            `Livraison demande ${bankRequest.requester}`
          ]
        );
      }

      const result = await client.query<{
        id: string;
        requester: string;
        resource_code: string;
        resource_name: string;
        amount: string;
        unit: string | null;
        reason: string | null;
        status: string;
        created_at: string;
      }>(
        `
          UPDATE bank_requests br
          SET
            status = $1,
            decided_by_member_id = CASE WHEN $1 = 'pending' THEN NULL ELSE $2::uuid END,
            decided_at = CASE WHEN $1 = 'pending' THEN NULL ELSE now() END
          FROM guild_members requester
          WHERE br.id = $3
            AND requester.id = br.requester_member_id
          RETURNING
            br.id::text,
            requester.nickname AS requester,
            br.resource_code::text,
            COALESCE(
              (
                SELECT resource_name
                FROM bank_resources
                WHERE bank_id = br.bank_id
                  AND resource_code = br.resource_code
                LIMIT 1
              ),
              br.resource_code::text
            ) AS resource_name,
            br.amount::text,
            (
              SELECT unit
              FROM bank_resources
              WHERE bank_id = br.bank_id
                AND resource_code = br.resource_code
              LIMIT 1
            ) AS unit,
            br.reason,
            br.status,
            br.created_at::text
        `,
        [nextStatus, decidedByMemberId, requestId]
      );

      const updatedRequest = result.rows[0];
      if (!updatedRequest) {
        throw new NotFoundError("Bank request not found");
      }

      await client.query("COMMIT");

      return {
        id: updatedRequest.id,
        member: updatedRequest.requester,
        requester: updatedRequest.requester,
        resourceCode: updatedRequest.resource_code,
        resource: updatedRequest.resource_name,
        amount: updatedRequest.amount,
        unit: updatedRequest.unit,
        reason: updatedRequest.reason,
        status: normalizeStoredBankStatus(updatedRequest.status),
        createdAt: updatedRequest.created_at
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });

  res.json({
    request
  });
}

export function normalizeIncomingBankStatus(status: string): BankStoredRequestStatus {
  return (status === "rejected" ? "refused" : status) as BankStoredRequestStatus;
}

export function normalizeStoredBankStatus(status: string): BankRequestStatus {
  return (status === "rejected" ? "refused" : status) as BankRequestStatus;
}

function mapBankResource(row: {
  resource_code: string;
  resource_name: string;
  amount: string;
  unit: string | null;
  updated_at: string;
}): BankResourceSummary {
  return {
    resourceCode: row.resource_code,
    resourceName: row.resource_name,
    amount: row.amount,
    unit: row.unit,
    updatedAt: row.updated_at
  };
}

function mapBankMovement(row: {
  id: string;
  resource_code: string | null;
  resource_name: string | null;
  movement_type: string;
  amount: string;
  unit: string | null;
  actor: string | null;
  note: string;
  created_at: string;
}): BankMovementSummary {
  return {
    id: row.id,
    resourceCode: row.resource_code,
    resource: row.resource_name,
    type: row.movement_type,
    movementType: row.movement_type,
    amount: row.amount,
    unit: row.unit,
    actor: row.actor,
    note: row.note,
    time: row.created_at,
    createdAt: row.created_at
  };
}

import { Router } from "express";
import { z } from "zod";
import { database, query, withClient, type Queryable } from "../db/pool.js";
import { asyncHandler } from "../http/async-handler.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../http/errors.js";
import { validate } from "../http/validate.js";
import { getAuth, requireAuth } from "../security/auth.js";
import { assertGuildAccess } from "./access.js";
import { uuidSchema } from "./helpers.js";

export const guildMergesRouter = Router();

const guildParamsSchema = z.object({
  guildId: uuidSchema
});

const mergeRequestParamsSchema = z.object({
  guildId: uuidSchema,
  mergeRequestId: uuidSchema
});

const mergeDuplicateParamsSchema = mergeRequestParamsSchema.extend({
  duplicateId: uuidSchema
});

const createMergeRequestBodySchema = z
  .object({
    targetGuildId: uuidSchema,
    strategy: z.record(z.string(), z.unknown()).optional(),
    scan: z.boolean().default(true)
  })
  .strict();

const duplicateDecisionBodySchema = z
  .object({
    decision: z.enum(["pending", "merge", "keep_both", "ignore"])
  })
  .strict();

guildMergesRouter.get(
  "/guilds/:guildId/merge-requests",
  requireAuth,
  validate({ params: guildParamsSchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId } = req.params as unknown as z.infer<typeof guildParamsSchema>;
    await assertCanManageMerge(guildId, auth.user.id, auth.user.globalRole);

    res.json({ mergeRequests: await listMergeRequests(guildId) });
  })
);

guildMergesRouter.post(
  "/guilds/:guildId/merge-requests",
  requireAuth,
  validate({ params: guildParamsSchema, body: createMergeRequestBodySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId } = req.params as unknown as z.infer<typeof guildParamsSchema>;
    const body = req.body as z.infer<typeof createMergeRequestBodySchema>;

    if (guildId === body.targetGuildId) {
      throw new BadRequestError("Source and target guilds must be different");
    }

    const sourceAccess = await assertCanManageMerge(guildId, auth.user.id, auth.user.globalRole);
    const targetAccess = await assertCanManageMerge(body.targetGuildId, auth.user.id, auth.user.globalRole);

    if (sourceAccess.organization_id !== targetAccess.organization_id) {
      throw new BadRequestError("Guild merge requests must stay inside the same organization");
    }

    const mergeRequestId = await withClient(async (client) => {
      await client.query("BEGIN");

      try {
        const result = await client.query<{ id: string }>(
          `
            INSERT INTO guild_merge_requests (
              source_guild_id,
              target_guild_id,
              requested_by,
              status,
              strategy_json
            )
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id::text
          `,
          [guildId, body.targetGuildId, auth.user.id, body.scan ? "scanning" : "draft", body.strategy ?? {}]
        );
        const id = result.rows[0]?.id;

        if (!id) {
          throw new BadRequestError("Merge request could not be created");
        }

        if (body.scan) {
          const duplicateCount = await scanMergeDuplicates(client, id, guildId, body.targetGuildId);
          await markMergeRequestScanned(client, id, duplicateCount);
        }

        await client.query("COMMIT");
        return id;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });

    res.status(201).json({
      mergeRequest: await getMergeRequest(mergeRequestId, guildId),
      duplicates: await listMergeDuplicates(mergeRequestId, guildId)
    });
  })
);

guildMergesRouter.get(
  "/guilds/:guildId/merge-requests/:mergeRequestId",
  requireAuth,
  validate({ params: mergeRequestParamsSchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId, mergeRequestId } = req.params as unknown as z.infer<typeof mergeRequestParamsSchema>;
    const mergeRequest = await getMergeRequest(mergeRequestId, guildId);
    await assertCanManageMerge(mergeRequest.sourceGuild.id, auth.user.id, auth.user.globalRole);
    await assertCanManageMerge(mergeRequest.targetGuild.id, auth.user.id, auth.user.globalRole);

    res.json({
      mergeRequest,
      duplicates: await listMergeDuplicates(mergeRequestId, guildId)
    });
  })
);

guildMergesRouter.post(
  "/guilds/:guildId/merge-requests/:mergeRequestId/rescan",
  requireAuth,
  validate({ params: mergeRequestParamsSchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId, mergeRequestId } = req.params as unknown as z.infer<typeof mergeRequestParamsSchema>;
    const mergeRequest = await getMergeRequest(mergeRequestId, guildId);
    await assertCanManageMerge(mergeRequest.sourceGuild.id, auth.user.id, auth.user.globalRole);
    await assertCanManageMerge(mergeRequest.targetGuild.id, auth.user.id, auth.user.globalRole);

    await withClient(async (client) => {
      await client.query("BEGIN");

      try {
        await client.query("DELETE FROM guild_merge_duplicates WHERE merge_request_id = $1", [mergeRequestId]);
        await client.query("UPDATE guild_merge_requests SET status = 'scanning' WHERE id = $1", [mergeRequestId]);
        const duplicateCount = await scanMergeDuplicates(
          client,
          mergeRequestId,
          mergeRequest.sourceGuild.id,
          mergeRequest.targetGuild.id
        );
        await markMergeRequestScanned(client, mergeRequestId, duplicateCount);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });

    res.json({
      mergeRequest: await getMergeRequest(mergeRequestId, guildId),
      duplicates: await listMergeDuplicates(mergeRequestId, guildId)
    });
  })
);

guildMergesRouter.get(
  "/guilds/:guildId/merge-requests/:mergeRequestId/duplicates",
  requireAuth,
  validate({ params: mergeRequestParamsSchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId, mergeRequestId } = req.params as unknown as z.infer<typeof mergeRequestParamsSchema>;
    const mergeRequest = await getMergeRequest(mergeRequestId, guildId);
    await assertCanManageMerge(mergeRequest.sourceGuild.id, auth.user.id, auth.user.globalRole);
    await assertCanManageMerge(mergeRequest.targetGuild.id, auth.user.id, auth.user.globalRole);

    res.json({ duplicates: await listMergeDuplicates(mergeRequestId, guildId) });
  })
);

guildMergesRouter.patch(
  "/guilds/:guildId/merge-requests/:mergeRequestId/duplicates/:duplicateId",
  requireAuth,
  validate({ params: mergeDuplicateParamsSchema, body: duplicateDecisionBodySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId, mergeRequestId, duplicateId } = req.params as unknown as z.infer<
      typeof mergeDuplicateParamsSchema
    >;
    const body = req.body as z.infer<typeof duplicateDecisionBodySchema>;
    const mergeRequest = await getMergeRequest(mergeRequestId, guildId);
    await assertCanManageMerge(mergeRequest.sourceGuild.id, auth.user.id, auth.user.globalRole);
    await assertCanManageMerge(mergeRequest.targetGuild.id, auth.user.id, auth.user.globalRole);

    const result = await query<{ id: string }>(
      `
        UPDATE guild_merge_duplicates duplicate
        SET
          decision = $1,
          decided_by = CASE WHEN $1 = 'pending' THEN NULL ELSE $2::uuid END,
          decided_at = CASE WHEN $1 = 'pending' THEN NULL ELSE now() END
        FROM guild_merge_requests request
        WHERE duplicate.id = $3
          AND duplicate.merge_request_id = $4
          AND request.id = duplicate.merge_request_id
          AND (request.source_guild_id = $5 OR request.target_guild_id = $5)
        RETURNING duplicate.id::text
      `,
      [body.decision, auth.user.id, duplicateId, mergeRequestId, guildId]
    );

    if (!result.rows[0]) {
      throw new NotFoundError("Duplicate candidate not found");
    }

    res.json({ duplicate: await getMergeDuplicate(mergeRequestId, guildId, duplicateId) });
  })
);

type GuildAccess = Awaited<ReturnType<typeof assertGuildAccess>>;

type MergeRequestRow = {
  id: string;
  source_guild_id: string;
  source_guild_name: string;
  target_guild_id: string;
  target_guild_name: string;
  requested_by: string;
  requested_by_name: string | null;
  status: string;
  strategy_json: Record<string, unknown>;
  duplicate_count: number;
  pending_count: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

type MergeDuplicateRow = {
  id: string;
  merge_request_id: string;
  duplicate_type: string;
  confidence: number;
  reasons: unknown;
  decision: string;
  decided_at: string | null;
  decided_by_name: string | null;
  source_member_id: string | null;
  source_nickname: string | null;
  source_email: string | null;
  source_display_name: string | null;
  source_power_score: string | null;
  source_status: string | null;
  source_guild_id: string | null;
  source_guild_name: string | null;
  source_game: string | null;
  source_server: string | null;
  source_role_codes: string[] | null;
  target_member_id: string | null;
  target_nickname: string | null;
  target_email: string | null;
  target_display_name: string | null;
  target_power_score: string | null;
  target_status: string | null;
  target_guild_id: string | null;
  target_guild_name: string | null;
  target_game: string | null;
  target_server: string | null;
  target_role_codes: string[] | null;
};

async function assertCanManageMerge(guildId: string, userId: string, globalRole: string): Promise<GuildAccess> {
  const access = await assertGuildAccess(database, guildId, userId);

  if (globalRole === "admin" || ["owner", "admin"].includes(access.organization_role)) {
    return access;
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
        AND p.key IN ('manage_site', 'manage_members', 'admin_all')
      LIMIT 1
    `,
    [guildId, userId]
  );

  if (!result.rows[0]?.allowed) {
    throw new ForbiddenError("Permission admin_all or manage_site is required for guild merge requests");
  }

  return access;
}

async function listMergeRequests(guildId: string) {
  const result = await query<MergeRequestRow>(
    `
      SELECT
        request.id::text,
        request.source_guild_id::text,
        source_guild.name AS source_guild_name,
        request.target_guild_id::text,
        target_guild.name AS target_guild_name,
        request.requested_by::text,
        requested_by.display_name AS requested_by_name,
        request.status,
        request.strategy_json,
        count(duplicate.id)::int AS duplicate_count,
        count(duplicate.id) FILTER (WHERE duplicate.decision = 'pending')::int AS pending_count,
        request.created_at::text,
        request.updated_at::text,
        request.completed_at::text
      FROM guild_merge_requests request
      JOIN guilds source_guild ON source_guild.id = request.source_guild_id
      JOIN guilds target_guild ON target_guild.id = request.target_guild_id
      LEFT JOIN users requested_by ON requested_by.id = request.requested_by
      LEFT JOIN guild_merge_duplicates duplicate ON duplicate.merge_request_id = request.id
      WHERE request.source_guild_id = $1
         OR request.target_guild_id = $1
      GROUP BY request.id, source_guild.id, target_guild.id, requested_by.id
      ORDER BY request.created_at DESC
    `,
    [guildId]
  );

  return result.rows.map(mapMergeRequest);
}

async function getMergeRequest(mergeRequestId: string, guildId: string) {
  const result = await query<MergeRequestRow>(
    `
      SELECT
        request.id::text,
        request.source_guild_id::text,
        source_guild.name AS source_guild_name,
        request.target_guild_id::text,
        target_guild.name AS target_guild_name,
        request.requested_by::text,
        requested_by.display_name AS requested_by_name,
        request.status,
        request.strategy_json,
        count(duplicate.id)::int AS duplicate_count,
        count(duplicate.id) FILTER (WHERE duplicate.decision = 'pending')::int AS pending_count,
        request.created_at::text,
        request.updated_at::text,
        request.completed_at::text
      FROM guild_merge_requests request
      JOIN guilds source_guild ON source_guild.id = request.source_guild_id
      JOIN guilds target_guild ON target_guild.id = request.target_guild_id
      LEFT JOIN users requested_by ON requested_by.id = request.requested_by
      LEFT JOIN guild_merge_duplicates duplicate ON duplicate.merge_request_id = request.id
      WHERE request.id = $1
        AND (request.source_guild_id = $2 OR request.target_guild_id = $2)
      GROUP BY request.id, source_guild.id, target_guild.id, requested_by.id
      LIMIT 1
    `,
    [mergeRequestId, guildId]
  );
  const row = result.rows[0];

  if (!row) {
    throw new NotFoundError("Merge request not found");
  }

  return mapMergeRequest(row);
}

async function listMergeDuplicates(mergeRequestId: string, guildId: string) {
  const result = await query<MergeDuplicateRow>(
    `
      SELECT
        duplicate.id::text,
        duplicate.merge_request_id::text,
        duplicate.duplicate_type,
        duplicate.confidence::float8 AS confidence,
        duplicate.reasons,
        duplicate.decision,
        duplicate.decided_at::text,
        decided_by.display_name AS decided_by_name,
        source_member.id::text AS source_member_id,
        source_member.nickname AS source_nickname,
        source_user.email::text AS source_email,
        source_user.display_name AS source_display_name,
        source_member.power_score::text AS source_power_score,
        source_member.status AS source_status,
        source_guild.id::text AS source_guild_id,
        source_guild.name AS source_guild_name,
        source_game.name AS source_game,
        source_server.code AS source_server,
        COALESCE(source_roles.role_codes, ARRAY[]::text[]) AS source_role_codes,
        target_member.id::text AS target_member_id,
        target_member.nickname AS target_nickname,
        target_user.email::text AS target_email,
        target_user.display_name AS target_display_name,
        target_member.power_score::text AS target_power_score,
        target_member.status AS target_status,
        target_guild.id::text AS target_guild_id,
        target_guild.name AS target_guild_name,
        target_game.name AS target_game,
        target_server.code AS target_server,
        COALESCE(target_roles.role_codes, ARRAY[]::text[]) AS target_role_codes
      FROM guild_merge_duplicates duplicate
      JOIN guild_merge_requests request ON request.id = duplicate.merge_request_id
      LEFT JOIN users decided_by ON decided_by.id = duplicate.decided_by
      LEFT JOIN guild_members source_member ON source_member.id = duplicate.source_member_id
      LEFT JOIN users source_user ON source_user.id = source_member.user_id
      LEFT JOIN guilds source_guild ON source_guild.id = source_member.guild_id
      LEFT JOIN games source_game ON source_game.id = source_guild.game_id
      LEFT JOIN servers source_server ON source_server.id = source_guild.server_id
      LEFT JOIN LATERAL (
        SELECT array_agg(DISTINCT roles.code::text ORDER BY roles.code::text) AS role_codes
        FROM guild_member_roles gmr
        JOIN roles ON roles.id = gmr.role_id
        WHERE gmr.guild_member_id = source_member.id
      ) source_roles ON true
      LEFT JOIN guild_members target_member ON target_member.id = duplicate.target_member_id
      LEFT JOIN users target_user ON target_user.id = target_member.user_id
      LEFT JOIN guilds target_guild ON target_guild.id = target_member.guild_id
      LEFT JOIN games target_game ON target_game.id = target_guild.game_id
      LEFT JOIN servers target_server ON target_server.id = target_guild.server_id
      LEFT JOIN LATERAL (
        SELECT array_agg(DISTINCT roles.code::text ORDER BY roles.code::text) AS role_codes
        FROM guild_member_roles gmr
        JOIN roles ON roles.id = gmr.role_id
        WHERE gmr.guild_member_id = target_member.id
      ) target_roles ON true
      WHERE duplicate.merge_request_id = $1
        AND (request.source_guild_id = $2 OR request.target_guild_id = $2)
      ORDER BY
        (duplicate.decision = 'pending') DESC,
        duplicate.confidence DESC,
        duplicate.created_at ASC
    `,
    [mergeRequestId, guildId]
  );

  return result.rows.map(mapMergeDuplicate);
}

async function getMergeDuplicate(mergeRequestId: string, guildId: string, duplicateId: string) {
  const duplicates = await listMergeDuplicates(mergeRequestId, guildId);
  const duplicate = duplicates.find((candidate) => candidate.id === duplicateId);

  if (!duplicate) {
    throw new NotFoundError("Duplicate candidate not found");
  }

  return duplicate;
}

async function scanMergeDuplicates(
  db: Queryable,
  mergeRequestId: string,
  sourceGuildId: string,
  targetGuildId: string
): Promise<number> {
  const result = await db.query<{ id: string }>(
    `
      WITH source_members AS (
        SELECT
          gm.id,
          lower(regexp_replace(gm.nickname, '\\s+', '', 'g')) AS normalized_nickname,
          lower(u.email::text) AS email,
          g.game_id,
          g.server_id,
          COALESCE(
            ARRAY(
              SELECT DISTINCT roles.code::text
              FROM guild_member_roles gmr
              JOIN roles ON roles.id = gmr.role_id
              WHERE gmr.guild_member_id = gm.id
            ),
            ARRAY[]::text[]
          ) AS role_codes
        FROM guild_members gm
        JOIN guilds g ON g.id = gm.guild_id
        LEFT JOIN users u ON u.id = gm.user_id
        WHERE gm.guild_id = $2
          AND gm.status <> 'banned'
      ),
      target_members AS (
        SELECT
          gm.id,
          lower(regexp_replace(gm.nickname, '\\s+', '', 'g')) AS normalized_nickname,
          lower(u.email::text) AS email,
          g.game_id,
          g.server_id,
          COALESCE(
            ARRAY(
              SELECT DISTINCT roles.code::text
              FROM guild_member_roles gmr
              JOIN roles ON roles.id = gmr.role_id
              WHERE gmr.guild_member_id = gm.id
            ),
            ARRAY[]::text[]
          ) AS role_codes
        FROM guild_members gm
        JOIN guilds g ON g.id = gm.guild_id
        LEFT JOIN users u ON u.id = gm.user_id
        WHERE gm.guild_id = $3
          AND gm.status <> 'banned'
      ),
      candidates AS (
        SELECT
          source_members.id AS source_member_id,
          target_members.id AS target_member_id,
          (source_members.email IS NOT NULL AND source_members.email = target_members.email) AS email_match,
          (source_members.normalized_nickname = target_members.normalized_nickname) AS nickname_match,
          (source_members.game_id = target_members.game_id) AS game_match,
          (
            source_members.server_id IS NOT NULL
            AND source_members.server_id = target_members.server_id
          ) AS server_match,
          (source_members.role_codes && target_members.role_codes) AS role_match
        FROM source_members
        CROSS JOIN target_members
      ),
      scored AS (
        SELECT
          source_member_id,
          target_member_id,
          LEAST(
            0.99,
            (CASE WHEN email_match THEN 0.55 ELSE 0 END)
            + (CASE WHEN nickname_match THEN 0.25 ELSE 0 END)
            + (CASE WHEN game_match THEN 0.07 ELSE 0 END)
            + (CASE WHEN server_match THEN 0.07 ELSE 0 END)
            + (CASE WHEN role_match THEN 0.06 ELSE 0 END)
          )::numeric(5, 4) AS confidence,
          array_remove(
            ARRAY[
              CASE WHEN email_match THEN 'email' END,
              CASE WHEN nickname_match THEN 'pseudo' END,
              CASE WHEN game_match THEN 'jeu' END,
              CASE WHEN server_match THEN 'serveur' END,
              CASE WHEN role_match THEN 'role' END
            ],
            NULL
          ) AS reasons,
          email_match,
          nickname_match,
          game_match,
          server_match,
          role_match
        FROM candidates
      )
      INSERT INTO guild_merge_duplicates (
        merge_request_id,
        source_member_id,
        target_member_id,
        duplicate_type,
        confidence,
        reasons
      )
      SELECT
        $1,
        source_member_id,
        target_member_id,
        'member',
        confidence,
        to_jsonb(reasons)
      FROM scored
      WHERE
        email_match
        OR nickname_match
        OR (game_match AND server_match AND role_match)
      ON CONFLICT (merge_request_id, source_member_id, target_member_id, duplicate_type)
      WHERE source_member_id IS NOT NULL
        AND target_member_id IS NOT NULL
      DO UPDATE SET
        confidence = EXCLUDED.confidence,
        reasons = EXCLUDED.reasons
      RETURNING id::text
    `,
    [mergeRequestId, sourceGuildId, targetGuildId]
  );

  return result.rowCount ?? 0;
}

async function markMergeRequestScanned(db: Queryable, mergeRequestId: string, duplicateCount: number): Promise<void> {
  await db.query(
    `
      UPDATE guild_merge_requests
      SET
        status = 'review',
        strategy_json = strategy_json || jsonb_build_object(
          'duplicateCount', $2::int,
          'lastScanAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        ),
        updated_at = now()
      WHERE id = $1
    `,
    [mergeRequestId, duplicateCount]
  );
}

function mapMergeRequest(row: MergeRequestRow) {
  return {
    id: row.id,
    status: row.status,
    sourceGuild: {
      id: row.source_guild_id,
      name: row.source_guild_name
    },
    targetGuild: {
      id: row.target_guild_id,
      name: row.target_guild_name
    },
    requestedBy: {
      id: row.requested_by,
      name: row.requested_by_name
    },
    strategy: row.strategy_json ?? {},
    duplicateCount: Number(row.duplicate_count ?? 0),
    pendingCount: Number(row.pending_count ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at
  };
}

function mapMergeDuplicate(row: MergeDuplicateRow) {
  return {
    id: row.id,
    mergeRequestId: row.merge_request_id,
    duplicateType: row.duplicate_type,
    confidence: Number(row.confidence ?? 0),
    reasons: Array.isArray(row.reasons) ? row.reasons.map(String) : [],
    decision: row.decision,
    decidedAt: row.decided_at,
    decidedByName: row.decided_by_name,
    sourceMember: mapDuplicateMember({
      id: row.source_member_id,
      nickname: row.source_nickname,
      email: row.source_email,
      displayName: row.source_display_name,
      powerScore: row.source_power_score,
      status: row.source_status,
      guildId: row.source_guild_id,
      guildName: row.source_guild_name,
      game: row.source_game,
      server: row.source_server,
      roleCodes: row.source_role_codes
    }),
    targetMember: mapDuplicateMember({
      id: row.target_member_id,
      nickname: row.target_nickname,
      email: row.target_email,
      displayName: row.target_display_name,
      powerScore: row.target_power_score,
      status: row.target_status,
      guildId: row.target_guild_id,
      guildName: row.target_guild_name,
      game: row.target_game,
      server: row.target_server,
      roleCodes: row.target_role_codes
    })
  };
}

function mapDuplicateMember(input: {
  id: string | null;
  nickname: string | null;
  email: string | null;
  displayName: string | null;
  powerScore: string | null;
  status: string | null;
  guildId: string | null;
  guildName: string | null;
  game: string | null;
  server: string | null;
  roleCodes: string[] | null;
}) {
  return {
    id: input.id,
    nickname: input.nickname,
    name: input.nickname ?? input.displayName ?? "Membre",
    email: input.email,
    displayName: input.displayName,
    powerScore: input.powerScore,
    status: input.status,
    guildId: input.guildId,
    guildName: input.guildName,
    game: input.game,
    server: input.server,
    roleCodes: input.roleCodes ?? []
  };
}

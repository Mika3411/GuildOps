import type { Queryable } from "../db/pool.js";
import { ForbiddenError, NotFoundError } from "../http/errors.js";

type OrganizationAccessRow = {
  organization_id: string;
  organization_role: string;
};

type GuildAccessRow = {
  guild_id: string;
  organization_id: string;
  organization_role: string;
  member_id: string | null;
};

export async function assertOrganizationAccess(
  db: Queryable,
  organizationId: string,
  userId: string,
  allowedRoles: string[] = ["owner", "admin", "member"]
): Promise<OrganizationAccessRow> {
  const result = await db.query<OrganizationAccessRow>(
    `
      SELECT organization_id::text, organization_role
      FROM organization_members
      WHERE organization_id = $1
        AND user_id = $2
      LIMIT 1
    `,
    [organizationId, userId]
  );

  const row = result.rows[0];

  if (!row) {
    throw new NotFoundError("Organization not found");
  }

  if (!allowedRoles.includes(row.organization_role)) {
    throw new ForbiddenError("Insufficient organization role");
  }

  return row;
}

export async function assertGuildAccess(
  db: Queryable,
  guildId: string,
  userId: string,
  allowedRoles: string[] = ["owner", "admin", "member"]
): Promise<GuildAccessRow> {
  const result = await db.query<GuildAccessRow>(
    `
      SELECT
        g.id::text AS guild_id,
        g.organization_id::text AS organization_id,
        om.organization_role,
        gm.id::text AS member_id
      FROM guilds g
      JOIN organization_members om ON om.organization_id = g.organization_id
      LEFT JOIN guild_members gm
        ON gm.guild_id = g.id
       AND gm.user_id = om.user_id
       AND gm.status <> 'banned'
      WHERE g.id = $1
        AND om.user_id = $2
        AND g.deleted_at IS NULL
      LIMIT 1
    `,
    [guildId, userId]
  );

  const row = result.rows[0];

  if (!row) {
    throw new NotFoundError("Guild not found");
  }

  if (!allowedRoles.includes(row.organization_role)) {
    throw new ForbiddenError("Insufficient guild role");
  }

  if (row.organization_role === "member" && !row.member_id) {
    throw new ForbiddenError("Guild membership is required");
  }

  return row;
}

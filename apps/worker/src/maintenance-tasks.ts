import type { PoolClient } from "pg";
import { env } from "./env.js";
import { cacheJson, rememberNotification } from "./kv.js";
import { withClient } from "./db.js";
import { resultCount } from "./sql-result.js";

type QueryClient = Pick<PoolClient, "query">;

type ExpiredNapRow = {
  id: string;
  guild_id: string;
  title: string;
  ends_at: string;
  relation_name: string | null;
};

export async function expireNapAgreements(): Promise<{ expired: number }> {
  return withClient(expireNapAgreementsWithClient);
}

export async function expireNapAgreementsWithClient(client: QueryClient): Promise<{ expired: number }> {
  await client.query("BEGIN");

  try {
    const result = await client.query<ExpiredNapRow>(
      `
          WITH expired AS (
            UPDATE nap_agreements
            SET status = 'expired'
            WHERE status = 'active'
              AND ends_at IS NOT NULL
              AND ends_at <= now()
            RETURNING
              id,
              guild_id,
              title,
              ends_at,
              diplomacy_entry_id
          )
          SELECT
            expired.id::text,
            expired.guild_id::text,
            expired.title,
            expired.ends_at::text,
            de.name AS relation_name
          FROM expired
          LEFT JOIN diplomacy_entries de ON de.id = expired.diplomacy_entry_id
        `
    );

    for (const agreement of result.rows) {
      await recordNapExpiration(client, agreement);
    }

    await client.query("COMMIT");
    const expired = resultCount(result);
    await cacheJson("guildops:worker:last-nap-expiration", {
      expired,
      finishedAt: new Date().toISOString()
    });

    return { expired };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function cleanupSessions(): Promise<{ revoked: number; deleted: number }> {
  return withClient(cleanupSessionsWithClient);
}

export async function cleanupSessionsWithClient(client: QueryClient): Promise<{ revoked: number; deleted: number }> {
  await client.query("BEGIN");

  try {
    const revoked = await client.query(
      `
          UPDATE user_sessions
          SET revoked_at = expires_at
          WHERE expires_at < now()
            AND revoked_at IS NULL
        `
    );

    const deleted = await client.query(
      `
          DELETE FROM user_sessions
          WHERE COALESCE(revoked_at, expires_at) < now() - ($1::int * interval '1 day')
        `,
      [env.SESSION_RETENTION_DAYS]
    );

    await client.query("COMMIT");
    const stats = {
      revoked: resultCount(revoked),
      deleted: resultCount(deleted),
      retentionDays: env.SESSION_RETENTION_DAYS,
      finishedAt: new Date().toISOString()
    };
    await cacheJson("guildops:worker:last-session-cleanup", stats);

    return { revoked: stats.revoked, deleted: stats.deleted };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function recordNapExpiration(client: QueryClient, agreement: ExpiredNapRow) {
  const metadata = {
    agreementId: agreement.id,
    relationName: agreement.relation_name,
    endsAt: agreement.ends_at
  };

  const alert = await client.query<{ id: string }>(
    `
      INSERT INTO alerts (
        guild_id,
        alert_type,
        severity,
        title,
        message,
        metadata
      )
      VALUES ($1, 'system', 'medium', $2, $3, $4)
      RETURNING id::text
    `,
    [
      agreement.guild_id,
      `NAP expire: ${agreement.title}`,
      `L'accord NAP "${agreement.title}"${agreement.relation_name ? ` avec ${agreement.relation_name}` : ""} est arrive a expiration.`,
      { kind: "nap_expired", ...metadata }
    ]
  );

  await client.query(
    `
      INSERT INTO audit_logs (guild_id, action, target_table, target_id, metadata)
      VALUES ($1, 'worker.nap.expired', 'nap_agreements', $2, $3)
    `,
    [agreement.guild_id, agreement.id, { ...metadata, alertId: alert.rows[0]?.id ?? null }]
  );

  await rememberNotification("diplomacy.nap.expired", {
    guildId: agreement.guild_id,
    ...metadata,
    alertId: alert.rows[0]?.id ?? null
  });
}

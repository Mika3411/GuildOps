import type { PoolClient } from "pg";
import { env } from "./env.js";
import { withClient } from "./db.js";
import { rememberNotification } from "./kv.js";

type SosReminderJob = {
  id: string;
  alert_id: string;
  guild_id: string;
  organization_id: string;
  guild_member_id: string;
  user_id: string | null;
  attempts: number;
  alert_status: string;
  expires_at: string | null;
  severity: string;
  target_label: string | null;
  target_x: number | null;
  target_y: number | null;
  attack_type: string;
  message: string;
  member_name: string;
  already_acknowledged: boolean;
};

export async function processDueSosReminderJobs(): Promise<number> {
  return withClient(async (client) => {
    await client.query("BEGIN");

    try {
      const jobs = await claimDueJobs(client);

      for (const job of jobs) {
        if (job.alert_status !== "active" || isExpired(job.expires_at) || job.already_acknowledged) {
          if (job.alert_status === "active" && isExpired(job.expires_at)) {
            await client.query("UPDATE alerts SET status = 'expired' WHERE id = $1 AND status = 'active'", [job.alert_id]);
          }
          await skipJob(client, job.id);
          continue;
        }

        await deliverReminder(client, job);
        await markJobSent(client, job.id);
      }

      await client.query("COMMIT");
      return jobs.length;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

async function claimDueJobs(client: PoolClient): Promise<SosReminderJob[]> {
  const result = await client.query<SosReminderJob>(
    `
      SELECT
        arj.id::text,
        arj.alert_id::text,
        arj.guild_id::text,
        g.organization_id::text,
        arj.guild_member_id::text,
        recipient.user_id::text,
        arj.attempts,
        a.status AS alert_status,
        a.expires_at::text,
        a.severity,
        a.target_label,
        a.target_x,
        a.target_y,
        COALESCE(a.metadata ->> 'attackType', a.title) AS attack_type,
        a.message,
        recipient.nickname AS member_name,
        (aa.alert_id IS NOT NULL) AS already_acknowledged
      FROM alert_reminder_jobs arj
      JOIN alerts a ON a.id = arj.alert_id
      JOIN guilds g ON g.id = arj.guild_id
      JOIN guild_members recipient ON recipient.id = arj.guild_member_id
      LEFT JOIN alert_acknowledgements aa
        ON aa.alert_id = arj.alert_id
       AND aa.guild_member_id = arj.guild_member_id
      WHERE arj.status = 'queued'
        AND arj.scheduled_at <= now()
      ORDER BY arj.scheduled_at ASC
      LIMIT $1
      FOR UPDATE OF arj SKIP LOCKED
    `,
    [env.SOS_REMINDER_BATCH_SIZE]
  );

  return result.rows;
}

async function deliverReminder(client: PoolClient, job: SosReminderJob): Promise<void> {
  const payload = {
    alertId: job.alert_id,
    guildId: job.guild_id,
    memberId: job.guild_member_id,
    userId: job.user_id,
    memberName: job.member_name,
    severity: job.severity,
    target: {
      label: job.target_label,
      x: job.target_x,
      y: job.target_y
    },
    attackType: job.attack_type,
    message: job.message
  };

  console.log(
    JSON.stringify({
      event: "sos.reminder.ready",
      ...payload
    })
  );

  if (job.user_id) {
    await client.query(
      `
        INSERT INTO private_messages (
          organization_id,
          guild_id,
          sender_user_id,
          recipient_user_id,
          body,
          source_language,
          metadata
        )
        VALUES ($1, $2, NULL, $3, $4, 'fr', $5)
      `,
      [
        job.organization_id,
        job.guild_id,
        job.user_id,
        `SOS ${job.attack_type} sur ${job.target_label ?? "cible inconnue"}${formatCoordinates(job)}. Merci de repondre: vu, en route ou impossible.`,
        {
          kind: "sos_reminder",
          alertId: job.alert_id,
          guildMemberId: job.guild_member_id,
          attackType: job.attack_type,
          severity: job.severity
        }
      ]
    );
  }

  await rememberNotification("sos.reminder", payload);
}

async function markJobSent(client: PoolClient, jobId: string): Promise<void> {
  await client.query(
    `
      UPDATE alert_reminder_jobs
      SET status = 'sent',
          sent_at = now(),
          attempts = attempts + 1,
          last_error = NULL
      WHERE id = $1
    `,
    [jobId]
  );
}

async function skipJob(client: PoolClient, jobId: string): Promise<void> {
  await client.query(
    `
      UPDATE alert_reminder_jobs
      SET status = 'skipped',
          last_error = NULL
      WHERE id = $1
    `,
    [jobId]
  );
}

function isExpired(value: string | null): boolean {
  if (!value) return false;
  const expiresAt = new Date(value).getTime();
  return !Number.isNaN(expiresAt) && expiresAt <= Date.now();
}

function formatCoordinates(job: Pick<SosReminderJob, "target_x" | "target_y">): string {
  if (job.target_x === null || job.target_y === null) return "";
  return ` (${job.target_x}:${job.target_y})`;
}

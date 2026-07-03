import type { PoolClient } from "pg";
import { env } from "./env.js";
import { cacheJson, rememberNotification } from "./kv.js";
import { withClient } from "./db.js";
import { resultCount } from "./sql-result.js";

type QueryClient = Pick<PoolClient, "query">;

type EventReminderRow = {
  event_id: string;
  guild_id: string;
  server_id: string | null;
  title: string;
  event_type: string;
  starts_at: string;
  location_label: string | null;
  location_x: number | null;
  location_y: number | null;
  window_key: string;
  severity: "low" | "medium" | "high" | "critical";
};

type PresenceReminderRow = EventReminderRow & {
  organization_id: string;
  guild_member_id: string;
  user_id: string;
  nickname: string;
};

export async function runEventReminderSweep(): Promise<{ remindersCreated: number }> {
  return withClient(runEventReminderSweepWithClient);
}

export async function runEventReminderSweepWithClient(client: QueryClient): Promise<{ remindersCreated: number }> {
  await client.query("BEGIN");

  try {
    const result = await client.query<EventReminderRow>(
      `
          WITH reminder_windows(window_key, lead_time, severity) AS (
            VALUES
              ('24h', interval '24 hours', 'medium'),
              ('1h', interval '1 hour', 'high'),
              ('15m', interval '15 minutes', 'critical')
          ),
          due AS (
            SELECT DISTINCT ON (e.id)
              e.id::text AS event_id,
              e.guild_id::text AS guild_id,
              e.server_id::text AS server_id,
              e.title,
              e.event_type,
              e.starts_at::text,
              e.location_label,
              e.location_x,
              e.location_y,
              rw.window_key,
              rw.severity::text AS severity
            FROM events e
            JOIN reminder_windows rw ON e.starts_at <= now() + rw.lead_time
            WHERE e.cancelled_at IS NULL
              AND e.starts_at >= now()
              AND e.starts_at <= now() + ($1::int * interval '1 minute')
              AND NOT EXISTS (
                SELECT 1
                FROM audit_logs al
                WHERE al.action = 'worker.event.reminder'
                  AND al.target_table = 'events'
                  AND al.target_id = e.id
                  AND al.metadata ->> 'window' = rw.window_key
              )
            ORDER BY e.id, rw.lead_time ASC
          )
          SELECT *
          FROM due
          ORDER BY starts_at ASC
          LIMIT 100
        `,
      [env.EVENT_REMINDER_LOOKAHEAD_MINUTES]
    );

    for (const reminder of result.rows) {
      await createEventReminder(client, reminder);
    }

    await client.query("COMMIT");
    const remindersCreated = resultCount(result);
    await cacheJson("guildops:worker:last-event-reminders", {
      remindersCreated,
      finishedAt: new Date().toISOString()
    });

    return { remindersCreated };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function runPresenceFollowupSweep(): Promise<{ followupsCreated: number }> {
  return withClient(runPresenceFollowupSweepWithClient);
}

export async function runPresenceFollowupSweepWithClient(client: QueryClient): Promise<{ followupsCreated: number }> {
  await client.query("BEGIN");

  try {
    const result = await client.query<PresenceReminderRow>(
      `
          WITH reminder_windows(window_key, lead_time, severity) AS (
            VALUES
              ('2h', interval '2 hours', 'medium'),
              ('30m', interval '30 minutes', 'high')
          ),
          due AS (
            SELECT DISTINCT ON (e.id, gm.id)
              e.id::text AS event_id,
              e.guild_id::text AS guild_id,
              g.organization_id::text AS organization_id,
              e.server_id::text AS server_id,
              e.title,
              e.event_type,
              e.starts_at::text,
              e.location_label,
              e.location_x,
              e.location_y,
              rw.window_key,
              rw.severity::text AS severity,
              gm.id::text AS guild_member_id,
              gm.user_id::text AS user_id,
              gm.nickname
            FROM events e
            JOIN guilds g ON g.id = e.guild_id
            JOIN guild_members gm ON gm.guild_id = e.guild_id
            JOIN reminder_windows rw ON e.starts_at <= now() + rw.lead_time
            LEFT JOIN event_attendance ea
              ON ea.event_id = e.id
             AND ea.guild_member_id = gm.id
            WHERE e.cancelled_at IS NULL
              AND e.starts_at >= now()
              AND e.starts_at <= now() + ($1::int * interval '1 minute')
              AND gm.status = 'active'
              AND gm.user_id IS NOT NULL
              AND COALESCE(ea.status, 'pending') = 'pending'
              AND NOT EXISTS (
                SELECT 1
                FROM audit_logs al
                WHERE al.action = 'worker.presence.followup'
                  AND al.target_table = 'events'
                  AND al.target_id = e.id
                  AND al.metadata ->> 'memberId' = gm.id::text
                  AND al.metadata ->> 'window' = rw.window_key
              )
            ORDER BY e.id, gm.id, rw.lead_time ASC
          )
          SELECT *
          FROM due
          ORDER BY starts_at ASC, nickname ASC
          LIMIT 200
        `,
      [env.PRESENCE_REMINDER_LOOKAHEAD_MINUTES]
    );

    for (const followup of result.rows) {
      await createPresenceFollowup(client, followup);
    }

    await client.query("COMMIT");
    const followupsCreated = resultCount(result);
    await cacheJson("guildops:worker:last-presence-followups", {
      followupsCreated,
      finishedAt: new Date().toISOString()
    });

    return { followupsCreated };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function createEventReminder(client: QueryClient, reminder: EventReminderRow) {
  const title = `Rappel event ${reminder.window_key}: ${reminder.title}`;
  const message = `Event ${reminder.event_type} "${reminder.title}" a ${formatEventTime(reminder.starts_at)}. Confirme ta presence et verifie les consignes.`;
  const metadata = {
    kind: "event_reminder",
    eventId: reminder.event_id,
    eventType: reminder.event_type,
    startsAt: reminder.starts_at,
    window: reminder.window_key
  };

  const alert = await client.query<{ id: string }>(
    `
      INSERT INTO alerts (
        guild_id,
        server_id,
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
      VALUES ($1, $2, 'event', $3, $4, $5, $6, $7, $8, $9, $10::timestamptz)
      RETURNING id::text
    `,
    [
      reminder.guild_id,
      reminder.server_id,
      reminder.severity,
      title,
      message,
      reminder.location_label,
      reminder.location_x,
      reminder.location_y,
      metadata,
      reminder.starts_at
    ]
  );

  await client.query(
    `
      INSERT INTO audit_logs (guild_id, action, target_table, target_id, metadata)
      VALUES ($1, 'worker.event.reminder', 'events', $2, $3)
    `,
    [reminder.guild_id, reminder.event_id, { ...metadata, alertId: alert.rows[0]?.id ?? null }]
  );

  await rememberNotification("event.reminder", { ...metadata, guildId: reminder.guild_id, alertId: alert.rows[0]?.id ?? null });
}

async function createPresenceFollowup(client: QueryClient, followup: PresenceReminderRow) {
  const body = `Salut ${followup.nickname}, l'event "${followup.title}" approche (${formatEventTime(followup.starts_at)}). Peux-tu confirmer ta presence ?`;
  const metadata = {
    kind: "presence_followup",
    eventId: followup.event_id,
    eventType: followup.event_type,
    startsAt: followup.starts_at,
    window: followup.window_key,
    channel: "events",
    guildMemberId: followup.guild_member_id
  };

  const message = await client.query<{ id: string }>(
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
      RETURNING id::text
    `,
    [followup.organization_id, followup.guild_id, followup.user_id, body, metadata]
  );

  await client.query(
    `
      INSERT INTO audit_logs (guild_id, actor_member_id, action, target_table, target_id, metadata)
      VALUES ($1, $2, 'worker.presence.followup', 'events', $3, $4)
    `,
    [
      followup.guild_id,
      followup.guild_member_id,
      followup.event_id,
      { ...metadata, memberId: followup.guild_member_id, messageId: message.rows[0]?.id ?? null }
    ]
  );

  await rememberNotification("presence.followup", {
    ...metadata,
    guildId: followup.guild_id,
    userId: followup.user_id,
    messageId: message.rows[0]?.id ?? null
  });
}

function formatEventTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "bientot";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "UTC"
  }).format(date);
}

import type { PoolClient } from "pg";
import webpush, { type PushSubscription } from "web-push";
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

type NotificationRow = {
  id: string;
  guild_id: string;
  user_id: string;
  actor_user_id: string | null;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

type GuildNotification = {
  id: string;
  guildId: string;
  userId: string;
  actorUserId: string | null;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
};

type PushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
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
  const notifications: GuildNotification[] = [];

  try {
    const result = await client.query<EventReminderRow>(
      `
          WITH due AS (
            SELECT
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
            CROSS JOIN LATERAL (
              SELECT
                offset_minutes,
                CASE offset_minutes
                  WHEN 1440 THEN '24h'
                  WHEN 60 THEN '1h'
                  WHEN 15 THEN '15m'
                  ELSE offset_minutes::text || 'm'
                END AS window_key,
                (offset_minutes::text || ' minutes')::interval AS lead_time,
                CASE offset_minutes
                  WHEN 1440 THEN 'medium'
                  WHEN 60 THEN 'high'
                  ELSE 'critical'
                END AS severity
              FROM unnest(e.reminder_offsets_minutes) AS reminder_offsets(offset_minutes)
              WHERE offset_minutes IN (1440, 60, 15)
            ) rw
            WHERE e.cancelled_at IS NULL
              AND e.starts_at >= now()
              AND e.starts_at <= now() + ($1::int * interval '1 minute')
              AND e.starts_at - rw.lead_time <= now()
              AND e.starts_at - rw.lead_time >= e.created_at
              AND NOT EXISTS (
                SELECT 1
                FROM audit_logs al
                WHERE al.action = 'worker.event.reminder'
                  AND al.target_table = 'events'
                  AND al.target_id = e.id
                  AND al.metadata ->> 'window' = rw.window_key
              )
          )
          SELECT *
          FROM due
          ORDER BY starts_at ASC, window_key ASC
          LIMIT 100
        `,
      [env.EVENT_REMINDER_LOOKAHEAD_MINUTES]
    );

    for (const reminder of result.rows) {
      notifications.push(...(await createEventReminder(client, reminder)));
    }

    await client.query("COMMIT");
    await deliverPushNotifications(client, notifications);

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

async function createEventReminder(client: QueryClient, reminder: EventReminderRow): Promise<GuildNotification[]> {
  const title = `Rappel évènement ${reminder.window_key}: ${reminder.title}`;
  const message = `L'évènement ${reminder.event_type} "${reminder.title}" commence ${formatEventTime(reminder.starts_at)}. Confirme ta présence et vérifie les consignes.`;
  const metadata = {
    kind: "event_reminder",
    eventId: reminder.event_id,
    eventType: reminder.event_type,
    startsAt: reminder.starts_at,
    window: reminder.window_key,
    url: "/app/wars"
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

  const alertId = alert.rows[0]?.id ?? null;
  await client.query(
    `
      INSERT INTO audit_logs (guild_id, action, target_table, target_id, metadata)
      VALUES ($1, 'worker.event.reminder', 'events', $2, $3)
    `,
    [reminder.guild_id, reminder.event_id, { ...metadata, alertId }]
  );

  const notifications = await createEventReminderNotifications(client, reminder.guild_id, title, message, {
    ...metadata,
    alertId
  });

  await rememberNotification("event.reminder", { ...metadata, guildId: reminder.guild_id, alertId });
  return notifications;
}

async function createEventReminderNotifications(
  client: QueryClient,
  guildId: string,
  title: string,
  body: string,
  data: Record<string, unknown>
): Promise<GuildNotification[]> {
  const result = await client.query<NotificationRow>(
    `
      WITH recipients AS (
        SELECT DISTINCT gm.user_id
        FROM guild_members gm
        WHERE gm.guild_id = $1
          AND gm.status = 'active'
          AND gm.user_id IS NOT NULL
      )
      INSERT INTO notifications (guild_id, user_id, actor_user_id, type, title, body, data)
      SELECT $1, recipients.user_id, NULL, 'event_reminder', $2, $3, $4::jsonb
      FROM recipients
      RETURNING
        id::text,
        guild_id::text,
        user_id::text,
        actor_user_id::text,
        type,
        title,
        body,
        data,
        read_at::text,
        created_at::text
    `,
    [guildId, title, body, JSON.stringify(data)]
  );

  return result.rows.map(formatNotificationRow);
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

let webPushConfigured = false;

function configureWebPush(): boolean {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return false;
  if (webPushConfigured) return true;

  webpush.setVapidDetails(env.VAPID_SUBJECT || env.APP_PUBLIC_URL || "mailto:admin@guildops.app", env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  webPushConfigured = true;
  return true;
}

async function deliverPushNotifications(client: QueryClient, notifications: GuildNotification[]): Promise<void> {
  if (!notifications.length || !configureWebPush()) return;

  const userIds = [...new Set(notifications.map((notification) => notification.userId))];
  const subscriptions = await client.query<PushSubscriptionRow>(
    `
      SELECT
        id::text,
        user_id::text,
        endpoint,
        p256dh,
        auth
      FROM push_subscriptions
      WHERE revoked_at IS NULL
        AND user_id::text = ANY($1::text[])
    `,
    [userIds]
  );
  const notificationsByUser = new Map<string, GuildNotification[]>();

  for (const notification of notifications) {
    const current = notificationsByUser.get(notification.userId) || [];
    current.push(notification);
    notificationsByUser.set(notification.userId, current);
  }

  await Promise.allSettled(
    subscriptions.rows.flatMap((subscription) =>
      (notificationsByUser.get(subscription.user_id) || []).map(async (notification) => {
        try {
          await webpush.sendNotification(toPushSubscription(subscription), JSON.stringify(toPushPayload(notification)));
        } catch (error) {
          const statusCode = getPushErrorStatus(error);
          if (statusCode === 404 || statusCode === 410) {
            await client.query("UPDATE push_subscriptions SET revoked_at = now(), updated_at = now() WHERE id = $1", [subscription.id]);
            return;
          }

          console.warn("Worker push notification delivery failed", {
            subscriptionId: subscription.id,
            statusCode,
            message: error instanceof Error ? error.message : String(error)
          });
        }
      })
    )
  );
}

function formatNotificationRow(row: NotificationRow): GuildNotification {
  return {
    id: row.id,
    guildId: row.guild_id,
    userId: row.user_id,
    actorUserId: row.actor_user_id,
    type: row.type,
    title: row.title,
    body: row.body,
    data: row.data || {},
    readAt: row.read_at,
    createdAt: row.created_at
  };
}

function toPushSubscription(row: PushSubscriptionRow): PushSubscription {
  return {
    endpoint: row.endpoint,
    keys: {
      p256dh: row.p256dh,
      auth: row.auth
    }
  };
}

function toPushPayload(notification: GuildNotification): Record<string, unknown> {
  return {
    notificationId: notification.id,
    title: notification.title,
    body: notification.body,
    type: notification.type,
    url: typeof notification.data.url === "string" ? notification.data.url : "/app",
    createdAt: notification.createdAt
  };
}

function getPushErrorStatus(error: unknown): number {
  if (typeof error === "object" && error && "statusCode" in error) {
    return Number((error as { statusCode?: unknown }).statusCode) || 0;
  }

  return 0;
}

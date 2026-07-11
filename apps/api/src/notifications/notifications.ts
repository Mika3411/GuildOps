import webpush, { type PushSubscription } from "web-push";
import { env } from "../config/env.js";
import { query, type Queryable } from "../db/pool.js";

export type NotificationRow = {
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

type PushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type GuildNotificationInput = {
  guildId: string;
  actorUserId?: string | null;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

export type GuildNotificationPermissionInput = GuildNotificationInput & {
  permissionKeys: string[];
};

export type GuildNotificationUsersInput = GuildNotificationInput & {
  userIds: string[];
};

export type GuildNotification = {
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

let webPushConfigured = false;

export function getPushPublicConfig(): { configured: boolean; publicKey: string | null } {
  return {
    configured: isWebPushConfigured(),
    publicKey: env.VAPID_PUBLIC_KEY ?? null
  };
}

export function isWebPushConfigured(): boolean {
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
}

export function configureWebPush(): boolean {
  if (!isWebPushConfigured()) return false;
  if (webPushConfigured) return true;

  webpush.setVapidDetails(env.VAPID_SUBJECT || env.APP_PUBLIC_URL, env.VAPID_PUBLIC_KEY as string, env.VAPID_PRIVATE_KEY as string);
  webPushConfigured = true;
  return true;
}

export async function createGuildNotificationsForMembers(
  db: Queryable,
  input: GuildNotificationInput
): Promise<GuildNotification[]> {
  const result = await db.query<NotificationRow>(
    `
      WITH recipients AS (
        SELECT DISTINCT gm.user_id
        FROM guild_members gm
        WHERE gm.guild_id = $1
          AND gm.status = 'active'
          AND gm.user_id IS NOT NULL
          AND ($2::uuid IS NULL OR gm.user_id <> $2::uuid)
      )
      INSERT INTO notifications (guild_id, user_id, actor_user_id, type, title, body, data)
      SELECT $1, recipients.user_id, $2, $3, $4, $5, $6::jsonb
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
    [
      input.guildId,
      input.actorUserId ?? null,
      input.type,
      input.title,
      input.body,
      JSON.stringify(input.data || {})
    ]
  );

  return result.rows.map(formatNotificationRow);
}

export async function createGuildNotificationsForPermission(
  db: Queryable,
  input: GuildNotificationPermissionInput
): Promise<GuildNotification[]> {
  if (!input.permissionKeys.length) return [];

  const result = await db.query<NotificationRow>(
    `
      WITH guild_context AS (
        SELECT organization_id
        FROM guilds
        WHERE id = $1
          AND deleted_at IS NULL
        LIMIT 1
      ),
      permission_recipients AS (
        SELECT DISTINCT gm.user_id
        FROM guild_members gm
        JOIN guild_member_roles gmr ON gmr.guild_member_id = gm.id
        JOIN role_permissions rp ON rp.role_id = gmr.role_id
        JOIN permissions p ON p.id = rp.permission_id
        WHERE gm.guild_id = $1
          AND gm.status = 'active'
          AND gm.user_id IS NOT NULL
          AND p.key::text = ANY($7::text[])
      ),
      organization_recipients AS (
        SELECT om.user_id
        FROM guild_context gc
        JOIN organization_members om ON om.organization_id = gc.organization_id
        WHERE om.organization_role IN ('owner', 'admin')
      ),
      recipients AS (
        SELECT DISTINCT user_id
        FROM (
          SELECT user_id FROM permission_recipients
          UNION ALL
          SELECT user_id FROM organization_recipients
        ) all_recipients
        WHERE user_id IS NOT NULL
          AND ($2::uuid IS NULL OR user_id <> $2::uuid)
      )
      INSERT INTO notifications (guild_id, user_id, actor_user_id, type, title, body, data)
      SELECT $1, recipients.user_id, $2, $3, $4, $5, $6::jsonb
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
    [
      input.guildId,
      input.actorUserId ?? null,
      input.type,
      input.title,
      input.body,
      JSON.stringify(input.data || {}),
      input.permissionKeys
    ]
  );

  return result.rows.map(formatNotificationRow);
}

export async function createGuildNotificationsForUsers(
  db: Queryable,
  input: GuildNotificationUsersInput
): Promise<GuildNotification[]> {
  const userIds = [...new Set(input.userIds.filter(Boolean))];
  if (!userIds.length) return [];

  const result = await db.query<NotificationRow>(
    `
      WITH recipients AS (
        SELECT DISTINCT gm.user_id
        FROM guild_members gm
        WHERE gm.guild_id = $1
          AND gm.status = 'active'
          AND gm.user_id = ANY($7::uuid[])
          AND ($2::uuid IS NULL OR gm.user_id <> $2::uuid)
      )
      INSERT INTO notifications (guild_id, user_id, actor_user_id, type, title, body, data)
      SELECT $1, recipients.user_id, $2, $3, $4, $5, $6::jsonb
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
    [
      input.guildId,
      input.actorUserId ?? null,
      input.type,
      input.title,
      input.body,
      JSON.stringify(input.data || {}),
      userIds
    ]
  );

  return result.rows.map(formatNotificationRow);
}

export async function deliverPushNotifications(notifications: GuildNotification[]): Promise<void> {
  if (!notifications.length || !configureWebPush()) return;

  const userIds = [...new Set(notifications.map((notification) => notification.userId))];
  const subscriptions = await query<PushSubscriptionRow>(
    `
      SELECT
        id::text,
        user_id::text,
        endpoint,
        p256dh,
        auth
      FROM push_subscriptions
      WHERE revoked_at IS NULL
        AND user_id = ANY($1::uuid[])
    `,
    [userIds]
  );
  const notificationsByUser = new Map(notifications.map((notification) => [notification.userId, notification]));

  await Promise.allSettled(
    subscriptions.rows.map(async (subscription) => {
      const notification = notificationsByUser.get(subscription.user_id);
      if (!notification) return;

      try {
        await webpush.sendNotification(toPushSubscription(subscription), JSON.stringify(toPushPayload(notification)));
      } catch (error) {
        const statusCode = getPushErrorStatus(error);
        if (statusCode === 404 || statusCode === 410) {
          await revokePushSubscription(subscription.id);
          return;
        }

        console.warn("Push notification delivery failed", {
          subscriptionId: subscription.id,
          statusCode,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    })
  );
}

export function formatNotificationRow(row: NotificationRow): GuildNotification {
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

async function revokePushSubscription(subscriptionId: string): Promise<void> {
  await query("UPDATE push_subscriptions SET revoked_at = now(), updated_at = now() WHERE id = $1", [subscriptionId]);
}

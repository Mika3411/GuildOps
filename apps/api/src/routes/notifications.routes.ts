import { Router } from "express";
import { z } from "zod";
import { database, query } from "../db/pool.js";
import { asyncHandler } from "../http/async-handler.js";
import { validate } from "../http/validate.js";
import {
  formatNotificationRow,
  getPushPublicConfig,
  type NotificationRow
} from "../notifications/notifications.js";
import { getAuth, requireAuth } from "../security/auth.js";
import { assertGuildAccess } from "./access.js";
import { uuidSchema } from "./helpers.js";

export const notificationsRouter = Router();

const guildParamsSchema = z.object({
  guildId: uuidSchema
});

const notificationParamsSchema = z.object({
  guildId: uuidSchema,
  notificationId: uuidSchema
});

const listNotificationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(80).default(20)
});

const pushSubscriptionSchema = z
  .object({
    endpoint: z.string().url(),
    expirationTime: z.number().nullable().optional(),
    keys: z.object({
      p256dh: z.string().min(20),
      auth: z.string().min(8)
    })
  })
  .strict();

const removePushSubscriptionSchema = z
  .object({
    endpoint: z.string().url()
  })
  .strict();

notificationsRouter.get(
  "/notifications/push-public-key",
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.json(getPushPublicConfig());
  })
);

notificationsRouter.post(
  "/notifications/push-subscriptions",
  requireAuth,
  validate({ body: pushSubscriptionSchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const body = req.body as z.infer<typeof pushSubscriptionSchema>;
    const userAgent = String(req.get("user-agent") || "").slice(0, 500) || null;

    const result = await query<{ id: string }>(
      `
        INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (endpoint)
        DO UPDATE SET
          user_id = EXCLUDED.user_id,
          p256dh = EXCLUDED.p256dh,
          auth = EXCLUDED.auth,
          user_agent = EXCLUDED.user_agent,
          revoked_at = NULL,
          updated_at = now()
        RETURNING id::text
      `,
      [auth.user.id, body.endpoint, body.keys.p256dh, body.keys.auth, userAgent]
    );

    res.status(201).json({
      ok: true,
      subscriptionId: result.rows[0]?.id || null
    });
  })
);

notificationsRouter.delete(
  "/notifications/push-subscriptions",
  requireAuth,
  validate({ body: removePushSubscriptionSchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const body = req.body as z.infer<typeof removePushSubscriptionSchema>;

    await query(
      `
        UPDATE push_subscriptions
        SET revoked_at = now(),
            updated_at = now()
        WHERE user_id = $1
          AND endpoint = $2
      `,
      [auth.user.id, body.endpoint]
    );

    res.status(204).send();
  })
);

notificationsRouter.get(
  "/guilds/:guildId/notifications",
  requireAuth,
  validate({ params: guildParamsSchema, query: listNotificationsQuerySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId } = req.params as z.infer<typeof guildParamsSchema>;
    const { limit } = req.query as unknown as z.infer<typeof listNotificationsQuerySchema>;

    await assertGuildAccess(database, guildId, auth.user.id);

    const [notificationsResult, unreadResult] = await Promise.all([
      query<NotificationRow>(
        `
          SELECT
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
          FROM notifications
          WHERE guild_id = $1
            AND user_id = $2
          ORDER BY created_at DESC
          LIMIT $3
        `,
        [guildId, auth.user.id, limit]
      ),
      query<{ unread_count: string }>(
        `
          SELECT count(*)::text AS unread_count
          FROM notifications
          WHERE guild_id = $1
            AND user_id = $2
            AND read_at IS NULL
        `,
        [guildId, auth.user.id]
      )
    ]);

    res.json({
      notifications: notificationsResult.rows.map(formatNotificationRow),
      unreadCount: Number(unreadResult.rows[0]?.unread_count || 0)
    });
  })
);

notificationsRouter.patch(
  "/guilds/:guildId/notifications/:notificationId/read",
  requireAuth,
  validate({ params: notificationParamsSchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId, notificationId } = req.params as z.infer<typeof notificationParamsSchema>;

    await assertGuildAccess(database, guildId, auth.user.id);

    const result = await query<NotificationRow>(
      `
        UPDATE notifications
        SET read_at = COALESCE(read_at, now())
        WHERE id = $1
          AND guild_id = $2
          AND user_id = $3
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
      [notificationId, guildId, auth.user.id]
    );

    res.json({
      notification: result.rows[0] ? formatNotificationRow(result.rows[0]) : null
    });
  })
);

notificationsRouter.post(
  "/guilds/:guildId/notifications/read",
  requireAuth,
  validate({ params: guildParamsSchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId } = req.params as z.infer<typeof guildParamsSchema>;

    await assertGuildAccess(database, guildId, auth.user.id);

    await query(
      `
        UPDATE notifications
        SET read_at = COALESCE(read_at, now())
        WHERE guild_id = $1
          AND user_id = $2
          AND read_at IS NULL
      `,
      [guildId, auth.user.id]
    );

    res.json({ ok: true, unreadCount: 0 });
  })
);

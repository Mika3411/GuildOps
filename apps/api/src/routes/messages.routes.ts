import { createHash } from "node:crypto";
import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { database, query, withClient, type Queryable } from "../db/pool.js";
import { asyncHandler } from "../http/async-handler.js";
import { BadRequestError, ForbiddenError, NotFoundError, TooManyRequestsError } from "../http/errors.js";
import { validate } from "../http/validate.js";
import { sendRegistrationInvitationEmail } from "../notifications/email.js";
import {
  createGuildNotificationsForMembers,
  createGuildNotificationsForUsers,
  deliverPushNotifications,
  type GuildNotificationInput
} from "../notifications/notifications.js";
import { getAuth, requireAuth } from "../security/auth.js";
import { formatMessageForLanguage, normalizeLanguage, type MessageRow } from "../translation/messages.js";
import { assertGuildAccess } from "./access.js";
import { slugSchema, uuidSchema } from "./helpers.js";

export const messagesRouter = Router();

const publicSlugParamsSchema = z.object({
  slug: slugSchema
});

const guildParamsSchema = z.object({
  guildId: uuidSchema
});

const messageParamsSchema = z.object({
  guildId: uuidSchema,
  messageId: uuidSchema
});

const publicMessageQuerySchema = z.object({
  targetLanguage: z.string().trim().min(2).max(12).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().trim().min(1).max(80).optional()
});

const publicModerationQuerySchema = publicMessageQuerySchema.extend({
  status: z.enum(["visible", "hidden", "flagged", "deleted", "all"]).default("all")
});

const guildMessagesQuerySchema = publicMessageQuerySchema.extend({
  conversationType: z.enum(["internal", "private"]).default("internal"),
  channel: z.string().trim().min(1).max(80).default("general"),
  participantId: uuidSchema.optional()
});

const publicMessageBodySchema = z
  .object({
    body: z.string().trim().min(1).max(4000),
    guestName: z.string().trim().min(1).max(80).optional(),
    sourceLanguage: z.string().trim().min(2).max(12).default("auto"),
    targetLanguage: z.string().trim().min(2).max(12).optional()
  })
  .strict();

const privateImageAttachmentSchema = z
  .object({
    id: z.string().trim().min(1).max(120).optional(),
    type: z.literal("image").default("image"),
    name: z.string().trim().min(1).max(180).default("Image"),
    mimeType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
    size: z.coerce.number().int().min(1).max(900 * 1024),
    originalSize: z.coerce.number().int().min(1).max(80 * 1024 * 1024).optional(),
    compressed: z.boolean().optional(),
    compressionLabel: z.string().trim().max(80).optional(),
    dataUrl: z
      .string()
      .trim()
      .min(1)
      .max(1_500_000)
      .regex(/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/, "Image data URL expected"),
    alt: z.string().trim().max(180).optional()
  })
  .strict();

const privateMessageBodySchema = z
  .object({
    body: z.string().trim().max(4000).default(""),
    attachments: z.array(privateImageAttachmentSchema).max(1).default([]),
    conversationType: z.enum(["internal", "private"]).default("internal"),
    channel: z.string().trim().min(1).max(80).default("general"),
    recipientUserId: uuidSchema.optional(),
    sourceLanguage: z.string().trim().min(2).max(12).default("auto"),
    targetLanguage: z.string().trim().min(2).max(12).optional()
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.body && value.attachments.length === 0) {
      context.addIssue({
        code: "custom",
        message: "Message body or image attachment is required",
        path: ["body"]
      });
    }
  });

const readConversationBodySchema = z
  .object({
    conversationType: z.enum(["internal", "private"]).default("internal"),
    channel: z.string().trim().min(1).max(80).default("general"),
    participantId: uuidSchema.optional()
  })
  .strict();

const messageInvitationBodySchema = z
  .object({
    email: z.string().email().max(320).transform((value) => value.toLowerCase())
  })
  .strict();

const moderationBodySchema = z
  .object({
    status: z.enum(["visible", "hidden", "flagged", "deleted"]),
    reason: z.string().trim().max(240).optional()
  })
  .strict();

type PublicChatGuild = {
  id: string;
  default_language: string;
};

type PublicChatGuildRow = PublicChatGuild & {
  public_chat_enabled: boolean | null;
  public_chat_module_enabled: boolean | null;
};

type PublicMessageRow = MessageRow & {
  moderation_status: string;
};

type PublicChatRateLimitRow = {
  burst_count: string;
  burst_oldest_created_at: string | null;
  sustained_count: string;
  sustained_oldest_created_at: string | null;
};

type PrivateMessageRow = MessageRow & {
  sender_user_id: string | null;
  recipient_user_id: string | null;
  is_read: boolean;
  read_by?: unknown;
};

type MessageRecipientRow = {
  id: string;
  display_name: string;
  email: string;
  nickname: string;
  preferred_language: string;
  role: string | null;
  status: string | null;
};

type MessageInvitationLookupRow = MessageRecipientRow & {
  isGuildMember: boolean;
};

type MessageNotificationBuildInput = {
  author: string;
  channel: string;
  conversationType: "internal" | "private";
  guildId: string;
  hasImageAttachment: boolean;
  messageBody: string;
  messageId: string;
  recipientUserId: string | null;
  senderUserId: string;
};

type SseClient = {
  guildId: string;
  res: Response;
  userId?: string;
};

const publicChatBurstLimit = { limit: 3, windowSeconds: 30, label: "3 messages / 30 s" };
const publicChatSustainedLimit = { limit: 12, windowSeconds: 10 * 60, label: "12 messages / 10 min" };
const suspiciousPhrasePattern =
  /\b(free\s*(gems|gold|rss|resources|diamonds)|cheap\s*(rss|resources|gold)|giveaway|airdrop|hack|cheat|boost\s*account|account\s*boost|scam|phishing)\b/i;
const invitePattern = /\b(discord\.gg|discord(?:app)?\.com\/invite|t\.me\/|telegram\.me\/)\b/i;
const urlPattern = /\bhttps?:\/\/|\bwww\./gi;
const repeatedCharacterPattern = /([^\s])\1{11,}/i;
const repeatedTokenPattern = /\b([a-z0-9]{3,})\b(?:\W+\1\b){4,}/i;
const publicChatClients = new Map<string, Set<SseClient>>();
const guildMessageClients = new Map<string, Set<SseClient>>();

messagesRouter.get(
  "/public/guilds/:slug/chat",
  validate({ params: publicSlugParamsSchema, query: publicMessageQuerySchema }),
  asyncHandler(async (req, res) => {
    const { slug } = req.params as z.infer<typeof publicSlugParamsSchema>;
    const { targetLanguage = "fr", limit, cursor } = req.query as unknown as z.infer<typeof publicMessageQuerySchema>;
    const guild = await findPublicChatGuildBySlug(database, slug);
    const messages = await listPublicMessages(guild.id, {
      cursor: parseCursor(cursor),
      limit,
      status: "visible",
      targetLanguage
    });

    res.json(messages);
  })
);

messagesRouter.post(
  "/public/guilds/:slug/chat/messages",
  validate({ params: publicSlugParamsSchema, body: publicMessageBodySchema }),
  asyncHandler(async (req, res) => {
    const { slug } = req.params as z.infer<typeof publicSlugParamsSchema>;
    const body = req.body as z.infer<typeof publicMessageBodySchema>;
    const guild = await findPublicChatGuildBySlug(database, slug);
    const guestFingerprintHash = getGuestFingerprintHash(req);
    const rateLimit = await checkPublicChatRateLimit(guild.id, guestFingerprintHash);

    if (rateLimit) {
      res.set("Retry-After", String(rateLimit.retryAfterSeconds));
      throw new TooManyRequestsError(`Limite chat public atteinte. Reessaie dans ${rateLimit.retryAfterSeconds} s.`, rateLimit);
    }

    const moderation = moderateMessage(body.body);
    const result = await query<PublicMessageRow>(
      `
        INSERT INTO public_chat_messages (
          guild_id,
          guest_name,
          guest_fingerprint_hash,
          body,
          source_language,
          moderation_status,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING
          id::text,
          body,
          source_language,
          created_at::text,
          guest_name AS author,
          moderation_status,
          metadata
      `,
      [
        guild.id,
        body.guestName ?? "Invite",
        guestFingerprintHash,
        body.body,
        normalizeLanguage(body.sourceLanguage, "auto"),
        moderation.status,
        { source: "public-chat", moderationFlags: moderation.flags }
      ]
    );
    const row = result.rows[0];

    if (!row) {
      throw new NotFoundError("Message could not be created");
    }

    const message = await formatPublicMessage(row, body.targetLanguage ?? guild.default_language);

    if (moderation.status === "visible") {
      broadcastPublic(guild.id, "public_message", { message });
    }

    res.status(201).json({ message, moderation });
  })
);

messagesRouter.get(
  "/public/guilds/:slug/chat/stream",
  validate({ params: publicSlugParamsSchema }),
  asyncHandler(async (req, res) => {
    const { slug } = req.params as z.infer<typeof publicSlugParamsSchema>;
    const guild = await findPublicChatGuildBySlug(database, slug);
    prepareSse(res);
    const client = { guildId: guild.id, res } satisfies SseClient;
    const removeClient = addSseClient(publicChatClients, guild.id, client);
    sendSse(res, "connected", { guildId: guild.id, publicChat: true });
    const heartbeat = setInterval(() => sendSse(res, "heartbeat", { at: new Date().toISOString() }), 25000);

    req.on("close", () => {
      clearInterval(heartbeat);
      removeClient();
    });
  })
);

messagesRouter.get(
  "/guilds/:guildId/conversations",
  requireAuth,
  validate({ params: guildParamsSchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId } = req.params as unknown as z.infer<typeof guildParamsSchema>;
    await assertGuildAccess(database, guildId, auth.user.id);

    const [internal, privates] = await Promise.all([
      listInternalConversations(guildId, auth.user.id),
      listPrivateConversations(guildId, auth.user.id)
    ]);
    const conversations =
      internal.length > 0
        ? [...internal, ...privates]
        : [
            {
              id: "internal:general",
              type: "internal",
              channel: "general",
              title: "Guilde",
              preview: "Aucun message pour le moment",
              author: "GuildOps",
              unreadCount: 0,
              lastMessageAt: null
            },
            ...privates
          ];

    res.json({ conversations });
  })
);

messagesRouter.get(
  "/guilds/:guildId/message-recipients",
  requireAuth,
  validate({ params: guildParamsSchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId } = req.params as unknown as z.infer<typeof guildParamsSchema>;
    await assertGuildAccess(database, guildId, auth.user.id);

    const result = await query<MessageRecipientRow>(
      `
        SELECT
          u.id::text,
          u.email::text,
          u.display_name,
          gm.nickname,
          u.preferred_language,
          gm.status,
          COALESCE(
            string_agg(DISTINCT roles.name, ', ' ORDER BY roles.name) FILTER (WHERE roles.name IS NOT NULL),
            ''
          ) AS role
        FROM guild_members gm
        JOIN users u ON u.id = gm.user_id
        LEFT JOIN guild_member_roles gmr ON gmr.guild_member_id = gm.id
        LEFT JOIN roles ON roles.id = gmr.role_id
        WHERE gm.guild_id = $1
          AND gm.user_id <> $2
          AND gm.status NOT IN ('banned', 'left')
        GROUP BY u.id, u.email, u.display_name, gm.nickname, u.preferred_language, gm.status
        ORDER BY gm.nickname ASC, u.display_name ASC
      `,
      [guildId, auth.user.id]
    );

    res.json({
      recipients: result.rows.map(toMessageRecipientResource)
    });
  })
);

messagesRouter.post(
  "/guilds/:guildId/message-invitations",
  requireAuth,
  validate({ params: guildParamsSchema, body: messageInvitationBodySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId } = req.params as unknown as z.infer<typeof guildParamsSchema>;
    const body = req.body as z.infer<typeof messageInvitationBodySchema>;
    await assertGuildAccess(database, guildId, auth.user.id);

    const user = await findUserByEmail(guildId, body.email);

    if (user?.status === "banned") {
      throw new ForbiddenError("Ce compte ne peut pas etre contacte depuis cette guilde.");
    }

    if (user) {
      res.json({
        status: "recipient_found",
        message: "Compte GuildOps trouve.",
        recipient: toMessageRecipientResource(user)
      });
      return;
    }

    const delivery = await sendRegistrationInvitationEmail({
      email: body.email,
      inviterName: auth.user.displayName
    });

    res.status(202).json({
      status: "registration_invitation_sent",
      email: body.email,
      message: "Aucun compte GuildOps trouve. Mail d'inscription envoye.",
      ...(process.env.NODE_ENV === "production" ? {} : { invitationUrl: delivery.invitationUrl })
    });
  })
);

messagesRouter.get(
  "/guilds/:guildId/messages",
  requireAuth,
  validate({ params: guildParamsSchema, query: guildMessagesQuerySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId } = req.params as z.infer<typeof guildParamsSchema>;
    const queryParams = req.query as unknown as z.infer<typeof guildMessagesQuerySchema>;
    const cursor = parseCursor(queryParams.cursor);
    await assertGuildAccess(database, guildId, auth.user.id);

    if (queryParams.conversationType === "private" && !queryParams.participantId) {
      throw new BadRequestError("participantId is required for private messages");
    }

    if (queryParams.conversationType === "private") {
      await assertMessageRecipientExists(queryParams.participantId as string);
    }

    const payload = await listPrivateMessages(guildId, auth.user.id, {
      channel: normalizeChannel(queryParams.channel),
      conversationType: queryParams.conversationType,
      cursor,
      limit: queryParams.limit,
      participantId: queryParams.participantId,
      targetLanguage: queryParams.targetLanguage ?? auth.user.preferredLanguage
    });

    res.json(payload);
  })
);

messagesRouter.post(
  "/guilds/:guildId/messages",
  requireAuth,
  validate({ params: guildParamsSchema, body: privateMessageBodySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId } = req.params as z.infer<typeof guildParamsSchema>;
    const body = req.body as z.infer<typeof privateMessageBodySchema>;
    const access = await assertGuildAccess(database, guildId, auth.user.id);
    const conversationType = body.recipientUserId ? "private" : body.conversationType;
    const channel = normalizeChannel(body.channel);
    const attachments = normalizePrivateMessageAttachments(body.attachments);
    const messageBody = body.body || (attachments.length ? "Image" : "");

    if (conversationType === "private") {
      if (!body.recipientUserId) {
        throw new BadRequestError("recipientUserId is required for private messages");
      }

      if (body.recipientUserId === auth.user.id) {
        throw new BadRequestError("Cannot send a private message to yourself");
      }

      await assertMessageRecipientExists(body.recipientUserId);
    }

    const { row, notifications } = await withClient(async (client) => {
      await client.query("BEGIN");

      try {
        const result = await client.query<PrivateMessageRow>(
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
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING
              id::text,
              body,
              source_language,
              created_at::text,
              $8::text AS author,
              sender_user_id::text,
              recipient_user_id::text,
              true AS is_read,
              jsonb_build_array(
                jsonb_build_object(
                  'id', $3::text,
                  'displayName', $8::text,
                  'readAt', now()::text
                )
              ) AS read_by,
              metadata
          `,
          [
            access.organization_id,
            guildId,
            auth.user.id,
            conversationType === "private" ? body.recipientUserId : null,
            messageBody,
            normalizeLanguage(body.sourceLanguage, "auto"),
            { kind: conversationType, channel, attachments },
            auth.user.displayName
          ]
        );
        const savedRow = result.rows[0];

        if (!savedRow) {
          throw new NotFoundError("Message could not be created");
        }

        await markSingleMessageRead(client, savedRow.id, auth.user.id);
        const notificationInput = buildMessageNotificationInput({
          author: auth.user.displayName,
          channel,
          conversationType,
          guildId,
          hasImageAttachment: attachments.length > 0,
          messageBody,
          messageId: savedRow.id,
          recipientUserId: body.recipientUserId ?? null,
          senderUserId: auth.user.id
        });
        const createdNotifications =
          conversationType === "private"
            ? await createGuildNotificationsForUsers(client, {
                ...notificationInput,
                userIds: [body.recipientUserId as string]
              })
            : await createGuildNotificationsForMembers(client, notificationInput);

        await client.query("COMMIT");
        return { row: savedRow, notifications: createdNotifications };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
    const message = await formatPrivateMessage(row, body.targetLanguage ?? auth.user.preferredLanguage, auth.user.id);

    broadcastGuild(guildId, "private_message", { message }, (client) => canClientReceiveMessage(client, message));
    void broadcastUnreadCounts(guildId, conversationType === "private" ? [auth.user.id, body.recipientUserId as string] : undefined);
    void deliverPushNotifications(notifications);

    res.status(201).json({ message });
  })
);

messagesRouter.patch(
  "/guilds/:guildId/messages/:messageId/read",
  requireAuth,
  validate({ params: messageParamsSchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId, messageId } = req.params as z.infer<typeof messageParamsSchema>;
    await assertGuildAccess(database, guildId, auth.user.id);

    const readMessageId = await markReadableMessageRead(guildId, auth.user.id, messageId);

    if (!readMessageId) {
      throw new NotFoundError("Message not found");
    }

    await markMessageNotificationsRead(guildId, auth.user.id, [readMessageId]);
    const unreadCount = await countUnreadMessages(guildId, auth.user.id);
    broadcastGuild(guildId, "unread_count", { unreadCount }, (client) => client.userId === auth.user.id);
    res.json({ messageId: readMessageId, unreadCount });
  })
);

messagesRouter.post(
  "/guilds/:guildId/messages/read",
  requireAuth,
  validate({ params: guildParamsSchema, body: readConversationBodySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId } = req.params as z.infer<typeof guildParamsSchema>;
    const body = req.body as z.infer<typeof readConversationBodySchema>;
    await assertGuildAccess(database, guildId, auth.user.id);

    if (body.conversationType === "private" && !body.participantId) {
      throw new BadRequestError("participantId is required for private messages");
    }

    const readMessageIds = await markConversationRead(guildId, auth.user.id, {
      channel: normalizeChannel(body.channel),
      conversationType: body.conversationType,
      participantId: body.participantId
    });
    await markMessageNotificationsRead(guildId, auth.user.id, readMessageIds);
    const unreadCount = await countUnreadMessages(guildId, auth.user.id);
    broadcastGuild(guildId, "unread_count", { unreadCount }, (client) => client.userId === auth.user.id);
    res.json({ readCount: readMessageIds.length, unreadCount });
  })
);

messagesRouter.get(
  "/guilds/:guildId/messages/unread-count",
  requireAuth,
  validate({ params: guildParamsSchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId } = req.params as unknown as z.infer<typeof guildParamsSchema>;
    await assertGuildAccess(database, guildId, auth.user.id);

    res.json({ unreadCount: await countUnreadMessages(guildId, auth.user.id) });
  })
);

messagesRouter.get(
  "/guilds/:guildId/messages/stream",
  requireAuth,
  validate({ params: guildParamsSchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId } = req.params as z.infer<typeof guildParamsSchema>;
    await assertGuildAccess(database, guildId, auth.user.id);

    prepareSse(res);
    const client = { guildId, res, userId: auth.user.id } satisfies SseClient;
    const removeClient = addSseClient(guildMessageClients, guildId, client);
    sendSse(res, "connected", { guildId, unreadCount: await countUnreadMessages(guildId, auth.user.id) });
    const heartbeat = setInterval(() => sendSse(res, "heartbeat", { at: new Date().toISOString() }), 25000);

    req.on("close", () => {
      clearInterval(heartbeat);
      removeClient();
    });
  })
);

messagesRouter.get(
  "/guilds/:guildId/public-chat/messages",
  requireAuth,
  validate({ params: guildParamsSchema, query: publicModerationQuerySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId } = req.params as z.infer<typeof guildParamsSchema>;
    const { targetLanguage = auth.user.preferredLanguage, limit, cursor, status } = req.query as unknown as z.infer<
      typeof publicModerationQuerySchema
    >;
    await assertGuildAccess(database, guildId, auth.user.id, ["owner", "admin"]);

    res.json(
      await listPublicMessages(guildId, {
        cursor: parseCursor(cursor),
        limit,
        status,
        targetLanguage
      })
    );
  })
);

messagesRouter.patch(
  "/guilds/:guildId/public-chat/messages/:messageId/moderation",
  requireAuth,
  validate({ params: messageParamsSchema, body: moderationBodySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId, messageId } = req.params as z.infer<typeof messageParamsSchema>;
    const body = req.body as z.infer<typeof moderationBodySchema>;
    await assertGuildAccess(database, guildId, auth.user.id, ["owner", "admin"]);

    const result = await query<PublicMessageRow>(
      `
        UPDATE public_chat_messages
        SET
          moderation_status = $3,
          metadata = metadata || $4::jsonb
        WHERE id = $2
          AND guild_id = $1
        RETURNING
          id::text,
          body,
          source_language,
          created_at::text,
          COALESCE(guest_name, 'Invite') AS author,
          moderation_status,
          metadata
      `,
      [
        guildId,
        messageId,
        body.status,
        JSON.stringify({
          moderationReason: body.reason ?? null,
          moderatedBy: auth.user.id,
          moderatedAt: new Date().toISOString()
        })
      ]
    );
    const row = result.rows[0];

    if (!row) {
      throw new NotFoundError("Public chat message not found");
    }

    const message = await formatPublicMessage(row, auth.user.preferredLanguage);

    if (body.status === "visible") {
      broadcastPublic(guildId, "public_message", { message });
    } else {
      broadcastPublic(guildId, "public_moderation", { messageId, status: body.status });
    }

    res.json({ message });
  })
);

async function listPublicMessages(
  guildId: string,
  input: {
    cursor: string | null;
    limit: number;
    status: "visible" | "hidden" | "flagged" | "deleted" | "all";
    targetLanguage: string;
  }
) {
  const result = await query<PublicMessageRow>(
    `
      SELECT
        pcm.id::text,
        pcm.body,
        pcm.source_language,
        pcm.created_at::text,
        COALESCE(gm.nickname, pcm.guest_name, 'Invite') AS author,
        pcm.moderation_status,
        pcm.metadata
      FROM public_chat_messages pcm
      LEFT JOIN guild_members gm ON gm.id = pcm.guild_member_id
      WHERE pcm.guild_id = $1
        AND ($3::timestamptz IS NULL OR pcm.created_at < $3::timestamptz)
        AND ($4::text = 'all' OR pcm.moderation_status = $4::text)
      ORDER BY pcm.created_at DESC
      LIMIT $2
    `,
    [guildId, input.limit + 1, input.cursor, input.status]
  );
  const rows = result.rows.slice(0, input.limit);
  const nextCursor = result.rows.length > input.limit ? rows[rows.length - 1]?.created_at ?? null : null;
  const messages = await Promise.all([...rows].reverse().map((message) => formatPublicMessage(message, input.targetLanguage)));

  return { messages, nextCursor, targetLanguage: normalizeLanguage(input.targetLanguage) };
}

async function listPrivateMessages(
  guildId: string,
  userId: string,
  input: {
    channel: string;
    conversationType: "internal" | "private";
    cursor: string | null;
    limit: number;
    participantId?: string;
    targetLanguage: string;
  }
) {
  const rows =
    input.conversationType === "private"
      ? await listDirectMessages(guildId, userId, input.participantId as string, input.cursor, input.limit)
      : await listChannelMessages(guildId, userId, input.channel, input.cursor, input.limit);
  const pageRows = rows.slice(0, input.limit);
  const nextCursor = rows.length > input.limit ? pageRows[pageRows.length - 1]?.created_at ?? null : null;
  const messages = await Promise.all(
    [...pageRows].reverse().map((message) => formatPrivateMessage(message, input.targetLanguage, userId))
  );

  return { messages, nextCursor, targetLanguage: normalizeLanguage(input.targetLanguage) };
}

async function listChannelMessages(
  guildId: string,
  userId: string,
  channel: string,
  cursor: string | null,
  limit: number
): Promise<PrivateMessageRow[]> {
  const result = await query<PrivateMessageRow>(
    `
      SELECT
        pm.id::text,
        pm.body,
        pm.source_language,
        pm.created_at::text,
        COALESCE(u.display_name, 'GuildOps') AS author,
        pm.sender_user_id::text,
        pm.recipient_user_id::text,
        (rr.message_id IS NOT NULL OR pm.sender_user_id = $2) AS is_read,
        COALESCE(readers.read_by, '[]'::jsonb) AS read_by,
        pm.metadata
      FROM private_messages pm
      LEFT JOIN users u ON u.id = pm.sender_user_id
      LEFT JOIN message_read_receipts rr ON rr.message_id = pm.id AND rr.user_id = $2
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', reader.id::text,
            'displayName', COALESCE(NULLIF(gm.nickname, ''), reader.display_name),
            'readAt', mrr.read_at::text
          )
          ORDER BY mrr.read_at ASC
        ) AS read_by
        FROM message_read_receipts mrr
        JOIN users reader ON reader.id = mrr.user_id
        LEFT JOIN guild_members gm ON gm.guild_id = pm.guild_id AND gm.user_id = reader.id
        WHERE mrr.message_id = pm.id
      ) readers ON true
      WHERE pm.guild_id = $1
        AND pm.recipient_user_id IS NULL
        AND COALESCE(NULLIF(pm.metadata->>'channel', ''), 'general') = $4
        AND pm.deleted_by_sender_at IS NULL
        AND pm.deleted_by_recipient_at IS NULL
        AND ($3::timestamptz IS NULL OR pm.created_at < $3::timestamptz)
      ORDER BY pm.created_at DESC
      LIMIT $5
    `,
    [guildId, userId, cursor, channel, limit + 1]
  );

  return result.rows;
}

async function listDirectMessages(
  guildId: string,
  userId: string,
  participantId: string,
  cursor: string | null,
  limit: number
): Promise<PrivateMessageRow[]> {
  const result = await query<PrivateMessageRow>(
    `
      SELECT
        pm.id::text,
        pm.body,
        pm.source_language,
        pm.created_at::text,
        COALESCE(u.display_name, 'GuildOps') AS author,
        pm.sender_user_id::text,
        pm.recipient_user_id::text,
        (rr.message_id IS NOT NULL OR pm.sender_user_id = $2) AS is_read,
        COALESCE(readers.read_by, '[]'::jsonb) AS read_by,
        pm.metadata
      FROM private_messages pm
      LEFT JOIN users u ON u.id = pm.sender_user_id
      LEFT JOIN message_read_receipts rr ON rr.message_id = pm.id AND rr.user_id = $2
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', reader.id::text,
            'displayName', COALESCE(NULLIF(gm.nickname, ''), reader.display_name),
            'readAt', mrr.read_at::text
          )
          ORDER BY mrr.read_at ASC
        ) AS read_by
        FROM message_read_receipts mrr
        JOIN users reader ON reader.id = mrr.user_id
        LEFT JOIN guild_members gm ON gm.guild_id = pm.guild_id AND gm.user_id = reader.id
        WHERE mrr.message_id = pm.id
      ) readers ON true
      WHERE pm.guild_id = $1
        AND pm.recipient_user_id IS NOT NULL
        AND (
          (pm.sender_user_id = $2 AND pm.recipient_user_id = $4 AND pm.deleted_by_sender_at IS NULL)
          OR
          (pm.sender_user_id = $4 AND pm.recipient_user_id = $2 AND pm.deleted_by_recipient_at IS NULL)
        )
        AND ($3::timestamptz IS NULL OR pm.created_at < $3::timestamptz)
      ORDER BY pm.created_at DESC
      LIMIT $5
    `,
    [guildId, userId, cursor, participantId, limit + 1]
  );

  return result.rows;
}

async function listInternalConversations(guildId: string, userId: string) {
  const result = await query<{
    channel: string;
    preview: string;
    author: string;
    last_message_at: string;
    unread_count: number;
  }>(
    `
      SELECT
        COALESCE(NULLIF(pm.metadata->>'channel', ''), 'general') AS channel,
        (array_agg(pm.body ORDER BY pm.created_at DESC))[1] AS preview,
        (array_agg(COALESCE(u.display_name, 'GuildOps') ORDER BY pm.created_at DESC))[1] AS author,
        max(pm.created_at)::text AS last_message_at,
        count(*) FILTER (
          WHERE pm.sender_user_id IS DISTINCT FROM $2
            AND rr.message_id IS NULL
        )::int AS unread_count
      FROM private_messages pm
      LEFT JOIN users u ON u.id = pm.sender_user_id
      LEFT JOIN message_read_receipts rr ON rr.message_id = pm.id AND rr.user_id = $2
      WHERE pm.guild_id = $1
        AND pm.recipient_user_id IS NULL
        AND pm.deleted_by_sender_at IS NULL
        AND pm.deleted_by_recipient_at IS NULL
      GROUP BY COALESCE(NULLIF(pm.metadata->>'channel', ''), 'general')
      ORDER BY max(pm.created_at) DESC
      LIMIT 20
    `,
    [guildId, userId]
  );

  return result.rows.map((conversation) => ({
    id: `internal:${conversation.channel}`,
    type: "internal",
    channel: conversation.channel,
    title: conversation.channel === "general" ? "Guilde" : conversation.channel,
    preview: conversation.preview,
    author: conversation.author,
    unreadCount: Number(conversation.unread_count),
    lastMessageAt: conversation.last_message_at
  }));
}

async function listPrivateConversations(guildId: string, userId: string) {
  const result = await query<{
    participant_user_id: string;
    participant_name: string;
    preview: string;
    author: string;
    last_message_at: string;
    unread_count: number;
  }>(
    `
      WITH visible_messages AS (
        SELECT
          pm.*,
          CASE
            WHEN pm.sender_user_id = $2 THEN pm.recipient_user_id
            ELSE pm.sender_user_id
          END AS participant_user_id
        FROM private_messages pm
        WHERE pm.guild_id = $1
          AND pm.recipient_user_id IS NOT NULL
          AND (
            (pm.sender_user_id = $2 AND pm.deleted_by_sender_at IS NULL)
            OR
            (pm.recipient_user_id = $2 AND pm.deleted_by_recipient_at IS NULL)
          )
      )
      SELECT
        visible.participant_user_id::text,
        participant.display_name AS participant_name,
        (array_agg(visible.body ORDER BY visible.created_at DESC))[1] AS preview,
        (array_agg(COALESCE(sender.display_name, 'GuildOps') ORDER BY visible.created_at DESC))[1] AS author,
        max(visible.created_at)::text AS last_message_at,
        count(*) FILTER (
          WHERE visible.recipient_user_id = $2
            AND rr.message_id IS NULL
        )::int AS unread_count
      FROM visible_messages visible
      JOIN users participant ON participant.id = visible.participant_user_id
      LEFT JOIN users sender ON sender.id = visible.sender_user_id
      LEFT JOIN message_read_receipts rr ON rr.message_id = visible.id AND rr.user_id = $2
      GROUP BY visible.participant_user_id, participant.display_name
      ORDER BY max(visible.created_at) DESC
      LIMIT 40
    `,
    [guildId, userId]
  );

  return result.rows.map((conversation) => ({
    id: `private:${conversation.participant_user_id}`,
    type: "private",
    participantId: conversation.participant_user_id,
    title: conversation.participant_name,
    preview: conversation.preview,
    author: conversation.author,
    unreadCount: Number(conversation.unread_count),
    lastMessageAt: conversation.last_message_at
  }));
}

async function markReadableMessageRead(guildId: string, userId: string, messageId: string): Promise<string | null> {
  const result = await query<{ message_id: string }>(
    `
      INSERT INTO message_read_receipts (message_id, user_id, read_at)
      SELECT pm.id, $2, now()
      FROM private_messages pm
      WHERE pm.id = $3
        AND pm.guild_id = $1
        AND (
          pm.recipient_user_id IS NULL
          OR pm.recipient_user_id = $2
          OR pm.sender_user_id = $2
        )
      ON CONFLICT (message_id, user_id)
      DO UPDATE SET read_at = EXCLUDED.read_at
      RETURNING message_id::text
    `,
    [guildId, userId, messageId]
  );

  return result.rows[0]?.message_id ?? null;
}

async function markSingleMessageRead(db: Queryable, messageId: string, userId: string): Promise<void> {
  await db.query(
    `
      INSERT INTO message_read_receipts (message_id, user_id, read_at)
      VALUES ($1, $2, now())
      ON CONFLICT (message_id, user_id)
      DO UPDATE SET read_at = EXCLUDED.read_at
    `,
    [messageId, userId]
  );
}

async function markConversationRead(
  guildId: string,
  userId: string,
  input: { channel: string; conversationType: "internal" | "private"; participantId?: string }
): Promise<string[]> {
  const result =
    input.conversationType === "private"
      ? await query<{ message_id: string }>(
          `
            INSERT INTO message_read_receipts (message_id, user_id, read_at)
            SELECT pm.id, $2, now()
            FROM private_messages pm
            WHERE pm.guild_id = $1
              AND pm.sender_user_id = $3
              AND pm.recipient_user_id = $2
              AND pm.deleted_by_recipient_at IS NULL
            ON CONFLICT (message_id, user_id)
            DO UPDATE SET read_at = EXCLUDED.read_at
            RETURNING message_id::text
          `,
          [guildId, userId, input.participantId]
        )
      : await query<{ message_id: string }>(
          `
            INSERT INTO message_read_receipts (message_id, user_id, read_at)
            SELECT pm.id, $2, now()
            FROM private_messages pm
            WHERE pm.guild_id = $1
              AND pm.recipient_user_id IS NULL
              AND pm.sender_user_id IS DISTINCT FROM $2
              AND COALESCE(NULLIF(pm.metadata->>'channel', ''), 'general') = $3
              AND pm.deleted_by_sender_at IS NULL
              AND pm.deleted_by_recipient_at IS NULL
            ON CONFLICT (message_id, user_id)
            DO UPDATE SET read_at = EXCLUDED.read_at
            RETURNING message_id::text
          `,
          [guildId, userId, input.channel]
        );

  return result.rows.map((row) => row.message_id).filter(Boolean);
}

async function markMessageNotificationsRead(guildId: string, userId: string, messageIds: string[]): Promise<void> {
  const uniqueMessageIds = [...new Set(messageIds.filter(Boolean))];
  if (!uniqueMessageIds.length) return;

  await query(
    `
      UPDATE notifications
      SET read_at = COALESCE(read_at, now())
      WHERE guild_id = $1
        AND user_id = $2
        AND type IN ('message.private.created', 'message.internal.created')
        AND data->>'messageId' = ANY($3::text[])
    `,
    [guildId, userId, uniqueMessageIds]
  );
}

async function countUnreadMessages(guildId: string, userId: string): Promise<number> {
  const result = await query<{ count: string }>(
    `
      SELECT count(*)::text
      FROM private_messages pm
      LEFT JOIN message_read_receipts rr ON rr.message_id = pm.id AND rr.user_id = $2
      WHERE pm.guild_id = $1
        AND pm.sender_user_id IS DISTINCT FROM $2
        AND rr.message_id IS NULL
        AND (
          pm.recipient_user_id = $2
          OR pm.recipient_user_id IS NULL
        )
        AND pm.deleted_by_sender_at IS NULL
        AND pm.deleted_by_recipient_at IS NULL
    `,
    [guildId, userId]
  );

  return Number(result.rows[0]?.count ?? 0);
}

async function formatPublicMessage(message: PublicMessageRow, targetLanguage: string) {
  const formatted = await formatMessageForLanguage(database, {
    sourceTable: "public_chat_messages",
    message,
    targetLanguage
  });

  return {
    ...formatted,
    moderationStatus: message.moderation_status
  };
}

async function formatPrivateMessage(message: PrivateMessageRow, targetLanguage: string, currentUserId: string) {
  const formatted = await formatMessageForLanguage(database, {
    sourceTable: "private_messages",
    message,
    targetLanguage
  });
  const channel = normalizeChannel(String(message.metadata?.channel || "general"));
  const conversationType = message.recipient_user_id ? "private" : "internal";

  return {
    ...formatted,
    channel,
    conversationType,
    isOwn: message.sender_user_id === currentUserId,
    read: Boolean(message.is_read),
    readBy: normalizePrivateMessageReaders(message.read_by),
    attachments: normalizePrivateMessageAttachments(message.metadata?.attachments),
    recipientUserId: message.recipient_user_id,
    senderUserId: message.sender_user_id
  };
}

function buildMessageNotificationInput(input: MessageNotificationBuildInput): GuildNotificationInput {
  const channelLabel = input.channel === "general" ? "Guilde" : input.channel;
  const preview = getMessageNotificationPreview(input.messageBody, input.hasImageAttachment);

  return {
    guildId: input.guildId,
    actorUserId: input.senderUserId,
    type: input.conversationType === "private" ? "message.private.created" : "message.internal.created",
    title:
      input.conversationType === "private"
        ? `Nouveau message de ${input.author}`
        : `Nouveau message · ${channelLabel}`,
    body: `${input.author}: ${preview}`,
    data: {
      url: "/app/messages",
      messageId: input.messageId,
      conversationType: input.conversationType,
      channel: input.channel,
      recipientUserId: input.recipientUserId,
      senderUserId: input.senderUserId,
      hasImageAttachment: input.hasImageAttachment
    }
  };
}

function getMessageNotificationPreview(messageBody: string, hasImageAttachment: boolean): string {
  const body = messageBody.trim();
  const preview = body && (body !== "Image" || !hasImageAttachment) ? body : "Image envoyée";

  return preview.length > 120 ? `${preview.slice(0, 117)}...` : preview;
}

function normalizePrivateMessageAttachments(attachments: unknown) {
  if (!Array.isArray(attachments)) return [];

  return attachments
    .map((attachment, index) => {
      if (!attachment || typeof attachment !== "object") return null;
      const value = attachment as Record<string, unknown>;
      const mimeType = String(value.mimeType || value.mime_type || "").trim();
      const dataUrl = String(value.dataUrl || value.data_url || "").trim();
      const name = String(value.name || "Image").trim();

      if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(mimeType)) return null;
      if (!dataUrl || !/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) return null;

      return {
        id: String(value.id || `image-${index}`).trim(),
        type: "image",
        name: name || "Image",
        mimeType,
        size: Number(value.size || 0),
        dataUrl,
        alt: String(value.alt || name || "Image envoyée").trim(),
        compressed: Boolean(value.compressed),
        originalSize: Number(value.originalSize || value.original_size || 0),
        compressionLabel: String(value.compressionLabel || value.compression_label || "").trim()
      };
    })
    .filter(
      (attachment): attachment is {
        id: string;
        type: "image";
        name: string;
        mimeType: string;
        size: number;
        dataUrl: string;
        alt: string;
        compressed: boolean;
        originalSize: number;
        compressionLabel: string;
      } => Boolean(attachment)
    );
}

function normalizePrivateMessageReaders(readBy: unknown) {
  if (!Array.isArray(readBy)) return [];

  return readBy
    .map((reader) => {
      if (!reader || typeof reader !== "object") return null;
      const value = reader as Record<string, unknown>;
      const id = String(value.id || value.userId || value.user_id || "").trim();
      const displayName = String(value.displayName || value.display_name || value.nickname || value.name || "Membre").trim();

      if (!id || !displayName) return null;

      return {
        id,
        displayName,
        readAt: typeof value.readAt === "string" ? value.readAt : typeof value.read_at === "string" ? value.read_at : null
      };
    })
    .filter((reader): reader is { id: string; displayName: string; readAt: string | null } => Boolean(reader));
}

export function toMessageRecipientResource(recipient: MessageRecipientRow) {
  return {
    id: recipient.id,
    displayName: recipient.display_name,
    email: recipient.email,
    nickname: recipient.nickname || recipient.display_name,
    preferredLanguage: recipient.preferred_language,
    role: recipient.role || "",
    status: recipient.status || ""
  };
}

async function findUserByEmail(guildId: string, email: string): Promise<MessageInvitationLookupRow | null> {
  const result = await query<MessageInvitationLookupRow>(
    `
      SELECT
        u.id::text,
        u.email::text,
        u.display_name,
        COALESCE(gm.nickname, u.display_name) AS nickname,
        u.preferred_language,
        gm.status,
        (gm.id IS NOT NULL AND gm.status NOT IN ('banned', 'left')) AS "isGuildMember",
        COALESCE(
          string_agg(DISTINCT roles.name, ', ' ORDER BY roles.name) FILTER (WHERE roles.name IS NOT NULL),
          ''
        ) AS role
      FROM users u
      LEFT JOIN guild_members gm
        ON gm.user_id = u.id
       AND gm.guild_id = $2
      LEFT JOIN guild_member_roles gmr ON gmr.guild_member_id = gm.id
      LEFT JOIN roles ON roles.id = gmr.role_id
      WHERE u.email = $1
        AND u.disabled_at IS NULL
      GROUP BY u.id, u.email, u.display_name, u.preferred_language, gm.id, gm.nickname, gm.status
      LIMIT 1
    `,
    [email, guildId]
  );

  return result.rows[0] ?? null;
}

export async function findPublicChatGuildBySlug(db: Queryable, slug: string): Promise<PublicChatGuild> {
  const result = await db.query<PublicChatGuildRow>(
    `
      SELECT
        g.id::text,
        g.default_language,
        COALESCE(
          (gs.sections_json->>'publicChat')::boolean,
          (gs.pages_json#>>'{sections,publicChat}')::boolean,
          true
        ) AS public_chat_enabled,
        COALESCE(gm.status = 'enabled', true) AS public_chat_module_enabled
      FROM guilds g
      JOIN guild_sites gs ON gs.guild_id = g.id
      LEFT JOIN guild_modules gm
        ON gm.guild_id = g.id
       AND gm.module_key = 'messages'
      WHERE (g.slug = $1 OR gs.public_slug = $1)
        AND g.deleted_at IS NULL
        AND gs.status = 'published'
      LIMIT 1
    `,
    [slug]
  );
  const guild = result.rows[0];

  if (!guild || !guild.public_chat_enabled || !guild.public_chat_module_enabled) {
    throw new NotFoundError("Public chat is disabled");
  }

  return { id: guild.id, default_language: guild.default_language };
}

async function assertMessageRecipientExists(userId: string): Promise<void> {
  const result = await query<{ id: string }>(
    `
      SELECT id::text
      FROM users
      WHERE id = $1
        AND disabled_at IS NULL
      LIMIT 1
    `,
    [userId]
  );

  if (!result.rows[0]) {
    throw new NotFoundError("Message recipient not found");
  }
}

function prepareSse(res: Response) {
  res.status(200);
  res.set({
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Content-Type": "text/event-stream",
    "X-Accel-Buffering": "no"
  });
  res.flushHeaders();
}

function sendSse(res: Response, event: string, payload: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function addSseClient(clients: Map<string, Set<SseClient>>, guildId: string, client: SseClient) {
  const guildClients = clients.get(guildId) ?? new Set<SseClient>();
  guildClients.add(client);
  clients.set(guildId, guildClients);

  return () => {
    guildClients.delete(client);
    if (guildClients.size === 0) {
      clients.delete(guildId);
    }
  };
}

function broadcastPublic(guildId: string, event: string, payload: unknown) {
  for (const client of publicChatClients.get(guildId) ?? []) {
    sendSse(client.res, event, payload);
  }
}

function broadcastGuild(
  guildId: string,
  event: string,
  payload: unknown,
  predicate: (client: SseClient) => boolean = () => true
) {
  for (const client of guildMessageClients.get(guildId) ?? []) {
    if (predicate(client)) {
      sendSse(client.res, event, payload);
    }
  }
}

async function broadcastUnreadCounts(guildId: string, userIds?: string[]) {
  const targetUserIds = userIds ? new Set(userIds.filter(Boolean)) : null;

  for (const client of guildMessageClients.get(guildId) ?? []) {
    if (!client.userId || (targetUserIds && !targetUserIds.has(client.userId))) continue;
    try {
      sendSse(client.res, "unread_count", {
        unreadCount: await countUnreadMessages(guildId, client.userId)
      });
    } catch {
      // The next heartbeat will drop broken clients through the normal request close path.
    }
  }
}

function canClientReceiveMessage(client: SseClient, message: Awaited<ReturnType<typeof formatPrivateMessage>>) {
  if (!client.userId) return false;
  if (message.conversationType === "internal") return true;
  return message.senderUserId === client.userId || message.recipientUserId === client.userId;
}

function getGuestFingerprintHash(req: Request): string {
  const forwardedFor = req.get("x-forwarded-for")?.split(",")[0]?.trim();
  const remoteAddress = req.ip || forwardedFor || req.socket.remoteAddress || "unknown";
  const userAgent = req.get("user-agent") || "unknown";

  return createHash("sha256")
    .update([env.SESSION_SECRET ?? "guildops-public-chat", remoteAddress, userAgent].join("|"))
    .digest("hex");
}

async function checkPublicChatRateLimit(guildId: string, guestFingerprintHash: string) {
  const result = await query<PublicChatRateLimitRow>(
    `
      SELECT
        count(*) FILTER (
          WHERE created_at >= now() - ($3::int * interval '1 second')
        )::text AS burst_count,
        min(created_at) FILTER (
          WHERE created_at >= now() - ($3::int * interval '1 second')
        )::text AS burst_oldest_created_at,
        count(*) FILTER (
          WHERE created_at >= now() - ($4::int * interval '1 second')
        )::text AS sustained_count,
        min(created_at) FILTER (
          WHERE created_at >= now() - ($4::int * interval '1 second')
        )::text AS sustained_oldest_created_at
      FROM public_chat_messages
      WHERE guild_id = $1
        AND guest_fingerprint_hash = $2
        AND created_at >= now() - ($4::int * interval '1 second')
    `,
    [guildId, guestFingerprintHash, publicChatBurstLimit.windowSeconds, publicChatSustainedLimit.windowSeconds]
  );
  const row = result.rows[0];

  if (!row) return null;

  const hits = [
    buildRateLimitHit(
      "burst",
      Number(row.burst_count ?? 0),
      row.burst_oldest_created_at,
      publicChatBurstLimit.limit,
      publicChatBurstLimit.windowSeconds,
      publicChatBurstLimit.label
    ),
    buildRateLimitHit(
      "sustained",
      Number(row.sustained_count ?? 0),
      row.sustained_oldest_created_at,
      publicChatSustainedLimit.limit,
      publicChatSustainedLimit.windowSeconds,
      publicChatSustainedLimit.label
    )
  ].filter((hit): hit is NonNullable<typeof hit> => Boolean(hit));

  return hits.sort((left, right) => right.retryAfterSeconds - left.retryAfterSeconds)[0] ?? null;
}

function buildRateLimitHit(
  scope: "burst" | "sustained",
  count: number,
  oldestCreatedAt: string | null,
  limit: number,
  windowSeconds: number,
  label: string
) {
  if (count < limit) return null;

  const elapsedSeconds = oldestCreatedAt ? Math.floor((Date.now() - new Date(oldestCreatedAt).getTime()) / 1000) : 0;
  const retryAfterSeconds = Math.max(1, windowSeconds - elapsedSeconds + 1);

  return {
    scope,
    limit,
    windowSeconds,
    label,
    retryAfterSeconds
  };
}

function moderateMessage(body: string): { status: "visible" | "flagged"; flags: string[] } {
  const normalized = body.normalize("NFKC").toLowerCase();
  const flags = new Set<string>();
  const urls = normalized.match(urlPattern) ?? [];

  if (urls.length > 0) flags.add("link");
  if (urls.length > 1) flags.add("multiple-links");
  if (invitePattern.test(normalized)) flags.add("external-invite");
  if (suspiciousPhrasePattern.test(normalized)) flags.add("scam-keyword");
  if (repeatedCharacterPattern.test(normalized)) flags.add("repeated-characters");
  if (repeatedTokenPattern.test(normalized)) flags.add("repeated-phrase");

  const letters = body.match(/\p{L}/gu) ?? [];
  const uppercaseLetters = body.match(/\p{Lu}/gu) ?? [];

  if (letters.length >= 40 && uppercaseLetters.length / letters.length > 0.82) {
    flags.add("excessive-caps");
  }

  return {
    status: flags.size > 0 ? "flagged" : "visible",
    flags: [...flags]
  };
}

function normalizeChannel(channel: string): string {
  return channel.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "general";
}

function parseCursor(cursor?: string): string | null {
  if (!cursor) return null;
  const date = new Date(cursor);

  if (Number.isNaN(date.getTime())) {
    throw new BadRequestError("Invalid pagination cursor");
  }

  return date.toISOString();
}

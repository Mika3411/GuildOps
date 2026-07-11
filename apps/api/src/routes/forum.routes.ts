import { Router } from "express";
import { z } from "zod";
import { database, query, withClient } from "../db/pool.js";
import { asyncHandler } from "../http/async-handler.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../http/errors.js";
import { validate } from "../http/validate.js";
import { getAuth, requireAuth, type AuthContext } from "../security/auth.js";
import { assertGuildAccess } from "./access.js";
import { uuidSchema } from "./helpers.js";

export const forumRouter = Router();

type ForumAccess = {
  canManage: boolean;
  globalRole: string;
  mute: ForumMuteResource | null;
  muted: boolean;
  memberId: string;
  organizationRole: string;
  roleCodes: string[];
  roleIds: string[];
  userId: string;
};

type CategoryRow = {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  visibility: ForumVisibility;
  thread_count: string;
  post_count: string;
  last_post_at: string | null;
};

type CategoryPermissionRow = {
  category_id: string;
  role_id: string;
  role_code: string;
  role_name: string;
  can_read: boolean;
  can_post: boolean;
  can_moderate: boolean;
};

type ForumVisibility = "public" | "members" | "officers" | "admins";
type ForumThreadVisibility = "public" | "members";

type ForumMuteRow = {
  id: string;
  guild_id: string;
  muted_member_id: string;
  muted_member_name: string | null;
  muted_by_member_id: string | null;
  muted_by_name: string | null;
  reason: string | null;
  muted_at: string;
};

type ForumMuteResource = {
  id: string;
  guildId: string;
  memberId: string;
  memberName: string;
  mutedByMemberId: string | null;
  mutedByName: string;
  reason: string | null;
  mutedAt: string;
};

const guildParamsSchema = z.object({
  guildId: uuidSchema
});

const categoryParamsSchema = z.object({
  guildId: uuidSchema,
  categoryId: uuidSchema
});

const threadParamsSchema = z.object({
  guildId: uuidSchema,
  threadId: uuidSchema
});

const postParamsSchema = z.object({
  guildId: uuidSchema,
  threadId: uuidSchema,
  postId: uuidSchema
});

const muteParamsSchema = z.object({
  guildId: uuidSchema,
  memberId: uuidSchema
});

const listThreadsQuerySchema = z.object({
  categoryId: uuidSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20)
});

const listPostsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30)
});

const categoryBodySchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(500).nullable().optional(),
    sortOrder: z.coerce.number().int().min(0).max(999).optional().default(0),
    visibility: z.enum(["public", "members", "officers", "admins"]).optional().default("members")
  })
  .strict();

const updateCategoryBodySchema = categoryBodySchema.partial().strict();

const categoryPermissionsBodySchema = z
  .object({
    permissions: z
      .array(
        z
          .object({
            roleId: uuidSchema,
            canRead: z.boolean().default(true),
            canPost: z.boolean().default(true),
            canModerate: z.boolean().default(false)
          })
          .strict()
      )
      .max(50)
  })
  .strict();

const createThreadBodySchema = z
  .object({
    categoryId: uuidSchema,
    title: z.string().trim().min(3).max(180),
    body: z.string().trim().min(1).max(8000),
    visibility: z.enum(["public", "members"]).optional().default("members"),
    pinned: z.boolean().optional().default(false),
    locked: z.boolean().optional().default(false)
  })
  .strict();

const updateThreadBodySchema = z
  .object({
    categoryId: uuidSchema.optional(),
    title: z.string().trim().min(3).max(180).optional(),
    visibility: z.enum(["public", "members"]).optional(),
    pinned: z.boolean().optional(),
    locked: z.boolean().optional()
  })
  .strict();

const postBodySchema = z
  .object({
    body: z.string().trim().min(1).max(8000)
  })
  .strict();

const updatePostBodySchema = postBodySchema
  .extend({
    moderationNote: z.string().trim().max(240).nullable().optional()
  })
  .strict();

const deletePostBodySchema = z
  .object({
    moderationNote: z.string().trim().max(240).nullable().optional()
  })
  .strict();

const muteMemberBodySchema = z
  .object({
    memberId: uuidSchema,
    reason: z.string().trim().max(240).nullable().optional()
  })
  .strict();

type GuildParams = z.infer<typeof guildParamsSchema>;
type CategoryParams = z.infer<typeof categoryParamsSchema>;
type ThreadParams = z.infer<typeof threadParamsSchema>;
type PostParams = z.infer<typeof postParamsSchema>;
type MuteParams = z.infer<typeof muteParamsSchema>;

forumRouter.get(
  "/guilds/:guildId/forum",
  requireAuth,
  validate({ params: guildParamsSchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId } = req.params as GuildParams;
    const access = await getForumAccess(guildId, auth);
    const [categories, roles, mutes] = await Promise.all([
      listCategories(guildId, access),
      listForumRoles(guildId),
      access.canManage ? listForumMutes(guildId) : Promise.resolve([])
    ]);
    const unreadCounters = await countForumUnread(guildId, access, categories.map((category) => category.id));

    res.json({
      categories,
      currentMute: access.mute,
      mutes,
      roles,
      canManage: access.canManage,
      counters: {
        categories: categories.length,
        threads: categories.reduce((total, category) => total + category.threadCount, 0),
        posts: categories.reduce((total, category) => total + category.postCount, 0),
        unreadMessages: unreadCounters.unreadMessages,
        unreadThreads: unreadCounters.unreadThreads,
        newThreads: unreadCounters.newThreads
      }
    });
  })
);

forumRouter.get(
  "/guilds/:guildId/forum/categories",
  requireAuth,
  validate({ params: guildParamsSchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId } = req.params as GuildParams;
    const access = await getForumAccess(guildId, auth);
    res.json({ categories: await listCategories(guildId, access) });
  })
);

forumRouter.post(
  "/guilds/:guildId/forum/categories",
  requireAuth,
  validate({ params: guildParamsSchema, body: categoryBodySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId } = req.params as GuildParams;
    const body = req.body as z.infer<typeof categoryBodySchema>;
    const access = await getForumAccess(guildId, auth);
    assertCanManageForum(access);

    const result = await query<{ id: string }>(
      `
        INSERT INTO forum_categories (guild_id, name, description, sort_order, visibility)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id::text
      `,
      [guildId, body.name, body.description ?? null, body.sortOrder, body.visibility]
    );

    res.status(201).json({ category: await getCategory(guildId, result.rows[0]?.id, access) });
  })
);

forumRouter.patch(
  "/guilds/:guildId/forum/categories/:categoryId",
  requireAuth,
  validate({ params: categoryParamsSchema, body: updateCategoryBodySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId, categoryId } = req.params as CategoryParams;
    const body = req.body as z.infer<typeof updateCategoryBodySchema>;
    const access = await getForumAccess(guildId, auth);
    assertCanManageForum(access);

    const current = await getCategoryRow(guildId, categoryId);
    await query(
      `
        UPDATE forum_categories
        SET
          name = $3,
          description = $4,
          sort_order = $5,
          visibility = $6
        WHERE guild_id = $1
          AND id = $2
      `,
      [
        guildId,
        categoryId,
        body.name ?? current.name,
        body.description === undefined ? current.description : body.description,
        body.sortOrder ?? current.sort_order,
        body.visibility ?? current.visibility
      ]
    );

    res.json({ category: await getCategory(guildId, categoryId, access) });
  })
);

forumRouter.delete(
  "/guilds/:guildId/forum/categories/:categoryId",
  requireAuth,
  validate({ params: categoryParamsSchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId, categoryId } = req.params as CategoryParams;
    const access = await getForumAccess(guildId, auth);
    assertCanManageForum(access);

    const result = await query<{ id: string }>(
      `
        DELETE FROM forum_categories
        WHERE guild_id = $1
          AND id = $2
        RETURNING id::text
      `,
      [guildId, categoryId]
    );

    if (!result.rows[0]) throw new NotFoundError("Forum category not found");
    res.status(204).end();
  })
);

forumRouter.put(
  "/guilds/:guildId/forum/categories/:categoryId/permissions",
  requireAuth,
  validate({ params: categoryParamsSchema, body: categoryPermissionsBodySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId, categoryId } = req.params as CategoryParams;
    const body = req.body as z.infer<typeof categoryPermissionsBodySchema>;
    const access = await getForumAccess(guildId, auth);
    assertCanManageForum(access);
    await getCategoryRow(guildId, categoryId);

    await withClient(async (client) => {
      await client.query("BEGIN");
      try {
        await client.query("DELETE FROM forum_category_role_permissions WHERE category_id = $1", [categoryId]);

        for (const permission of body.permissions) {
          await client.query(
            `
              INSERT INTO forum_category_role_permissions (category_id, role_id, can_read, can_post, can_moderate)
              SELECT $1, r.id, $3, $4, $5
              FROM roles r
              WHERE r.id = $2
                AND r.guild_id = $6
            `,
            [categoryId, permission.roleId, permission.canRead, permission.canPost, permission.canModerate, guildId]
          );
        }

        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });

    res.json({ category: await getCategory(guildId, categoryId, access) });
  })
);

forumRouter.post(
  "/guilds/:guildId/forum/mutes",
  requireAuth,
  validate({ params: guildParamsSchema, body: muteMemberBodySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId } = req.params as GuildParams;
    const body = req.body as z.infer<typeof muteMemberBodySchema>;
    const access = await getForumAccess(guildId, auth);
    assertCanManageForum(access);

    if (body.memberId === access.memberId) {
      throw new BadRequestError("You cannot mute yourself");
    }

    await getGuildMemberRow(guildId, body.memberId);

    const result = await query<{ id: string }>(
      `
        INSERT INTO forum_member_mutes (guild_id, muted_member_id, muted_by_member_id, reason, muted_at, lifted_at)
        VALUES ($1, $2, $3, $4, now(), NULL)
        ON CONFLICT (guild_id, muted_member_id) WHERE lifted_at IS NULL
        DO UPDATE SET
          muted_by_member_id = EXCLUDED.muted_by_member_id,
          reason = EXCLUDED.reason,
          muted_at = now(),
          lifted_at = NULL
        RETURNING id::text
      `,
      [guildId, body.memberId, access.memberId, body.reason ?? null]
    );

    res.status(201).json({ mute: await getForumMute(guildId, result.rows[0]?.id) });
  })
);

forumRouter.delete(
  "/guilds/:guildId/forum/mutes/:memberId",
  requireAuth,
  validate({ params: muteParamsSchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId, memberId } = req.params as MuteParams;
    const access = await getForumAccess(guildId, auth);
    assertCanManageForum(access);

    const result = await query<{ id: string }>(
      `
        UPDATE forum_member_mutes
        SET lifted_at = now(),
            lifted_by_member_id = $3,
            lift_reason = 'Reactivation moderateur'
        WHERE guild_id = $1
          AND muted_member_id = $2
          AND lifted_at IS NULL
        RETURNING id::text
      `,
      [guildId, memberId, access.memberId]
    );

    if (!result.rows[0]) throw new NotFoundError("Forum mute not found");
    res.status(204).end();
  })
);

forumRouter.get(
  "/guilds/:guildId/forum/threads",
  requireAuth,
  validate({ params: guildParamsSchema, query: listThreadsQuerySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId } = req.params as GuildParams;
    const options = req.query as unknown as z.infer<typeof listThreadsQuerySchema>;
    const access = await getForumAccess(guildId, auth);

    res.json(await listThreads(guildId, access, options));
  })
);

forumRouter.post(
  "/guilds/:guildId/forum/threads",
  requireAuth,
  validate({ params: guildParamsSchema, body: createThreadBodySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId } = req.params as GuildParams;
    const body = req.body as z.infer<typeof createThreadBodySchema>;
    const access = await getForumAccess(guildId, auth);
    const category = await getCategoryRow(guildId, body.categoryId);
    const categoryAccess = await getCategoryAccess(category, access);

    assertCanSpeakInForum(access);
    if (!categoryAccess.canPost) throw new ForbiddenError("You cannot post in this forum category");
    if ((body.pinned || body.locked) && !categoryAccess.canModerate) {
      throw new ForbiddenError("Forum moderation permission is required");
    }

    const threadId = await withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const threadResult = await client.query<{ id: string }>(
          `
            INSERT INTO forum_threads (
              category_id,
              author_member_id,
              title,
              visibility,
              pinned_at,
              pinned_by_member_id,
              locked_at,
              locked_by_member_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id::text
          `,
          [
            body.categoryId,
            access.memberId,
            body.title,
            body.visibility,
            body.pinned ? new Date().toISOString() : null,
            body.pinned ? access.memberId : null,
            body.locked ? new Date().toISOString() : null,
            body.locked ? access.memberId : null
          ]
        );
        const createdThreadId = threadResult.rows[0]?.id;
        if (!createdThreadId) throw new BadRequestError("Forum thread could not be created");

        const postResult = await client.query<{ created_at: string }>(
          `
            INSERT INTO forum_posts (thread_id, author_member_id, body)
            VALUES ($1, $2, $3)
            RETURNING created_at::text
          `,
          [createdThreadId, access.memberId, body.body]
        );

        await client.query("UPDATE forum_threads SET last_post_at = $2 WHERE id = $1", [
          createdThreadId,
          postResult.rows[0]?.created_at ?? new Date().toISOString()
        ]);
        await client.query("COMMIT");
        return createdThreadId;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });

    res.status(201).json(await getThreadWithPosts(guildId, threadId, access, { page: 1, limit: 30 }));
  })
);

forumRouter.get(
  "/guilds/:guildId/forum/threads/:threadId",
  requireAuth,
  validate({ params: threadParamsSchema, query: listPostsQuerySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId, threadId } = req.params as ThreadParams;
    const pagination = req.query as unknown as z.infer<typeof listPostsQuerySchema>;
    const access = await getForumAccess(guildId, auth);

    res.json(await getThreadWithPosts(guildId, threadId, access, pagination));
  })
);

forumRouter.patch(
  "/guilds/:guildId/forum/threads/:threadId",
  requireAuth,
  validate({ params: threadParamsSchema, body: updateThreadBodySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId, threadId } = req.params as ThreadParams;
    const body = req.body as z.infer<typeof updateThreadBodySchema>;
    const access = await getForumAccess(guildId, auth);
    const thread = await getThreadRow(guildId, threadId);
    const currentCategory = await getCategoryRow(guildId, thread.category_id);
    const categoryAccess = await getCategoryAccess(currentCategory, access);

    if (!categoryAccess.canModerate && thread.author_member_id !== access.memberId) {
      throw new ForbiddenError("You cannot edit this thread");
    }

    if (!categoryAccess.canModerate && body.title !== undefined) {
      assertCanSpeakInForum(access);
    }

    if (
      (body.pinned !== undefined || body.locked !== undefined || body.categoryId || body.visibility !== undefined) &&
      !categoryAccess.canModerate
    ) {
      throw new ForbiddenError("Forum moderation permission is required");
    }

    if (body.categoryId) {
      const nextCategory = await getCategoryRow(guildId, body.categoryId);
      const nextAccess = await getCategoryAccess(nextCategory, access);
      if (!nextAccess.canModerate) throw new ForbiddenError("You cannot move to this category");
    }

    await query(
      `
        UPDATE forum_threads
        SET
          category_id = $3,
          title = $4,
          visibility = $5,
          pinned_at = $6,
          pinned_by_member_id = $7,
          locked_at = $8,
          locked_by_member_id = $9
        WHERE id = $1
          AND category_id IN (SELECT id FROM forum_categories WHERE guild_id = $2)
      `,
      [
        threadId,
        guildId,
        body.categoryId ?? thread.category_id,
        body.title ?? thread.title,
        body.visibility ?? thread.visibility,
        body.pinned === undefined ? thread.pinned_at : body.pinned ? thread.pinned_at ?? new Date().toISOString() : null,
        body.pinned === undefined ? thread.pinned_by_member_id : body.pinned ? access.memberId : null,
        body.locked === undefined ? thread.locked_at : body.locked ? thread.locked_at ?? new Date().toISOString() : null,
        body.locked === undefined ? thread.locked_by_member_id : body.locked ? access.memberId : null
      ]
    );

    res.json(await getThreadWithPosts(guildId, threadId, access, { page: 1, limit: 30 }));
  })
);

forumRouter.delete(
  "/guilds/:guildId/forum/threads/:threadId",
  requireAuth,
  validate({ params: threadParamsSchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId, threadId } = req.params as ThreadParams;
    const access = await getForumAccess(guildId, auth);
    const thread = await getThreadRow(guildId, threadId);
    const category = await getCategoryRow(guildId, thread.category_id);
    const categoryAccess = await getCategoryAccess(category, access);

    if (!categoryAccess.canModerate) {
      throw new ForbiddenError("Forum moderation permission is required");
    }

    const result = await query<{ id: string }>(
      `
        DELETE FROM forum_threads
        WHERE id = $1
          AND category_id IN (SELECT id FROM forum_categories WHERE guild_id = $2)
        RETURNING id::text
      `,
      [threadId, guildId]
    );

    if (!result.rows[0]) throw new NotFoundError("Forum thread not found");
    res.status(204).end();
  })
);

forumRouter.post(
  "/guilds/:guildId/forum/threads/:threadId/posts",
  requireAuth,
  validate({ params: threadParamsSchema, body: postBodySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId, threadId } = req.params as ThreadParams;
    const body = req.body as z.infer<typeof postBodySchema>;
    const access = await getForumAccess(guildId, auth);
    const thread = await getThreadRow(guildId, threadId);
    const category = await getCategoryRow(guildId, thread.category_id);
    const categoryAccess = await getCategoryAccess(category, access);

    assertCanSpeakInForum(access);
    if (!categoryAccess.canPost) throw new ForbiddenError("You cannot post in this forum thread");
    if (thread.locked_at && !categoryAccess.canModerate) throw new ForbiddenError("This forum thread is locked");

    const result = await query<{ id: string; created_at: string }>(
      `
        INSERT INTO forum_posts (thread_id, author_member_id, body)
        VALUES ($1, $2, $3)
        RETURNING id::text, created_at::text
      `,
      [threadId, access.memberId, body.body]
    );
    await query("UPDATE forum_threads SET last_post_at = $2 WHERE id = $1", [
      threadId,
      result.rows[0]?.created_at ?? new Date().toISOString()
    ]);

    res.status(201).json({ post: await getPost(guildId, threadId, result.rows[0]?.id, access) });
  })
);

forumRouter.patch(
  "/guilds/:guildId/forum/threads/:threadId/posts/:postId",
  requireAuth,
  validate({ params: postParamsSchema, body: updatePostBodySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId, threadId, postId } = req.params as PostParams;
    const body = req.body as z.infer<typeof updatePostBodySchema>;
    const access = await getForumAccess(guildId, auth);
    const context = await getPostContext(guildId, threadId, postId);
    const categoryAccess = await getCategoryAccess(context.category, access);
    const canEditOwn = context.post.author_member_id === access.memberId && !context.thread.locked_at && !context.post.deleted_at;

    if (!categoryAccess.canModerate && canEditOwn) {
      assertCanSpeakInForum(access);
    }

    if (!categoryAccess.canModerate && !canEditOwn) {
      throw new ForbiddenError("You cannot edit this forum post");
    }

    await query(
      `
        UPDATE forum_posts
        SET
          body = $4,
          edited_at = now(),
          edited_by_member_id = $5,
          moderation_note = CASE WHEN $6::text IS NULL THEN moderation_note ELSE $6::text END
        WHERE id = $3
          AND thread_id = $2
          AND thread_id IN (
            SELECT ft.id
            FROM forum_threads ft
            JOIN forum_categories fc ON fc.id = ft.category_id
            WHERE ft.id = $2
              AND fc.guild_id = $1
          )
      `,
      [guildId, threadId, postId, body.body, access.memberId, categoryAccess.canModerate ? body.moderationNote ?? null : null]
    );

    res.json({ post: await getPost(guildId, threadId, postId, access) });
  })
);

forumRouter.delete(
  "/guilds/:guildId/forum/threads/:threadId/posts/:postId",
  requireAuth,
  validate({ params: postParamsSchema, body: deletePostBodySchema.optional() }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const { guildId, threadId, postId } = req.params as PostParams;
    const body = (req.body || {}) as z.infer<typeof deletePostBodySchema>;
    const access = await getForumAccess(guildId, auth);
    const context = await getPostContext(guildId, threadId, postId);
    const categoryAccess = await getCategoryAccess(context.category, access);
    const canDeleteOwn = context.post.author_member_id === access.memberId && !context.thread.locked_at && !context.post.deleted_at;

    if (!categoryAccess.canModerate && !canDeleteOwn) {
      throw new ForbiddenError("You cannot delete this forum post");
    }

    await query(
      `
        UPDATE forum_posts
        SET
          deleted_at = COALESCE(deleted_at, now()),
          deleted_by_member_id = $4,
          moderation_note = $5
        WHERE id = $3
          AND thread_id = $2
          AND thread_id IN (
            SELECT ft.id
            FROM forum_threads ft
            JOIN forum_categories fc ON fc.id = ft.category_id
            WHERE ft.id = $2
              AND fc.guild_id = $1
          )
      `,
      [guildId, threadId, postId, access.memberId, body.moderationNote ?? null]
    );

    res.json({ post: await getPost(guildId, threadId, postId, access) });
  })
);

async function getForumAccess(guildId: string, auth: AuthContext): Promise<ForumAccess> {
  const guildAccess = await assertGuildAccess(database, guildId, auth.user.id);
  if (!guildAccess.member_id) {
    throw new ForbiddenError("Guild membership is required");
  }

  const roleResult = await query<{ role_id: string; role_code: string }>(
    `
      SELECT r.id::text AS role_id, r.code::text AS role_code
      FROM guild_members gm
      JOIN guild_member_roles gmr ON gmr.guild_member_id = gm.id
      JOIN roles r ON r.id = gmr.role_id
      WHERE gm.guild_id = $1
        AND gm.user_id = $2
      ORDER BY r.rank DESC, r.name ASC
    `,
    [guildId, auth.user.id]
  );
  const roleIds = roleResult.rows.map((role) => role.role_id);
  const roleCodes = roleResult.rows.map((role) => role.role_code);
  const canManage = await canManageForum(guildId, auth.user.id, guildAccess.organization_role, auth.user.globalRole);
  const mute = await getActiveForumMute(guildId, guildAccess.member_id);

  return {
    canManage,
    globalRole: auth.user.globalRole,
    mute,
    muted: Boolean(mute),
    memberId: guildAccess.member_id,
    organizationRole: guildAccess.organization_role,
    roleCodes,
    roleIds,
    userId: auth.user.id
  };
}

async function canManageForum(
  guildId: string,
  userId: string,
  organizationRole: string,
  globalRole: string
): Promise<boolean> {
  if (globalRole === "admin" || ["owner", "admin"].includes(organizationRole)) {
    return true;
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
        AND p.key IN ('moderate_forum', 'admin_all')
      LIMIT 1
    `,
    [guildId, userId]
  );

  return Boolean(result.rows[0]?.allowed);
}

function assertCanManageForum(access: ForumAccess): void {
  if (!access.canManage) {
    throw new ForbiddenError("Permission moderate_forum is required");
  }
}

function assertCanSpeakInForum(access: ForumAccess): void {
  if (access.muted) {
    throw new ForbiddenError("Vous etes en sourdine sur ce forum.");
  }
}

async function getGuildMemberRow(guildId: string, memberId: string) {
  const result = await query<{ id: string }>(
    `
      SELECT id::text
      FROM guild_members
      WHERE guild_id = $1
        AND id = $2
        AND status = 'active'
      LIMIT 1
    `,
    [guildId, memberId]
  );

  if (!result.rows[0]) throw new NotFoundError("Guild member not found");
  return result.rows[0];
}

async function getActiveForumMute(guildId: string, memberId: string): Promise<ForumMuteResource | null> {
  const result = await query<ForumMuteRow>(
    `
      SELECT
        mute.id::text,
        mute.guild_id::text,
        mute.muted_member_id::text,
        muted.nickname AS muted_member_name,
        mute.muted_by_member_id::text,
        moderator.nickname AS muted_by_name,
        mute.reason,
        mute.muted_at::text
      FROM forum_member_mutes mute
      JOIN guild_members muted ON muted.id = mute.muted_member_id
      LEFT JOIN guild_members moderator ON moderator.id = mute.muted_by_member_id
      WHERE mute.guild_id = $1
        AND mute.muted_member_id = $2
        AND mute.lifted_at IS NULL
      LIMIT 1
    `,
    [guildId, memberId]
  );

  const mute = result.rows[0];
  return mute ? formatForumMute(mute) : null;
}

async function getForumMute(guildId: string, muteId: string | undefined): Promise<ForumMuteResource> {
  if (!muteId) throw new NotFoundError("Forum mute not found");
  const result = await query<ForumMuteRow>(
    `
      SELECT
        mute.id::text,
        mute.guild_id::text,
        mute.muted_member_id::text,
        muted.nickname AS muted_member_name,
        mute.muted_by_member_id::text,
        moderator.nickname AS muted_by_name,
        mute.reason,
        mute.muted_at::text
      FROM forum_member_mutes mute
      JOIN guild_members muted ON muted.id = mute.muted_member_id
      LEFT JOIN guild_members moderator ON moderator.id = mute.muted_by_member_id
      WHERE mute.guild_id = $1
        AND mute.id = $2
        AND mute.lifted_at IS NULL
      LIMIT 1
    `,
    [guildId, muteId]
  );

  const mute = result.rows[0];
  if (!mute) throw new NotFoundError("Forum mute not found");
  return formatForumMute(mute);
}

async function listForumMutes(guildId: string): Promise<ForumMuteResource[]> {
  const result = await query<ForumMuteRow>(
    `
      SELECT
        mute.id::text,
        mute.guild_id::text,
        mute.muted_member_id::text,
        muted.nickname AS muted_member_name,
        mute.muted_by_member_id::text,
        moderator.nickname AS muted_by_name,
        mute.reason,
        mute.muted_at::text
      FROM forum_member_mutes mute
      JOIN guild_members muted ON muted.id = mute.muted_member_id
      LEFT JOIN guild_members moderator ON moderator.id = mute.muted_by_member_id
      WHERE mute.guild_id = $1
        AND mute.lifted_at IS NULL
      ORDER BY mute.muted_at DESC
    `,
    [guildId]
  );

  return result.rows.map(formatForumMute);
}

function formatForumMute(row: ForumMuteRow): ForumMuteResource {
  return {
    id: row.id,
    guildId: row.guild_id,
    memberId: row.muted_member_id,
    memberName: row.muted_member_name ?? "Membre",
    mutedByMemberId: row.muted_by_member_id,
    mutedByName: row.muted_by_name ?? "Moderation",
    reason: row.reason,
    mutedAt: row.muted_at
  };
}

async function listCategories(guildId: string, access: ForumAccess) {
  const [categoriesResult, permissionsResult] = await Promise.all([
    query<CategoryRow>(
      `
        SELECT
          fc.id::text,
          fc.name,
          fc.description,
          fc.sort_order,
          fc.visibility,
          count(DISTINCT ft.id)::text AS thread_count,
          count(fp.id) FILTER (WHERE fp.deleted_at IS NULL)::text AS post_count,
          max(fp.created_at)::text AS last_post_at
        FROM forum_categories fc
        LEFT JOIN forum_threads ft ON ft.category_id = fc.id
        LEFT JOIN forum_posts fp ON fp.thread_id = ft.id
        WHERE fc.guild_id = $1
        GROUP BY fc.id
        ORDER BY fc.sort_order ASC, fc.name ASC
      `,
      [guildId]
    ),
    getCategoryPermissions(guildId)
  ]);
  const permissionsByCategory = groupPermissionsByCategory(permissionsResult);

  return categoriesResult.rows
    .map((category) => formatCategory(category, permissionsByCategory.get(category.id) ?? [], access))
    .filter((category) => category.permissions.canRead);
}

async function getCategory(guildId: string, categoryId: string | undefined, access: ForumAccess) {
  if (!categoryId) throw new NotFoundError("Forum category not found");
  const category = await getCategoryRow(guildId, categoryId);
  const permissions = await getCategoryPermissions(guildId, categoryId);
  const formatted = formatCategory(category, permissions, access);
  if (!formatted.permissions.canRead) throw new NotFoundError("Forum category not found");
  return formatted;
}

async function getCategoryRow(guildId: string, categoryId: string): Promise<CategoryRow> {
  const result = await query<CategoryRow>(
    `
      SELECT
        fc.id::text,
        fc.name,
        fc.description,
        fc.sort_order,
        fc.visibility,
        count(DISTINCT ft.id)::text AS thread_count,
        count(fp.id) FILTER (WHERE fp.deleted_at IS NULL)::text AS post_count,
        max(fp.created_at)::text AS last_post_at
      FROM forum_categories fc
      LEFT JOIN forum_threads ft ON ft.category_id = fc.id
      LEFT JOIN forum_posts fp ON fp.thread_id = ft.id
      WHERE fc.guild_id = $1
        AND fc.id = $2
      GROUP BY fc.id
      LIMIT 1
    `,
    [guildId, categoryId]
  );
  const category = result.rows[0];
  if (!category) throw new NotFoundError("Forum category not found");
  return category;
}

async function getCategoryPermissions(guildId: string, categoryId?: string): Promise<CategoryPermissionRow[]> {
  const result = await query<CategoryPermissionRow>(
    `
      SELECT
        fcrp.category_id::text,
        r.id::text AS role_id,
        r.code::text AS role_code,
        r.name AS role_name,
        fcrp.can_read,
        fcrp.can_post,
        fcrp.can_moderate
      FROM forum_category_role_permissions fcrp
      JOIN roles r ON r.id = fcrp.role_id
      JOIN forum_categories fc ON fc.id = fcrp.category_id
      WHERE fc.guild_id = $1
        AND ($2::uuid IS NULL OR fc.id = $2::uuid)
      ORDER BY r.rank DESC, r.name ASC
    `,
    [guildId, categoryId ?? null]
  );

  return result.rows;
}

function formatCategory(category: CategoryRow, permissions: CategoryPermissionRow[], access: ForumAccess) {
  const effectivePermissions = computeCategoryPermissions(category, permissions, access);

  return {
    id: category.id,
    name: category.name,
    description: category.description,
    sortOrder: category.sort_order,
    visibility: category.visibility,
    threadCount: Number(category.thread_count),
    postCount: Number(category.post_count),
    lastPostAt: category.last_post_at,
    rolePermissions: permissions.map((permission) => ({
      roleId: permission.role_id,
      roleCode: permission.role_code,
      roleName: permission.role_name,
      canRead: permission.can_read,
      canPost: permission.can_post,
      canModerate: permission.can_moderate
    })),
    permissions: effectivePermissions
  };
}

async function getCategoryAccess(category: CategoryRow, access: ForumAccess) {
  const permissions = await getCategoryPermissionsForAccess(category.id, access);
  return computeCategoryPermissions(category, permissions, access);
}

async function getCategoryPermissionsForAccess(categoryId: string, access: ForumAccess): Promise<CategoryPermissionRow[]> {
  if (!access.roleIds.length) return [];

  const result = await query<CategoryPermissionRow>(
    `
      SELECT
        fcrp.category_id::text,
        r.id::text AS role_id,
        r.code::text AS role_code,
        r.name AS role_name,
        fcrp.can_read,
        fcrp.can_post,
        fcrp.can_moderate
      FROM forum_category_role_permissions fcrp
      JOIN roles r ON r.id = fcrp.role_id
      WHERE fcrp.category_id = $1
        AND fcrp.role_id = ANY($2::uuid[])
    `,
    [categoryId, access.roleIds]
  );

  return result.rows;
}

function computeCategoryPermissions(category: CategoryRow, permissions: CategoryPermissionRow[], access: ForumAccess) {
  if (access.canManage) {
    return { canRead: true, canPost: !access.muted, canModerate: true };
  }

  const matchingPermissions = permissions.filter((permission) => access.roleIds.includes(permission.role_id));
  const hasCustomPermission = matchingPermissions.length > 0;
  const visibilityAllowsRead = canReadByVisibility(category.visibility, access);
  const canRead = hasCustomPermission ? matchingPermissions.some((permission) => permission.can_read) : visibilityAllowsRead;
  const canPost =
    !access.muted && canRead && (hasCustomPermission ? matchingPermissions.some((permission) => permission.can_post) : visibilityAllowsRead);
  const canModerate = matchingPermissions.some((permission) => permission.can_moderate);

  return { canRead, canPost, canModerate };
}

function canReadByVisibility(visibility: ForumVisibility, access: ForumAccess): boolean {
  if (visibility === "public" || visibility === "members") return true;
  if (visibility === "officers") return access.roleCodes.some((role) => ["officier", "admin"].includes(role));
  return access.roleCodes.includes("admin");
}

async function listForumRoles(guildId: string) {
  const result = await query<{
    id: string;
    code: string;
    name: string;
    rank: number;
  }>(
    `
      SELECT id::text, code::text, name, rank
      FROM roles
      WHERE guild_id = $1
      ORDER BY rank DESC, name ASC
    `,
    [guildId]
  );

  return result.rows.map((role) => ({
    id: role.id,
    code: role.code,
    name: role.name,
    rank: role.rank
  }));
}

async function listThreads(
  guildId: string,
  access: ForumAccess,
  options: z.infer<typeof listThreadsQuerySchema>
) {
  const categories = await listCategories(guildId, access);
  const allowedCategoryIds = categories
    .filter((category) => category.permissions.canRead)
    .map((category) => category.id)
    .filter((categoryId) => !options.categoryId || categoryId === options.categoryId);

  if (options.categoryId && !allowedCategoryIds.includes(options.categoryId)) {
    throw new NotFoundError("Forum category not found");
  }

  if (!allowedCategoryIds.length) {
    return emptyPage("threads", options.page, options.limit);
  }

  const offset = (options.page - 1) * options.limit;
  const [itemsResult, countResult] = await Promise.all([
    query<ThreadListRow>(
      `
        SELECT
          ft.id::text,
          ft.category_id::text,
          fc.name AS category_name,
          ft.author_member_id::text,
          author.nickname AS author_name,
          ft.title,
          ft.visibility,
          ft.pinned_at::text,
          ft.locked_at::text,
          ft.last_post_at::text,
          ft.created_at::text,
          ft.updated_at::text,
          count(fp.id) FILTER (WHERE fp.deleted_at IS NULL)::int AS post_count,
          count(fp.id) FILTER (WHERE fp.deleted_at IS NULL)::int - 1 AS reply_count,
          count(fp.id) FILTER (
            WHERE fp.deleted_at IS NULL
              AND fp.author_member_id IS DISTINCT FROM $5::uuid
              AND (ftr.last_read_at IS NULL OR fp.created_at > ftr.last_read_at)
          )::int AS unread_count,
          (
            ftr.last_read_at IS NULL
            AND ft.author_member_id IS DISTINCT FROM $5::uuid
          ) AS new_topic,
          ftr.last_read_at::text,
          (
            SELECT body
            FROM forum_posts first_post
            WHERE first_post.thread_id = ft.id
              AND first_post.deleted_at IS NULL
            ORDER BY first_post.created_at ASC
            LIMIT 1
          ) AS preview
        FROM forum_threads ft
        JOIN forum_categories fc ON fc.id = ft.category_id
        LEFT JOIN guild_members author ON author.id = ft.author_member_id
        LEFT JOIN forum_posts fp ON fp.thread_id = ft.id
        LEFT JOIN forum_thread_reads ftr ON ftr.thread_id = ft.id AND ftr.member_id = $5
        WHERE fc.guild_id = $1
          AND ft.category_id = ANY($2::uuid[])
        GROUP BY ft.id, fc.name, author.nickname, ftr.last_read_at
        ORDER BY ft.pinned_at DESC NULLS LAST, COALESCE(ft.last_post_at, ft.created_at) DESC
        LIMIT $3 OFFSET $4
      `,
      [guildId, allowedCategoryIds, options.limit, offset, access.memberId]
    ),
    query<{ count: string }>(
      `
        SELECT count(*)::text
        FROM forum_threads ft
        JOIN forum_categories fc ON fc.id = ft.category_id
        WHERE fc.guild_id = $1
          AND ft.category_id = ANY($2::uuid[])
      `,
      [guildId, allowedCategoryIds]
    )
  ]);

  return buildPage(
    "threads",
    itemsResult.rows.map(formatThreadListItem),
    Number(countResult.rows[0]?.count ?? 0),
    options.page,
    options.limit
  );
}

type ThreadListRow = {
  id: string;
  category_id: string;
  category_name: string;
  author_member_id: string | null;
  author_name: string | null;
  title: string;
  visibility: ForumThreadVisibility;
  pinned_at: string | null;
  locked_at: string | null;
  last_post_at: string | null;
  created_at: string;
  updated_at: string;
  post_count: number;
  reply_count: number;
  unread_count: number;
  new_topic: boolean;
  last_read_at: string | null;
  preview: string | null;
};

function formatThreadListItem(row: ThreadListRow) {
  return {
    id: row.id,
    categoryId: row.category_id,
    categoryName: row.category_name,
    authorMemberId: row.author_member_id,
    authorName: row.author_name ?? "Membre",
    title: row.title,
    visibility: row.visibility,
    pinned: Boolean(row.pinned_at),
    pinnedAt: row.pinned_at,
    locked: Boolean(row.locked_at),
    lockedAt: row.locked_at,
    lastPostAt: row.last_post_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    postCount: Number(row.post_count),
    replyCount: Math.max(0, Number(row.reply_count)),
    unreadCount: Math.max(0, Number(row.unread_count ?? 0)),
    newTopic: Boolean(row.new_topic),
    lastReadAt: row.last_read_at,
    preview: row.preview ?? ""
  };
}

async function getThreadWithPosts(
  guildId: string,
  threadId: string,
  access: ForumAccess,
  pagination: z.infer<typeof listPostsQuerySchema>
) {
  const thread = await getThreadRow(guildId, threadId);
  const category = await getCategoryRow(guildId, thread.category_id);
  const categoryAccess = await getCategoryAccess(category, access);
  if (!categoryAccess.canRead) throw new NotFoundError("Forum thread not found");
  const lastReadAt = await markForumThreadRead(guildId, threadId, access.memberId);

  const offset = (pagination.page - 1) * pagination.limit;
  const [postsResult, countResult] = await Promise.all([
    query<PostRow>(
      `
        SELECT
          fp.id::text,
          fp.thread_id::text,
          fp.author_member_id::text,
          author.nickname AS author_name,
          fp.body,
          fp.edited_at::text,
          fp.deleted_at::text,
          fp.moderation_note,
          fp.created_at::text
        FROM forum_posts fp
        LEFT JOIN guild_members author ON author.id = fp.author_member_id
        WHERE fp.thread_id = $1
        ORDER BY fp.created_at ASC
        LIMIT $2 OFFSET $3
      `,
      [threadId, pagination.limit, offset]
    ),
    query<{ count: string }>("SELECT count(*)::text FROM forum_posts WHERE thread_id = $1", [threadId])
  ]);

  return {
    thread: {
      ...formatThreadDetail(thread, category, categoryAccess, access),
      unreadCount: 0,
      newTopic: false,
      lastReadAt
    },
    posts: postsResult.rows.map((post) => formatPost(post, categoryAccess.canModerate)),
    pagination: pageMeta(Number(countResult.rows[0]?.count ?? 0), pagination.page, pagination.limit)
  };
}

type ThreadRow = ThreadListRow & {
  pinned_by_member_id: string | null;
  locked_by_member_id: string | null;
};

async function getThreadRow(guildId: string, threadId: string): Promise<ThreadRow> {
  const result = await query<ThreadRow>(
    `
      SELECT
        ft.id::text,
        ft.category_id::text,
        fc.name AS category_name,
        ft.author_member_id::text,
        author.nickname AS author_name,
        ft.title,
        ft.visibility,
        ft.pinned_at::text,
        ft.pinned_by_member_id::text,
        ft.locked_at::text,
        ft.locked_by_member_id::text,
        ft.last_post_at::text,
        ft.created_at::text,
        ft.updated_at::text,
        count(fp.id) FILTER (WHERE fp.deleted_at IS NULL)::int AS post_count,
        count(fp.id) FILTER (WHERE fp.deleted_at IS NULL)::int - 1 AS reply_count,
        0::int AS unread_count,
        false AS new_topic,
        NULL::text AS last_read_at,
        (
          SELECT body
          FROM forum_posts first_post
          WHERE first_post.thread_id = ft.id
            AND first_post.deleted_at IS NULL
          ORDER BY first_post.created_at ASC
          LIMIT 1
        ) AS preview
      FROM forum_threads ft
      JOIN forum_categories fc ON fc.id = ft.category_id
      LEFT JOIN guild_members author ON author.id = ft.author_member_id
      LEFT JOIN forum_posts fp ON fp.thread_id = ft.id
      WHERE fc.guild_id = $1
        AND ft.id = $2
      GROUP BY ft.id, fc.name, author.nickname
      LIMIT 1
    `,
    [guildId, threadId]
  );
  const thread = result.rows[0];
  if (!thread) throw new NotFoundError("Forum thread not found");
  return thread;
}

type ForumUnreadCounters = {
  unreadMessages: number;
  unreadThreads: number;
  newThreads: number;
};

async function countForumUnread(guildId: string, access: ForumAccess, categoryIds: string[]): Promise<ForumUnreadCounters> {
  if (!categoryIds.length) {
    return { unreadMessages: 0, unreadThreads: 0, newThreads: 0 };
  }

  const result = await query<{
    unread_messages: string;
    unread_threads: string;
    new_threads: string;
  }>(
    `
      SELECT
        count(fp.id) FILTER (
          WHERE fp.id IS NOT NULL
            AND fp.author_member_id IS DISTINCT FROM $3::uuid
            AND (ftr.last_read_at IS NULL OR fp.created_at > ftr.last_read_at)
        )::text AS unread_messages,
        count(DISTINCT ft.id) FILTER (
          WHERE fp.id IS NOT NULL
            AND fp.author_member_id IS DISTINCT FROM $3::uuid
            AND (ftr.last_read_at IS NULL OR fp.created_at > ftr.last_read_at)
        )::text AS unread_threads,
        count(DISTINCT ft.id) FILTER (
          WHERE ftr.last_read_at IS NULL
            AND ft.author_member_id IS DISTINCT FROM $3::uuid
        )::text AS new_threads
      FROM forum_threads ft
      JOIN forum_categories fc ON fc.id = ft.category_id
      LEFT JOIN forum_posts fp ON fp.thread_id = ft.id AND fp.deleted_at IS NULL
      LEFT JOIN forum_thread_reads ftr ON ftr.thread_id = ft.id AND ftr.member_id = $3
      WHERE fc.guild_id = $1
        AND ft.category_id = ANY($2::uuid[])
    `,
    [guildId, categoryIds, access.memberId]
  );
  const row = result.rows[0];

  return {
    unreadMessages: Number(row?.unread_messages ?? 0),
    unreadThreads: Number(row?.unread_threads ?? 0),
    newThreads: Number(row?.new_threads ?? 0)
  };
}

async function markForumThreadRead(guildId: string, threadId: string, memberId: string) {
  const result = await query<{ last_read_at: string }>(
    `
      INSERT INTO forum_thread_reads (guild_id, thread_id, member_id, last_read_at)
      VALUES ($1, $2, $3, now())
      ON CONFLICT (thread_id, member_id)
      DO UPDATE SET
        guild_id = EXCLUDED.guild_id,
        last_read_at = now(),
        updated_at = now()
      RETURNING last_read_at::text
    `,
    [guildId, threadId, memberId]
  );

  return result.rows[0]?.last_read_at ?? new Date().toISOString();
}

function formatThreadDetail(
  thread: ThreadRow,
  category: CategoryRow,
  categoryAccess: { canRead: boolean; canPost: boolean; canModerate: boolean },
  access: ForumAccess
) {
  return {
    ...formatThreadListItem(thread),
    category: {
      id: category.id,
      name: category.name,
      visibility: category.visibility
    },
    permissions: {
      canReply: categoryAccess.canPost && (!thread.locked_at || categoryAccess.canModerate),
      canModerate: categoryAccess.canModerate,
      canEdit: categoryAccess.canModerate || (!access.muted && thread.author_member_id === access.memberId),
      muted: access.muted
    }
  };
}

type PostRow = {
  id: string;
  thread_id: string;
  author_member_id: string | null;
  author_name: string | null;
  body: string;
  edited_at: string | null;
  deleted_at: string | null;
  moderation_note: string | null;
  created_at: string;
};

function formatPost(post: PostRow, canModerate: boolean) {
  const deleted = Boolean(post.deleted_at);

  return {
    id: post.id,
    threadId: post.thread_id,
    authorMemberId: post.author_member_id,
    authorName: post.author_name ?? "Membre",
    body: deleted && !canModerate ? "" : post.body,
    deleted,
    deletedAt: post.deleted_at,
    edited: Boolean(post.edited_at),
    editedAt: post.edited_at,
    moderationNote: canModerate ? post.moderation_note : null,
    createdAt: post.created_at
  };
}

async function getPost(guildId: string, threadId: string, postId: string | undefined, access: ForumAccess) {
  if (!postId) throw new NotFoundError("Forum post not found");
  const context = await getPostContext(guildId, threadId, postId);
  const categoryAccess = await getCategoryAccess(context.category, access);
  if (!categoryAccess.canRead) throw new NotFoundError("Forum post not found");
  return formatPost(context.post, categoryAccess.canModerate);
}

async function getPostContext(guildId: string, threadId: string, postId: string) {
  const [thread, post] = await Promise.all([getThreadRow(guildId, threadId), getPostRow(guildId, threadId, postId)]);
  const category = await getCategoryRow(guildId, thread.category_id);
  return { category, post, thread };
}

async function getPostRow(guildId: string, threadId: string, postId: string): Promise<PostRow> {
  const result = await query<PostRow>(
    `
      SELECT
        fp.id::text,
        fp.thread_id::text,
        fp.author_member_id::text,
        author.nickname AS author_name,
        fp.body,
        fp.edited_at::text,
        fp.deleted_at::text,
        fp.moderation_note,
        fp.created_at::text
      FROM forum_posts fp
      JOIN forum_threads ft ON ft.id = fp.thread_id
      JOIN forum_categories fc ON fc.id = ft.category_id
      LEFT JOIN guild_members author ON author.id = fp.author_member_id
      WHERE fc.guild_id = $1
        AND fp.thread_id = $2
        AND fp.id = $3
      LIMIT 1
    `,
    [guildId, threadId, postId]
  );
  const post = result.rows[0];
  if (!post) throw new NotFoundError("Forum post not found");
  return post;
}

function groupPermissionsByCategory(permissions: CategoryPermissionRow[]) {
  return permissions.reduce((map, permission) => {
    const current = map.get(permission.category_id) ?? [];
    current.push(permission);
    map.set(permission.category_id, current);
    return map;
  }, new Map<string, CategoryPermissionRow[]>());
}

function buildPage<T>(key: string, items: T[], total: number, page: number, limit: number) {
  return {
    [key]: items,
    pagination: pageMeta(total, page, limit)
  };
}

function emptyPage(key: string, page: number, limit: number) {
  return buildPage(key, [], 0, page, limit);
}

function pageMeta(total: number, page: number, limit: number) {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    hasNextPage: page * limit < total,
    hasPreviousPage: page > 1
  };
}

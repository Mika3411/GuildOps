import {
  getRoleLabel,
  permissionRoles
} from "../rbac.js";
import {
  slugify
} from "../guildSiteStore.js";

export function getLocalForumCategoryCatalog() {
  return [
    {
      id: "strategy",
      name: "Strategie",
      description: "Plans, objectifs et rapports de guerre",
      visibility: "members",
    },
    {
      id: "diplomacy",
      name: "Diplomatie",
      description: "NAP, zones interdites et contacts externes",
      visibility: "officers",
    },
    {
      id: "operations",
      name: "Operations",
      description: "Consignes de guilde et suivi quotidien",
      visibility: "members",
    },
  ];
}

export function getLocalForumCategoryForThread(index = 0) {
  const categories = getLocalForumCategoryCatalog();
  return categories[index === 1 ? 1 : index === 2 ? 2 : 0] || categories[0];
}

export function buildLocalForumCategories(threads = []) {
  const localThreads = buildLocalForumThreads(threads);

  return getLocalForumCategoryCatalog().map((category, index) => {
    const categoryThreads = localThreads.filter((thread) => thread.categoryId === category.id);
    const postCount = categoryThreads.reduce((total, thread) => total + Number(thread.postCount || 0), 0);

    return {
      ...category,
      sortOrder: index + 1,
      threadCount: categoryThreads.length,
      postCount,
      lastPostAt: categoryThreads[0]?.lastPostAt || null,
      permissions: { canRead: true, canPost: true, canModerate: true },
      rolePermissions: [],
    };
  });
}

export function buildLocalForumCounters(threads = []) {
  const localThreads = buildLocalForumThreads(threads);

  return {
    categories: getLocalForumCategoryCatalog().length,
    threads: localThreads.length,
    posts: localThreads.reduce((total, thread) => total + Number(thread.postCount || 0), 0),
    locked: localThreads.filter((thread) => thread.locked).length,
  };
}

export function buildLocalForumThreads(threads = []) {
  return threads.map((thread, index) => {
    const category = getLocalForumCategoryForThread(index);
    const replies = Number(thread.replyCount ?? thread.replies ?? 0);

    return normalizeForumThread({
      id: thread.id || `local-thread-${slugify(thread.title || `thread-${index + 1}`)}`,
      categoryId: thread.categoryId || category.id,
      categoryName: thread.categoryName || category.name,
      authorName: thread.authorName || thread.author || "Membre",
      title: thread.title || `Sujet ${index + 1}`,
      pinned: thread.pinned ?? index === 0,
      locked: Boolean(thread.locked),
      createdAt: thread.createdAt || new Date(Date.now() - (index + 1) * 3600000).toISOString(),
      updatedAt: thread.updatedAt || null,
      lastPostAt: thread.lastPostAt || thread.createdAt || null,
      postCount: Number(thread.postCount ?? replies + 1),
      replyCount: replies,
      preview: thread.preview || "Discussion de guilde en attente de synchronisation.",
    });
  });
}

export function buildLocalForumPosts(thread, body, authorName = "GuildOps") {
  if (!thread) return [];

  return [
    normalizeForumPost({
      id: `${thread.id}-post-1`,
      threadId: thread.id,
      authorName: body ? authorName : thread.authorName,
      body: body || thread.preview || "Premier message de discussion.",
      createdAt: thread.createdAt || new Date().toISOString(),
    }),
  ];
}

export function createForumThreadDraft(overrides = {}) {
  return {
    categoryId: "strategy",
    title: "",
    body: "",
    visibility: "members",
    pinned: false,
    locked: false,
    ...overrides,
  };
}

export function createForumCategoryDraft(overrides = {}) {
  return {
    id: "",
    name: "",
    description: "",
    sortOrder: 0,
    visibility: "members",
    ...overrides,
  };
}

export function normalizeForumCategory(category = {}) {
  const id = category.id || (category.name ? slugify(category.name) : "");

  return {
    id,
    name: category.name || "Categorie",
    description: category.description || "",
    sortOrder: Number(category.sortOrder ?? category.sort_order ?? 0),
    visibility: category.visibility || "members",
    threadCount: Number(category.threadCount ?? category.thread_count ?? 0),
    postCount: Number(category.postCount ?? category.post_count ?? 0),
    lastPostAt: category.lastPostAt || category.last_post_at || null,
    rolePermissions: category.rolePermissions || category.role_permissions || [],
    permissions: {
      canRead: category.permissions?.canRead ?? category.permissions?.can_read ?? true,
      canPost: category.permissions?.canPost ?? category.permissions?.can_post ?? true,
      canModerate: category.permissions?.canModerate ?? category.permissions?.can_moderate ?? false,
    },
  };
}

export function normalizeForumRole(role = {}) {
  return {
    id: role.id || role.code || role.role || role.name,
    code: role.code || role.role || "",
    name: role.name || role.role || getRoleLabel(role.code || role.role || "membre"),
    rank: Number(role.rank || 0),
  };
}

export function normalizeForumThread(thread = {}) {
  const createdAt = thread.createdAt || thread.created_at || new Date().toISOString();
  const locked = Boolean(thread.locked ?? thread.lockedAt ?? thread.locked_at);
  const pinned = Boolean(thread.pinned ?? thread.pinnedAt ?? thread.pinned_at);

  return {
    id: thread.id || `local-thread-${Date.now()}`,
    categoryId: thread.categoryId || thread.category_id || thread.category?.id || "strategy",
    categoryName: thread.categoryName || thread.category_name || thread.category?.name || "Strategie",
    authorMemberId: thread.authorMemberId || thread.author_member_id || null,
    authorName: thread.authorName || thread.author_name || thread.author || "Membre",
    title: thread.title || "Sujet de guilde",
    visibility: thread.visibility || "members",
    pinned,
    pinnedAt: thread.pinnedAt || thread.pinned_at || null,
    locked,
    lockedAt: thread.lockedAt || thread.locked_at || null,
    lastPostAt: thread.lastPostAt || thread.last_post_at || createdAt,
    createdAt,
    updatedAt: thread.updatedAt || thread.updated_at || createdAt,
    postCount: Number(thread.postCount ?? thread.post_count ?? 1),
    replyCount: Math.max(0, Number(thread.replyCount ?? thread.reply_count ?? thread.replies ?? 0)),
    preview: thread.preview || "",
    permissions: {
      canReply: thread.permissions?.canReply ?? thread.permissions?.can_reply ?? !locked,
      canModerate: thread.permissions?.canModerate ?? thread.permissions?.can_moderate ?? false,
      canEdit: thread.permissions?.canEdit ?? thread.permissions?.can_edit ?? false,
      muted: thread.permissions?.muted ?? false,
    },
  };
}

export function normalizeForumPost(post = {}) {
  const deleted = Boolean(post.deleted ?? post.deletedAt ?? post.deleted_at);
  const edited = Boolean(post.edited ?? post.editedAt ?? post.edited_at);

  return {
    id: post.id || `local-post-${Date.now()}`,
    threadId: post.threadId || post.thread_id || "",
    authorMemberId: post.authorMemberId || post.author_member_id || null,
    authorName: post.authorName || post.author_name || post.author || "Membre",
    body: deleted ? post.body || "" : post.body || "",
    deleted,
    deletedAt: post.deletedAt || post.deleted_at || null,
    edited,
    editedAt: post.editedAt || post.edited_at || null,
    moderationNote: post.moderationNote || post.moderation_note || null,
    createdAt: post.createdAt || post.created_at || new Date().toISOString(),
  };
}

export function normalizeForumMute(mute = {}) {
  return {
    id: mute.id || `${mute.memberId || mute.member_id || "member"}-mute`,
    guildId: mute.guildId || mute.guild_id || "",
    memberId: mute.memberId || mute.member_id || "",
    memberName: mute.memberName || mute.member_name || mute.nickname || "Membre",
    mutedByMemberId: mute.mutedByMemberId || mute.muted_by_member_id || null,
    mutedByName: mute.mutedByName || mute.muted_by_name || "Moderation",
    reason: mute.reason || "",
    mutedAt: mute.mutedAt || mute.muted_at || new Date().toISOString(),
  };
}

export function buildPublicForumSnapshot({ categories = [], threads = [] } = {}) {
  const normalizedCategories = categories.map(normalizeForumCategory);
  const publicCategories = normalizedCategories.filter((category) => category.visibility === "public");
  const publicCategoryIds = new Set(publicCategories.map((category) => category.id));
  const normalizedThreads = threads.map(normalizeForumThread);
  const publicThreads = normalizedThreads
    .filter((thread) => publicCategoryIds.has(thread.categoryId) && thread.visibility === "public")
    .map((thread) => ({
      id: thread.id,
      categoryId: thread.categoryId,
      categoryName: thread.categoryName,
      authorName: thread.authorName,
      title: thread.title,
      preview: thread.preview,
      pinned: thread.pinned,
      locked: thread.locked,
      replyCount: thread.replyCount,
      postCount: thread.postCount,
      lastPostAt: thread.lastPostAt,
      createdAt: thread.createdAt,
      visibility: thread.visibility,
    }));

  return {
    configured: publicCategories.length > 0 || publicThreads.length > 0,
    categories: publicCategories.map((category) => ({
      id: category.id,
      name: category.name,
      description: category.description,
      threadCount: category.threadCount,
      postCount: category.postCount,
      lastPostAt: category.lastPostAt,
      visibility: "public",
    })),
    threads: publicThreads,
    latestThreads: publicThreads,
    locked: {
      privateCategoryCount: Math.max(0, normalizedCategories.length - publicCategories.length),
      privateThreadCount: Math.max(0, normalizedThreads.length - publicThreads.length),
      note: "Les espaces membres, officiers et admins restent verrouilles.",
    },
  };
}

export function getForumVisibilityLabel(visibility) {
  return (
    {
      public: "Public",
      members: "Membres",
      officers: "Officiers",
      admins: "Admins",
    }[visibility] || "Membres"
  );
}

export function buildForumPermissionDraft(category, roles = []) {
  const rolePermissions = category?.rolePermissions || [];
  const fallbackRoles = permissionRoles.map((role) => normalizeForumRole(role));
  const availableRoles = roles.length ? roles.map(normalizeForumRole) : fallbackRoles;

  return availableRoles.map((role) => {
    const existing = rolePermissions.find((permission) => {
      return permission.roleId === role.id || permission.role_id === role.id || permission.roleCode === role.code || permission.role_code === role.code;
    });

    return {
      roleId: role.id,
      roleName: role.name,
      canRead: existing?.canRead ?? existing?.can_read ?? true,
      canPost: existing?.canPost ?? existing?.can_post ?? true,
      canModerate: existing?.canModerate ?? existing?.can_moderate ?? false,
    };
  });
}

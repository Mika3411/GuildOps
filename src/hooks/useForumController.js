import {
  useEffect,
  useState
} from "react";
import {
  forumThreads
} from "../data/guildOpsMockData.js";
import {
  guildOpsApi
} from "../lib/guildOpsApi.js";
import {
  can
} from "../lib/rbac.js";
import {
  appendUniqueById,
  buildLocalForumCategories,
  buildLocalForumCounters,
  buildLocalForumPosts,
  buildLocalForumThreads,
  createForumCategoryDraft,
  createForumThreadDraft,
  createLocalPagination,
  getApiGuildId,
  normalizeForumCategory,
  normalizeForumPost,
  normalizeForumRole,
  normalizeForumThread
} from "../lib/guildOpsTransforms.js";

export function useForumController({ apiEnabled, currentUser, selectedGuild, moduleEnabled = true }) {
  const [forumCategories, setForumCategories] = useState(() => (moduleEnabled && !apiEnabled ? buildLocalForumCategories(forumThreads) : []));
  const [forumRoles, setForumRoles] = useState([]);
  const [forumCounters, setForumCounters] = useState(() =>
    moduleEnabled && !apiEnabled ? buildLocalForumCounters(forumThreads) : { categories: 0, threads: 0, posts: 0, locked: 0 },
  );
  const [forumCanManage, setForumCanManage] = useState(() => moduleEnabled && can(currentUser, "moderate_forum"));
  const [activeForumCategoryId, setActiveForumCategoryId] = useState(() =>
    moduleEnabled && !apiEnabled ? buildLocalForumCategories(forumThreads)[0]?.id || "" : "",
  );
  const [forumThreadsState, setForumThreadsState] = useState(() => buildLocalForumThreads(moduleEnabled && !apiEnabled ? forumThreads : []));
  const [activeForumThread, setActiveForumThread] = useState(() => (moduleEnabled && !apiEnabled ? buildLocalForumThreads(forumThreads)[0] || null : null));
  const [forumPosts, setForumPosts] = useState(() => (moduleEnabled && !apiEnabled ? buildLocalForumPosts(buildLocalForumThreads(forumThreads)[0]) : []));
  const [forumThreadPagination, setForumThreadPagination] = useState(() => createLocalPagination(moduleEnabled && !apiEnabled ? forumThreads.length : 0));
  const [forumPostPagination, setForumPostPagination] = useState(() => createLocalPagination(1));
  const [forumThreadDraft, setForumThreadDraft] = useState(() => createForumThreadDraft());
  const [forumReplyDraft, setForumReplyDraft] = useState("");
  const [forumCategoryDraft, setForumCategoryDraft] = useState(() => createForumCategoryDraft());
  const [forumEditingPostId, setForumEditingPostId] = useState("");
  const [forumError, setForumError] = useState("");
  const [forumLoading, setForumLoading] = useState(false);

  useEffect(() => {
    const demoForumThreads = moduleEnabled && !apiEnabled ? forumThreads : [];
    const localForumCategories = moduleEnabled && !apiEnabled ? buildLocalForumCategories(demoForumThreads) : [];
    const localForumThreads = buildLocalForumThreads(demoForumThreads);
    setForumCategories(localForumCategories);
    if (!moduleEnabled) setForumRoles([]);
    setForumCounters(moduleEnabled && !apiEnabled ? buildLocalForumCounters(demoForumThreads) : { categories: 0, threads: 0, posts: 0, locked: 0 });
    setForumCanManage(moduleEnabled && can(currentUser, "moderate_forum"));
    const localForumCategoryId = localForumCategories.find((category) => category.id === activeForumCategoryId)?.id || localForumCategories[0]?.id || "";
    setActiveForumCategoryId(localForumCategoryId);
    setForumThreadDraft((current) => ({
      ...current,
      categoryId: localForumCategories.some((category) => category.id === current.categoryId)
        ? current.categoryId
        : localForumCategoryId,
    }));
    setForumThreadsState(localForumThreads);
    setActiveForumThread((current) => localForumThreads.find((thread) => thread.id === current?.id) || localForumThreads[0] || null);
    setForumPosts((current) => (moduleEnabled && !apiEnabled ? current.length ? current : buildLocalForumPosts(localForumThreads[0]) : []));
    setForumThreadPagination(createLocalPagination(localForumThreads.length));
    setForumPostPagination(createLocalPagination(1));
  }, [apiEnabled, currentUser, moduleEnabled]);

  useEffect(() => {
    const guildId = getApiGuildId(selectedGuild);

    if (!moduleEnabled || !apiEnabled || !guildId) {
      setForumLoading(false);
      setForumError("");
      return undefined;
    }

    const controller = new AbortController();
    setForumLoading(true);
    setForumError("");

    guildOpsApi
      .getForum(guildId, { signal: controller.signal })
      .then((payload) => {
        const categories = (payload?.categories || []).map(normalizeForumCategory);
        setForumCategories(categories);
        setForumRoles((payload?.roles || []).map(normalizeForumRole));
        setForumCounters(payload?.counters || buildLocalForumCounters([]));
        setForumCanManage(Boolean(payload?.canManage));
        const nextCategoryId = categories.find((category) => category.id === activeForumCategoryId)?.id || categories[0]?.id || "";
        setActiveForumCategoryId(nextCategoryId);
        setForumThreadDraft((current) => ({
          ...current,
          categoryId: categories.some((category) => category.id === current.categoryId) ? current.categoryId : nextCategoryId,
        }));
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setForumError(error?.message || "Forum indisponible.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setForumLoading(false);
      });

    return () => controller.abort();
  }, [activeForumCategoryId, apiEnabled, moduleEnabled, selectedGuild]);

  useEffect(() => {
    const guildId = getApiGuildId(selectedGuild);

    if (!moduleEnabled || !apiEnabled || !guildId) {
      const localThreads = buildLocalForumThreads(moduleEnabled && !apiEnabled ? forumThreads : []).filter(
        (thread) => !activeForumCategoryId || thread.categoryId === activeForumCategoryId,
      );
      setForumThreadsState(localThreads);
      setForumThreadPagination(createLocalPagination(localThreads.length));
      setActiveForumThread((current) => localThreads.find((thread) => thread.id === current?.id) || localThreads[0] || null);
      return undefined;
    }

    if (!activeForumCategoryId) {
      setForumThreadsState([]);
      return undefined;
    }

    const controller = new AbortController();

    guildOpsApi
      .listForumThreads(
        guildId,
        {
          categoryId: activeForumCategoryId,
          page: 1,
          limit: 20,
        },
        { signal: controller.signal },
      )
      .then((payload) => {
        const threads = (payload?.threads || []).map(normalizeForumThread);
        setForumThreadsState(threads);
        setForumThreadPagination(payload?.pagination || createLocalPagination(threads.length));
        setActiveForumThread((current) => threads.find((thread) => thread.id === current?.id) || threads[0] || null);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setForumError(error?.message || "Sujets indisponibles.");
      });

    return () => controller.abort();
  }, [activeForumCategoryId, apiEnabled, moduleEnabled, selectedGuild]);

  useEffect(() => {
    const guildId = getApiGuildId(selectedGuild);

    if (!moduleEnabled || !activeForumThread) {
      setForumPosts([]);
      return undefined;
    }

    if (!apiEnabled || !guildId) {
      setForumPosts(buildLocalForumPosts(activeForumThread));
      setForumPostPagination(createLocalPagination(1));
      return undefined;
    }

    const controller = new AbortController();

    guildOpsApi
      .getForumThread(guildId, activeForumThread.id, { page: 1, limit: 30 }, { signal: controller.signal })
      .then((payload) => {
        if (payload?.thread) setActiveForumThread(normalizeForumThread(payload.thread));
        setForumPosts((payload?.posts || []).map(normalizeForumPost));
        setForumPostPagination(payload?.pagination || createLocalPagination(payload?.posts?.length || 0));
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setForumError(error?.message || "Discussion indisponible.");
      });

    return () => controller.abort();
  }, [activeForumThread?.id, apiEnabled, moduleEnabled, selectedGuild]);

  function selectForumCategory(categoryId) {
    if (!moduleEnabled) return;
    setActiveForumCategoryId(categoryId);
    setForumThreadDraft((current) => ({ ...current, categoryId }));
    setForumError("");
  }

  function selectForumThread(thread) {
    if (!moduleEnabled) return;
    setActiveForumThread(normalizeForumThread(thread));
    setForumEditingPostId("");
    setForumReplyDraft("");
    setForumError("");
  }

  async function refreshForumSnapshot() {
    const guildId = getApiGuildId(selectedGuild);
    if (!moduleEnabled || !apiEnabled || !guildId) return;

    const payload = await guildOpsApi.getForum(guildId);
    const categories = (payload?.categories || []).map(normalizeForumCategory);
    setForumCategories(categories);
    setForumRoles((payload?.roles || []).map(normalizeForumRole));
    setForumCounters(payload?.counters || buildLocalForumCounters([]));
    setForumCanManage(Boolean(payload?.canManage));
  }

  async function refreshForumThreads(categoryId = activeForumCategoryId) {
    const guildId = getApiGuildId(selectedGuild);
    if (!moduleEnabled || !apiEnabled || !guildId || !categoryId) return;

    const payload = await guildOpsApi.listForumThreads(guildId, { categoryId, page: 1, limit: 20 });
    const threads = (payload?.threads || []).map(normalizeForumThread);
    setForumThreadsState(threads);
    setForumThreadPagination(payload?.pagination || createLocalPagination(threads.length));
  }

  async function saveForumCategory(categoryDraft) {
    const normalized = normalizeForumCategory(categoryDraft);

    if (!moduleEnabled) return;
    if (!forumCanManage) return;

    if (!apiEnabled || !getApiGuildId(selectedGuild)) {
      setForumCategories((current) => {
        const category = {
          ...normalized,
          id: normalized.id || `local-category-${Date.now()}`,
          permissions: { canRead: true, canPost: true, canModerate: true },
        };
        return [category, ...current.filter((item) => item.id !== category.id)];
      });
      setForumCategoryDraft(createForumCategoryDraft());
      return;
    }

    try {
      const guildId = getApiGuildId(selectedGuild);
      const payload = await guildOpsApi.saveForumCategory(guildId, {
        id: normalized.id || undefined,
        name: normalized.name,
        description: normalized.description,
        sortOrder: normalized.sortOrder,
        visibility: normalized.visibility,
      });
      const saved = payload?.category ? normalizeForumCategory(payload.category) : null;
      if (saved) {
        setForumCategories((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
        setActiveForumCategoryId(saved.id);
      }
      setForumCategoryDraft(createForumCategoryDraft());
      await refreshForumSnapshot();
    } catch (error) {
      setForumError(error?.message || "Impossible d'enregistrer la categorie.");
    }
  }

  async function saveForumCategoryPermissions(categoryId, permissions) {
    const guildId = getApiGuildId(selectedGuild);
    if (!moduleEnabled) return;
    if (!forumCanManage || !categoryId) return;

    if (!apiEnabled || !guildId) {
      setForumCategories((current) =>
        current.map((category) => (category.id === categoryId ? { ...category, rolePermissions: permissions } : category)),
      );
      return;
    }

    try {
      const payload = await guildOpsApi.updateForumCategoryPermissions(guildId, categoryId, permissions);
      const saved = payload?.category ? normalizeForumCategory(payload.category) : null;
      if (saved) setForumCategories((current) => current.map((category) => (category.id === saved.id ? saved : category)));
    } catch (error) {
      setForumError(error?.message || "Permissions forum non enregistrees.");
    }
  }

  async function createForumThread() {
    if (!moduleEnabled) return;
    const draft = {
      ...forumThreadDraft,
      title: forumThreadDraft.title.trim(),
      body: forumThreadDraft.body.trim(),
      categoryId: forumThreadDraft.categoryId || activeForumCategoryId,
    };
    if (!draft.title || !draft.body || !draft.categoryId) return;

    if (!apiEnabled || !getApiGuildId(selectedGuild)) {
      const localThread = normalizeForumThread({
        id: `local-thread-${Date.now()}`,
        categoryId: draft.categoryId,
        categoryName: forumCategories.find((category) => category.id === draft.categoryId)?.name || "General",
        title: draft.title,
        authorName: currentUser.displayName,
        preview: draft.body,
        pinned: draft.pinned,
        locked: draft.locked,
        postCount: 1,
        replyCount: 0,
        createdAt: new Date().toISOString(),
      });
      setForumThreadsState((current) => [localThread, ...current]);
      setActiveForumThread(localThread);
      setForumPosts(buildLocalForumPosts(localThread, draft.body, currentUser.displayName));
      setForumThreadDraft(createForumThreadDraft({ categoryId: draft.categoryId }));
      return;
    }

    try {
      const guildId = getApiGuildId(selectedGuild);
      const payload = await guildOpsApi.createForumThread(guildId, draft);
      if (payload?.thread) setActiveForumThread(normalizeForumThread(payload.thread));
      if (payload?.posts) setForumPosts(payload.posts.map(normalizeForumPost));
      setForumThreadDraft(createForumThreadDraft({ categoryId: draft.categoryId }));
      await Promise.all([refreshForumSnapshot(), refreshForumThreads(draft.categoryId)]);
    } catch (error) {
      setForumError(error?.message || "Sujet non cree.");
    }
  }

  async function updateForumThreadFlags(patch) {
    const guildId = getApiGuildId(selectedGuild);
    const thread = activeForumThread;
    if (!moduleEnabled) return;
    if (!thread || !forumCanManage) return;

    if (!apiEnabled || !guildId) {
      const updated = { ...thread, ...patch };
      setActiveForumThread(updated);
      setForumThreadsState((current) => current.map((item) => (item.id === thread.id ? updated : item)));
      return;
    }

    try {
      const payload = await guildOpsApi.updateForumThread(guildId, thread.id, patch);
      if (payload?.thread) {
        const updated = normalizeForumThread(payload.thread);
        setActiveForumThread(updated);
        setForumThreadsState((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      }
    } catch (error) {
      setForumError(error?.message || "Sujet non mis a jour.");
    }
  }

  function beginForumPostEdit(post) {
    if (!moduleEnabled) return;
    if (!post || post.deleted) return;
    setForumEditingPostId(post.id);
    setForumReplyDraft(post.body || "");
  }

  async function sendForumReply() {
    if (!moduleEnabled) return;
    const body = forumReplyDraft.trim();
    if (!body || !activeForumThread) return;

    const guildId = getApiGuildId(selectedGuild);
    const editingPostId = forumEditingPostId;
    setForumReplyDraft("");
    setForumEditingPostId("");

    if (!apiEnabled || !guildId) {
      if (editingPostId) {
        setForumPosts((current) =>
          current.map((post) => (post.id === editingPostId ? { ...post, body, edited: true, editedAt: new Date().toISOString() } : post)),
        );
      } else {
        setForumPosts((current) => [
          ...current,
          normalizeForumPost({
            id: `local-post-${Date.now()}`,
            threadId: activeForumThread.id,
            authorName: currentUser.displayName,
            body,
            createdAt: new Date().toISOString(),
          }),
        ]);
      }
      return;
    }

    try {
      const payload = editingPostId
        ? await guildOpsApi.updateForumPost(guildId, activeForumThread.id, editingPostId, { body })
        : await guildOpsApi.createForumPost(guildId, activeForumThread.id, { body });
      const saved = payload?.post ? normalizeForumPost(payload.post) : null;
      if (saved) {
        setForumPosts((current) =>
          editingPostId
            ? current.map((post) => (post.id === saved.id ? saved : post))
            : appendUniqueById(current, [saved]),
        );
      }
      await refreshForumThreads(activeForumCategoryId);
    } catch (error) {
      setForumReplyDraft(body);
      setForumEditingPostId(editingPostId);
      setForumError(error?.message || "Message forum non envoye.");
    }
  }

  async function deleteForumPost(post) {
    const guildId = getApiGuildId(selectedGuild);
    if (!moduleEnabled) return;
    if (!post || !activeForumThread) return;

    if (!apiEnabled || !guildId) {
      setForumPosts((current) =>
        current.map((item) => (item.id === post.id ? { ...item, deleted: true, deletedAt: new Date().toISOString(), body: "" } : item)),
      );
      return;
    }

    try {
      const payload = await guildOpsApi.deleteForumPost(guildId, activeForumThread.id, post.id, {
        moderationNote: forumCanManage ? "Suppression moderateur" : null,
      });
      const deleted = payload?.post ? normalizeForumPost(payload.post) : null;
      if (deleted) setForumPosts((current) => current.map((item) => (item.id === deleted.id ? deleted : item)));
      await refreshForumThreads(activeForumCategoryId);
    } catch (error) {
      setForumError(error?.message || "Suppression impossible.");
    }
  }

  return {
    activeForumCategoryId,
    activeForumThread,
    beginForumPostEdit,
    createForumThread,
    deleteForumPost,
    forumCanManage,
    forumCategories,
    forumCategoryDraft,
    forumCounters,
    forumEditingPostId,
    forumError,
    forumLoading,
    forumPostPagination,
    forumPosts,
    forumReplyDraft,
    forumRoles,
    forumThreadDraft,
    forumThreadPagination,
    forumThreadsState,
    saveForumCategory,
    saveForumCategoryPermissions,
    selectForumCategory,
    selectForumThread,
    sendForumReply,
    setForumCategoryDraft,
    setForumReplyDraft,
    setForumThreadDraft,
    updateForumThreadFlags,
  };
}

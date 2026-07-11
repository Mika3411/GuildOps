import React, {
  useEffect,
  useState
} from "react";
import {
  CheckCircle2,
  FileText,
  Flag,
  Eye,
  EyeOff,
  Pencil,
  Lock,
  MessageSquare,
  Plus,
  Send,
  Trash2,
  Volume2,
  VolumeX
} from "lucide-react";
import {
  getForumVisibilityLabel,
  formatChatTime
} from "../../lib/guildOpsTransforms.js";
import {
  EmptyState,
  PanelHeader
} from "../shared/Shared.jsx";

export function ForumView(props) {
  const activeCategory =
    props.forumCategories.find((category) => category.id === props.activeForumCategoryId) || props.forumCategories[0];
  const canPost = activeCategory?.permissions?.canPost ?? true;
  const hasCategories = props.forumCategories.length > 0;
  const [categoryComposerOpen, setCategoryComposerOpen] = useState(false);
  const [threadComposerOpen, setThreadComposerOpen] = useState(false);

  useEffect(() => {
    if (!props.forumCanManage) setCategoryComposerOpen(false);
  }, [props.forumCanManage]);

  useEffect(() => {
    if (!hasCategories) setThreadComposerOpen(false);
  }, [hasCategories]);

  function saveCategory(draft) {
    props.onSaveForumCategory(draft);
    setCategoryComposerOpen(false);
  }

  function editCategory(category) {
    props.setForumCategoryDraft(() => ({
      id: category.id,
      name: category.name,
      description: category.description,
      sortOrder: category.sortOrder,
      visibility: category.visibility,
    }));
    setCategoryComposerOpen(true);
  }

  function toggleCategoryComposer() {
    if (!categoryComposerOpen) {
      props.setForumCategoryDraft(() => ({
        id: "",
        name: "",
        description: "",
        sortOrder: 0,
        visibility: "members",
      }));
    }
    setCategoryComposerOpen((current) => !current);
  }

  function createThread() {
    props.onCreateForumThread();
  }

  return (
    <div className="forum-workspace">
      <ForumSidebar
        activeCategoryId={props.activeForumCategoryId}
        activeThread={props.activeForumThread}
        canManage={props.forumCanManage}
        canPost={canPost}
        categoryComposerOpen={categoryComposerOpen}
        categories={props.forumCategories}
        counters={props.forumCounters}
        categoryDraft={props.forumCategoryDraft}
        mutes={props.forumMutes}
        threadDraft={props.forumThreadDraft}
        threadComposerOpen={threadComposerOpen}
        loading={props.forumLoading}
        onChangeCategoryDraft={props.setForumCategoryDraft}
        onChangeThreadDraft={props.setForumThreadDraft}
        onSaveCategory={saveCategory}
        onCreateThread={createThread}
        onDeleteCategory={props.onDeleteForumCategory}
        onEditCategory={editCategory}
        onSelectCategory={props.onSelectForumCategory}
        onSelectThread={props.onSelectForumThread}
        onUnmuteMember={props.onUnmuteForumMember}
        onToggleCategoryComposer={toggleCategoryComposer}
        onToggleThreadComposer={() => setThreadComposerOpen((current) => !current)}
        pagination={props.forumThreadPagination}
        threads={props.forumThreads}
      />
      <ForumDiscussion
        canManage={props.forumCanManage}
        draft={props.forumReplyDraft}
        editingPostId={props.forumEditingPostId}
        mutes={props.forumMutes}
        onChangeDraft={props.setForumReplyDraft}
        onDeletePost={props.onDeleteForumPost}
        onDeleteThread={props.onDeleteForumThread}
        onEditPost={props.onEditForumPost}
        onMuteMember={props.onMuteForumMember}
        onSend={props.onSendForumReply}
        onUnmuteMember={props.onUnmuteForumMember}
        onUpdateThreadFlags={props.onUpdateForumThreadFlags}
        pagination={props.forumPostPagination}
        posts={props.forumPosts}
        thread={props.activeForumThread}
      />
      {props.forumError ? <p className="sync-warning forum-warning">{props.forumError}</p> : null}
    </div>
  );
}

export function ForumSidebar({
  activeCategoryId,
  activeThread,
  canManage = false,
  canPost = false,
  categoryComposerOpen = false,
  categories = [],
  counters = {},
  categoryDraft,
  mutes = [],
  threadDraft,
  threadComposerOpen = false,
  loading = false,
  onChangeCategoryDraft,
  onChangeThreadDraft,
  onSaveCategory,
  onCreateThread,
  onDeleteCategory,
  onEditCategory,
  onSelectCategory,
  onSelectThread,
  onUnmuteMember,
  onToggleCategoryComposer,
  onToggleThreadComposer,
  pagination = {},
  threads = [],
}) {
  const categoryOptions = categories.filter((category) => category.permissions?.canPost ?? true);
  const canCreateThread = canPost && categoryOptions.length > 0;
  const unreadMessages = Number(counters.unreadMessages ?? counters.unread ?? 0);
  const newThreads = Number(counters.newThreads ?? 0);
  const forumMeta = loading
    ? "Chargement"
    : [
        `${counters.threads || 0} sujets`,
        `${counters.posts || 0} posts`,
        unreadMessages ? `${unreadMessages} non lu${unreadMessages > 1 ? "s" : ""}` : null,
        newThreads ? `${newThreads} nouveau${newThreads > 1 ? "x sujets" : " sujet"}` : null,
      ]
        .filter(Boolean)
        .join(" · ");

  return (
    <section className="panel forum-sidebar-panel">
      <PanelHeader icon={MessageSquare} title="Forum" meta={forumMeta} />
      <div className="forum-header-tools">
        {canManage ? (
          <button className="forum-header-action" type="button" onClick={onToggleCategoryComposer}>
            <Plus size={15} />
            Categorie
          </button>
        ) : null}
        <button className="forum-header-action" type="button" onClick={onToggleThreadComposer} disabled={!canCreateThread}>
          <Plus size={15} />
          Sujet
        </button>
      </div>
      {categoryComposerOpen ? <ForumCategoryQuickForm draft={categoryDraft} onChange={onChangeCategoryDraft} onSave={onSaveCategory} /> : null}
      {threadComposerOpen ? (
        <ForumThreadQuickForm
          canPost={canPost}
          categories={categories}
          draft={threadDraft}
          onChangeDraft={onChangeThreadDraft}
          onCreate={onCreateThread}
        />
      ) : null}
      <ForumCategoryList
        activeCategoryId={activeCategoryId}
        canManage={canManage}
        categories={categories}
        loading={loading}
        onDelete={onDeleteCategory}
        onEdit={onEditCategory}
        onSelect={onSelectCategory}
      />
      <ForumThreadList
        activeThread={activeThread}
        categoryOptions={categoryOptions}
        onSelect={onSelectThread}
        pagination={pagination}
        threads={threads}
      />
      {canManage ? <ForumMuteList mutes={mutes} onUnmute={onUnmuteMember} /> : null}
    </section>
  );
}

export function ForumCategoryQuickForm({ draft = {}, onChange, onSave }) {
  const [localDraft, setLocalDraft] = useState(() => ({
    description: draft.description || "",
    id: draft.id || "",
    name: draft.name || "",
    sortOrder: draft.sortOrder,
    visibility: draft.visibility || "members",
  }));
  const presets = [
    { name: "Annonces", description: "Informations importantes et decisions R4/R5.", visibility: "members" },
    { name: "Strategie", description: "Plans de guerre, rallys, objectifs et rapports.", visibility: "members" },
    { name: "Diplomatie", description: "NAP, alliances, ennemis et consignes royaume.", visibility: "officers" },
  ];

  useEffect(() => {
    setLocalDraft({
      description: draft.description || "",
      id: draft.id || "",
      name: draft.name || "",
      sortOrder: draft.sortOrder,
      visibility: draft.visibility || "members",
    });
  }, [draft.description, draft.id, draft.name, draft.sortOrder, draft.visibility]);

  function updateDraft(patch) {
    setLocalDraft((current) => {
      const next = { ...current, ...patch };
      onChange?.(() => next);
      return next;
    });
  }

  const editing = Boolean(localDraft.id);

  return (
    <div className="forum-category-quick-form">
      <header>
        <span>
          <strong>{editing ? "Modifier la categorie" : "Nouvelle categorie"}</strong>
          <small>{editing ? "Nom, acces et description." : "Exemples rapides ou nom libre."}</small>
        </span>
      </header>
      {editing ? null : (
        <div className="forum-preset-list" aria-label="Modeles de categorie">
          {presets.map((preset) => (
            <button key={preset.name} type="button" onClick={() => updateDraft(preset)}>
              {preset.name}
            </button>
          ))}
        </div>
      )}
      <label className="form-row">
        <span>Nom</span>
        <input value={localDraft.name} placeholder="Ex: Annonces" onChange={(event) => updateDraft({ name: event.target.value })} />
      </label>
      <label className="form-row">
        <span>Acces</span>
        <select value={localDraft.visibility || "members"} onChange={(event) => updateDraft({ visibility: event.target.value })}>
          <option value="public">Public - tout le monde</option>
          <option value="members">Prive - membres uniquement</option>
          <option value="officers">Officiers seulement</option>
          <option value="admins">Admins seulement</option>
        </select>
      </label>
      <label className="form-row wide">
        <span>Description</span>
        <textarea
          value={localDraft.description}
          placeholder="A quoi sert cette categorie ?"
          onChange={(event) => updateDraft({ description: event.target.value })}
        />
      </label>
      <button className="teal-action" type="button" onClick={() => onSave(localDraft)} disabled={!localDraft.name?.trim()}>
        <CheckCircle2 size={16} />
        {editing ? "Enregistrer la categorie" : "Ajouter la categorie"}
      </button>
    </div>
  );
}

export function ForumCategoryList({
  activeCategoryId,
  canManage = false,
  categories = [],
  loading = false,
  onDelete,
  onEdit,
  onSelect,
}) {
  return (
    <div className="forum-sidebar-section">
      <header>
        <strong>Categories</strong>
        <small>{categories.length} au total</small>
      </header>
      <div className="forum-category-list">
        {categories.length ? (
          categories.map((category) => (
            <article className={`forum-category-row ${activeCategoryId === category.id ? "is-active" : ""}`} key={category.id}>
              <button type="button" onClick={() => onSelect(category.id)}>
                <span>
                  <strong>{category.name}</strong>
                  <small>{category.description || getForumVisibilityLabel(category.visibility)}</small>
                  <small className="forum-visibility-chip">{getForumVisibilityLabel(category.visibility)}</small>
                </span>
                <em>{category.threadCount}</em>
              </button>
              {canManage ? (
                <footer>
                  <button type="button" onClick={() => onEdit(category)} aria-label={`Modifier ${category.name}`}>
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Supprimer la categorie "${category.name}" et ses sujets ?`)) onDelete(category);
                    }}
                    aria-label={`Supprimer ${category.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </footer>
              ) : null}
            </article>
          ))
        ) : (
          <EmptyState
            icon={MessageSquare}
            title={loading ? "Chargement" : "Aucune categorie"}
            text={loading ? "Chargement..." : canManage ? "Clique sur + Categorie." : "Aucune categorie disponible."}
            compact
          />
        )}
      </div>
    </div>
  );
}

export function ForumThreadQuickForm({
  canPost,
  categories = [],
  draft,
  onChangeDraft,
  onCreate,
}) {
  const categoryOptions = categories.filter((category) => category.permissions?.canPost ?? true);
  const disabled = !canPost || categoryOptions.length === 0;
  const selectedCategoryId = draft.categoryId || categoryOptions[0]?.id || "";

  function updateDraft(patch) {
    onChangeDraft((current) => ({ ...current, ...patch }));
  }

  return (
    <div className="forum-thread-quick-form">
      <header>
        <strong>Nouveau sujet</strong>
        <small>{disabled ? "Cree une categorie avant." : "Titre + premier message."}</small>
      </header>
      <label className="form-row">
        <span>Categorie</span>
        <select value={selectedCategoryId} onChange={(event) => updateDraft({ categoryId: event.target.value })} disabled={disabled}>
          {categoryOptions.length ? null : <option value="">Aucune categorie</option>}
          {categoryOptions.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      <label className="form-row">
        <span>Titre</span>
        <input
          value={draft.title}
          placeholder="Plan, rapport, consigne..."
          onChange={(event) => updateDraft({ title: event.target.value })}
          disabled={disabled}
        />
      </label>
      <label className="form-row">
        <span>Acces sujet</span>
        <select
          value={draft.visibility || "members"}
          onChange={(event) => updateDraft({ visibility: event.target.value })}
          disabled={disabled}
        >
          <option value="members">Prive - membres uniquement</option>
          <option value="public">Public - tout le monde</option>
        </select>
      </label>
      <label className="form-row">
        <span>Premier message</span>
        <textarea
          value={draft.body}
          placeholder={disabled ? "Aucune categorie disponible" : "Lance la discussion..."}
          onChange={(event) => updateDraft({ body: event.target.value })}
          disabled={disabled}
        />
      </label>
      <button className="teal-action" type="button" onClick={onCreate} disabled={disabled || !draft.title.trim() || !draft.body.trim()}>
        Ajouter le sujet
      </button>
    </div>
  );
}

export function ForumThreadList({
  activeThread,
  categoryOptions = [],
  onSelect,
  pagination = {},
  threads = [],
}) {
  return (
    <div className="forum-sidebar-section">
      <header>
        <strong>Sujets</strong>
        <small>{pagination.total || threads.length} au total</small>
      </header>
      <div className="forum-list">
        {threads.map((thread) => {
          const unreadCount = Number(thread.unreadCount || 0);
          const rowClassName = [
            "forum-row",
            activeThread?.id === thread.id ? "is-active" : "",
            unreadCount ? "is-unread" : "",
            thread.newTopic ? "is-new" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <article className={rowClassName} key={thread.id}>
              {thread.locked ? <Lock size={18} /> : thread.pinned ? <Flag size={18} /> : <MessageSquare size={18} />}
              <span>
                <span className="forum-thread-title-line">
                  <strong>{thread.title}</strong>
                  <span className="forum-thread-badges">
                    {thread.newTopic ? <em className="forum-unread-chip is-new">Nouveau</em> : null}
                    {unreadCount ? (
                      <em className="forum-unread-chip">
                        {unreadCount} non lu{unreadCount > 1 ? "s" : ""}
                      </em>
                    ) : null}
                  </span>
                </span>
                <small>
                  {thread.authorName} · {thread.replyCount} reponses · {thread.categoryName}
                </small>
                <small className="forum-visibility-chip">{thread.visibility === "public" ? "Public" : "Membres"}</small>
                <small>{thread.preview}</small>
              </span>
              <button type="button" onClick={() => onSelect(thread)}>
                Ouvrir
              </button>
            </article>
          );
        })}
        {threads.length ? null : (
          <EmptyState
            icon={FileText}
            title="Aucun sujet"
            text={categoryOptions.length ? "Clique sur + Sujet." : "Cree d'abord une categorie."}
            compact
          />
        )}
      </div>
    </div>
  );
}

export function ForumMuteList({ mutes = [], onUnmute }) {
  if (!mutes.length) return null;

  return (
    <div className="forum-sidebar-section">
      <header>
        <strong>Membres en sourdine</strong>
        <small>{mutes.length} actif{mutes.length > 1 ? "s" : ""}</small>
      </header>
      <div className="forum-mute-list">
        {mutes.map((mute) => (
          <article key={mute.id || mute.memberId}>
            <VolumeX size={16} />
            <span>
              <strong>{mute.memberName}</strong>
              <small>{mute.reason || "Ne peut plus poster sur le forum."}</small>
            </span>
            <button type="button" onClick={() => onUnmute(mute.memberId)}>
              Reactiver
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}

export function ForumDiscussion({
  canManage,
  draft,
  editingPostId,
  mutes = [],
  onChangeDraft,
  onDeletePost,
  onDeleteThread,
  onEditPost,
  onMuteMember,
  onSend,
  onUnmuteMember,
  onUpdateThreadFlags,
  pagination = {},
  posts = [],
  thread,
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [threadDraft, setThreadDraft] = useState(() => ({
    title: thread?.title || "",
    visibility: thread?.visibility || "members",
  }));

  useEffect(() => {
    setSettingsOpen(false);
    setThreadDraft({
      title: thread?.title || "",
      visibility: thread?.visibility || "members",
    });
  }, [thread?.id, thread?.title, thread?.visibility]);

  if (!thread) {
    return (
      <section className="panel wide-panel forum-discussion-panel">
        <PanelHeader icon={MessageSquare} title="Discussion" meta="Aucun sujet" />
        <EmptyState icon={MessageSquare} title="Aucun fil ouvert" text="Cree ou selectionne un sujet : la conversation s'affichera ici." />
      </section>
    );
  }

  const permissions = thread.permissions || {};
  const canModerate = canManage || permissions.canModerate;
  const canEditThread = canModerate || permissions.canEdit;
  const canReply = permissions.canReply ?? (!thread.locked || canModerate);
  const muted = Boolean(permissions.muted);
  const replyDisabled = !canReply || !draft.trim();
  const activeMuteIds = new Set(mutes.map((mute) => mute.memberId));

  function updateThreadDraft(patch) {
    setThreadDraft((current) => ({ ...current, ...patch }));
  }

  function saveThreadSettings() {
    const patch = {};
    if (threadDraft.title.trim() && threadDraft.title.trim() !== thread.title) {
      patch.title = threadDraft.title.trim();
    }
    if (canModerate && threadDraft.visibility !== thread.visibility) {
      patch.visibility = threadDraft.visibility;
    }
    if (Object.keys(patch).length) onUpdateThreadFlags(patch);
    setSettingsOpen(false);
  }

  function getReplyPlaceholder() {
    if (muted) return "Tu es en sourdine sur ce forum.";
    if (thread.locked && !canModerate) return "Sujet verrouille";
    if (editingPostId) return "Modifier le message...";
    return "Repondre...";
  }

  return (
    <section className="panel wide-panel forum-discussion-panel">
      <PanelHeader
        icon={thread.locked ? Lock : MessageSquare}
        title={thread.title}
        meta={`${thread.visibility === "public" ? "Public" : "Membres"} · ${pagination.total || posts.length} posts`}
        action={
          canEditThread ? (
            <span className="forum-thread-actions">
              <button type="button" onClick={() => setSettingsOpen((current) => !current)}>
                <Pencil size={14} />
                Modifier
              </button>
              {canModerate ? (
                <>
                  <button type="button" onClick={() => onUpdateThreadFlags({ pinned: !thread.pinned })}>
                    {thread.pinned ? "Desepingler" : "Epingler"}
                  </button>
                  <button type="button" onClick={() => onUpdateThreadFlags({ locked: !thread.locked })}>
                    {thread.locked ? "Deverrouiller" : "Verrouiller"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Supprimer le sujet "${thread.title}" ?`)) onDeleteThread(thread);
                    }}
                  >
                    <Trash2 size={14} />
                    Supprimer
                  </button>
                </>
              ) : null}
            </span>
          ) : null
        }
      />
      {settingsOpen ? (
        <div className="forum-thread-settings">
          <label className="form-row">
            <span>Titre</span>
            <input value={threadDraft.title} onChange={(event) => updateThreadDraft({ title: event.target.value })} />
          </label>
          {canModerate ? (
            <label className="form-row">
              <span>Acces sujet</span>
              <select value={threadDraft.visibility} onChange={(event) => updateThreadDraft({ visibility: event.target.value })}>
                <option value="members">Prive - membres uniquement</option>
                <option value="public">Public - tout le monde</option>
              </select>
            </label>
          ) : null}
          <button className="teal-action" type="button" onClick={saveThreadSettings} disabled={!threadDraft.title.trim()}>
            Enregistrer
          </button>
        </div>
      ) : null}
      <div className="forum-post-list">
        {posts.map((post) => {
          const authorMuted = activeMuteIds.has(post.authorMemberId);
          return (
            <article className={`forum-post ${post.deleted ? "is-deleted" : ""}`} key={post.id}>
              <header>
                <strong>{post.authorName}</strong>
                <small>
                  {formatChatTime(post)} {post.edited ? "· modifie" : ""}
                </small>
              </header>
              <p>{post.deleted ? "Message supprime par moderation." : post.body}</p>
              {post.moderationNote ? <small className="moderation-note">{post.moderationNote}</small> : null}
              {!post.deleted && canModerate ? (
                <footer>
                  <button type="button" onClick={() => onEditPost(post)}>
                    Modifier
                  </button>
                  <button type="button" onClick={() => onDeletePost(post)}>
                    Supprimer
                  </button>
                  {canModerate && post.authorMemberId ? (
                    authorMuted ? (
                      <button type="button" onClick={() => onUnmuteMember(post.authorMemberId)}>
                        <Volume2 size={14} />
                        Reactiver
                      </button>
                    ) : (
                      <button type="button" onClick={() => onMuteMember(post.authorMemberId, `Sourdine forum: ${post.authorName}`)}>
                        <VolumeX size={14} />
                        Sourdine
                      </button>
                    )
                  ) : null}
                </footer>
              ) : null}
            </article>
          );
        })}
      </div>
      <label className="chat-input forum-reply-input">
        <input
          value={draft}
          placeholder={getReplyPlaceholder()}
          onChange={(event) => onChangeDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && canReply) onSend();
          }}
          disabled={!canReply}
        />
        <button type="button" onClick={onSend} disabled={replyDisabled} aria-label="Envoyer">
          <Send size={15} />
        </button>
      </label>
    </section>
  );
}

import React, {
  useEffect,
  useState
} from "react";
import {
  CheckCircle2,
  FileText,
  Flag,
  Lock,
  MessageSquare,
  Plus,
  Send
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
        threadDraft={props.forumThreadDraft}
        threadComposerOpen={threadComposerOpen}
        loading={props.forumLoading}
        onChangeCategoryDraft={props.setForumCategoryDraft}
        onChangeThreadDraft={props.setForumThreadDraft}
        onSaveCategory={saveCategory}
        onCreateThread={createThread}
        onSelectCategory={props.onSelectForumCategory}
        onSelectThread={props.onSelectForumThread}
        onToggleCategoryComposer={() => setCategoryComposerOpen((current) => !current)}
        onToggleThreadComposer={() => setThreadComposerOpen((current) => !current)}
        pagination={props.forumThreadPagination}
        threads={props.forumThreads}
      />
      <ForumDiscussion
        canManage={props.forumCanManage}
        draft={props.forumReplyDraft}
        editingPostId={props.forumEditingPostId}
        onChangeDraft={props.setForumReplyDraft}
        onDeletePost={props.onDeleteForumPost}
        onEditPost={props.onEditForumPost}
        onSend={props.onSendForumReply}
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
  threadDraft,
  threadComposerOpen = false,
  loading = false,
  onChangeCategoryDraft,
  onChangeThreadDraft,
  onSaveCategory,
  onCreateThread,
  onSelectCategory,
  onSelectThread,
  onToggleCategoryComposer,
  onToggleThreadComposer,
  pagination = {},
  threads = [],
}) {
  const categoryOptions = categories.filter((category) => category.permissions?.canPost ?? true);
  const canCreateThread = canPost && categoryOptions.length > 0;

  return (
    <section className="panel forum-sidebar-panel">
      <PanelHeader
        icon={MessageSquare}
        title="Forum"
        meta={loading ? "Chargement" : `${counters.threads || 0} sujets · ${counters.posts || 0} posts`}
      />
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
        onSelect={onSelectCategory}
      />
      <ForumThreadList
        activeThread={activeThread}
        categoryOptions={categoryOptions}
        onSelect={onSelectThread}
        pagination={pagination}
        threads={threads}
      />
    </section>
  );
}

export function ForumCategoryQuickForm({ draft = {}, onChange, onSave }) {
  const [localDraft, setLocalDraft] = useState(() => ({
    description: draft.description || "",
    name: draft.name || "",
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
      name: draft.name || "",
      visibility: draft.visibility || "members",
    });
  }, [draft.id]);

  function updateDraft(patch) {
    setLocalDraft((current) => {
      const next = { ...current, ...patch };
      onChange?.(() => next);
      return next;
    });
  }

  return (
    <div className="forum-category-quick-form">
      <header>
        <span>
          <strong>Nouvelle categorie</strong>
          <small>Exemples rapides ou nom libre.</small>
        </span>
      </header>
      <div className="forum-preset-list" aria-label="Modeles de categorie">
        {presets.map((preset) => (
          <button key={preset.name} type="button" onClick={() => updateDraft(preset)}>
            {preset.name}
          </button>
        ))}
      </div>
      <label className="form-row">
        <span>Nom</span>
        <input value={localDraft.name} placeholder="Ex: Annonces" onChange={(event) => updateDraft({ name: event.target.value })} />
      </label>
      <label className="form-row">
        <span>Acces</span>
        <select value={localDraft.visibility || "members"} onChange={(event) => updateDraft({ visibility: event.target.value })}>
          <option value="members">Tous les membres</option>
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
        Ajouter la categorie
      </button>
    </div>
  );
}

export function ForumCategoryList({ activeCategoryId, canManage = false, categories = [], loading = false, onSelect }) {
  return (
    <div className="forum-sidebar-section">
      <header>
        <strong>Categories</strong>
        <small>{categories.length} au total</small>
      </header>
      <div className="forum-category-list">
        {categories.length ? (
          categories.map((category) => (
            <button
              key={category.id}
              type="button"
              className={activeCategoryId === category.id ? "is-active" : ""}
              onClick={() => onSelect(category.id)}
            >
              <span>
                <strong>{category.name}</strong>
                <small>{category.description || getForumVisibilityLabel(category.visibility)}</small>
              </span>
              <em>{category.threadCount}</em>
            </button>
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
        {threads.map((thread) => (
          <article className={`forum-row ${activeThread?.id === thread.id ? "is-active" : ""}`} key={thread.id}>
            {thread.locked ? <Lock size={18} /> : thread.pinned ? <Flag size={18} /> : <MessageSquare size={18} />}
            <span>
              <strong>{thread.title}</strong>
              <small>
                {thread.authorName} · {thread.replyCount} reponses · {thread.categoryName}
              </small>
              <small>{thread.preview}</small>
            </span>
            <button type="button" onClick={() => onSelect(thread)}>
              Ouvrir
            </button>
          </article>
        ))}
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

export function ForumDiscussion({
  canManage,
  draft,
  editingPostId,
  onChangeDraft,
  onDeletePost,
  onEditPost,
  onSend,
  onUpdateThreadFlags,
  pagination = {},
  posts = [],
  thread,
}) {
  if (!thread) {
    return (
      <section className="panel wide-panel forum-discussion-panel">
        <PanelHeader icon={MessageSquare} title="Discussion" meta="Aucun sujet" />
        <EmptyState icon={MessageSquare} title="Aucun fil ouvert" text="Cree ou selectionne un sujet : la conversation s'affichera ici." />
      </section>
    );
  }

  return (
    <section className="panel wide-panel forum-discussion-panel">
      <PanelHeader
        icon={thread.locked ? Lock : MessageSquare}
        title={thread.title}
        meta={`${pagination.total || posts.length} posts`}
        action={
          canManage ? (
            <span className="forum-thread-actions">
              <button type="button" onClick={() => onUpdateThreadFlags({ pinned: !thread.pinned })}>
                {thread.pinned ? "Desepingler" : "Epingler"}
              </button>
              <button type="button" onClick={() => onUpdateThreadFlags({ locked: !thread.locked })}>
                {thread.locked ? "Deverrouiller" : "Verrouiller"}
              </button>
            </span>
          ) : null
        }
      />
      <div className="forum-post-list">
        {posts.map((post) => (
          <article className={`forum-post ${post.deleted ? "is-deleted" : ""}`} key={post.id}>
            <header>
              <strong>{post.authorName}</strong>
              <small>
                {formatChatTime(post)} {post.edited ? "· modifie" : ""}
              </small>
            </header>
            <p>{post.deleted ? "Message supprime par moderation." : post.body}</p>
            {post.moderationNote ? <small className="moderation-note">{post.moderationNote}</small> : null}
            {!post.deleted && canManage ? (
              <footer>
                <button type="button" onClick={() => onEditPost(post)}>
                  Modifier
                </button>
                <button type="button" onClick={() => onDeletePost(post)}>
                  Supprimer
                </button>
              </footer>
            ) : null}
          </article>
        ))}
      </div>
      <label className="chat-input forum-reply-input">
        <input
          value={draft}
          placeholder={thread.locked && !canManage ? "Sujet verrouille" : editingPostId ? "Modifier le message..." : "Repondre..."}
          onChange={(event) => onChangeDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onSend();
          }}
          disabled={thread.locked && !canManage}
        />
        <button type="button" onClick={onSend} disabled={(thread.locked && !canManage) || !draft.trim()} aria-label="Envoyer">
          <Send size={15} />
        </button>
      </label>
    </section>
  );
}

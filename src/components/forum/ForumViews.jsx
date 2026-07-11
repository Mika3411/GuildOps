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
  Send,
  Settings,
  Shield
} from "lucide-react";
import {
  getForumVisibilityLabel,
  buildForumPermissionDraft,
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

  useEffect(() => {
    setCategoryComposerOpen(!hasCategories && props.forumCanManage);
  }, [hasCategories, props.forumCanManage]);

  function saveCategory(draft) {
    props.onSaveForumCategory(draft);
  }

  return (
    <div className="page-grid two-columns forum-workspace">
      <ForumCategoryList
        activeCategoryId={props.activeForumCategoryId}
        canManage={props.forumCanManage}
        categories={props.forumCategories}
        counters={props.forumCounters}
        draft={props.forumCategoryDraft}
        loading={props.forumLoading}
        onChangeDraft={props.setForumCategoryDraft}
        onSaveCategory={saveCategory}
        onSelect={props.onSelectForumCategory}
        onToggleComposer={() => setCategoryComposerOpen((current) => !current)}
        showComposer={categoryComposerOpen}
      />
      <ForumThreadList
        activeThread={props.activeForumThread}
        canPost={canPost}
        categories={props.forumCategories}
        draft={props.forumThreadDraft}
        onChangeDraft={props.setForumThreadDraft}
        onCreate={props.onCreateForumThread}
        onSelect={props.onSelectForumThread}
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
      {props.forumCanManage ? (
        <ForumPermissionsPanel category={activeCategory} onSave={props.onSaveForumCategoryPermissions} roles={props.forumRoles} />
      ) : null}
      {props.forumError ? <p className="sync-warning forum-warning">{props.forumError}</p> : null}
    </div>
  );
}

export function ForumCategoryList({
  activeCategoryId,
  canManage = false,
  categories = [],
  counters = {},
  draft,
  loading = false,
  onChangeDraft,
  onSaveCategory,
  onSelect,
  onToggleComposer,
  showComposer = false,
}) {
  return (
    <section className="panel forum-categories-panel">
      <PanelHeader
        icon={MessageSquare}
        title="Categories"
        meta={loading ? "Chargement" : `${counters.threads || 0} sujets · ${counters.posts || 0} posts`}
        action={
          canManage ? (
            <span className="forum-header-tools">
              <span className="panel-meta">{loading ? "Chargement" : `${counters.threads || 0} sujets · ${counters.posts || 0} posts`}</span>
              <button className="forum-header-action" type="button" onClick={onToggleComposer}>
                <Plus size={15} />
                {showComposer ? "Fermer" : "Nouvelle"}
              </button>
            </span>
          ) : null
        }
      />
      {showComposer ? <ForumCategoryQuickForm draft={draft} onChange={onChangeDraft} onSave={onSaveCategory} /> : null}
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
            title={loading ? "Chargement du forum" : "Aucune categorie"}
            text={
              loading
                ? "Chargement des categories..."
                : canManage
                  ? "Cree d'abord une categorie comme Annonces, Strategie ou Diplomatie."
                  : "Aucune categorie disponible pour ton role."
            }
            compact
          />
        )}
      </div>
    </section>
  );
}

export function ForumCategoryQuickForm({ draft = {}, onChange, onSave }) {
  const presets = [
    { name: "Annonces", description: "Informations importantes et decisions R4/R5.", visibility: "members" },
    { name: "Strategie", description: "Plans de guerre, rallys, objectifs et rapports.", visibility: "members" },
    { name: "Diplomatie", description: "NAP, alliances, ennemis et consignes royaume.", visibility: "officers" },
  ];

  function updateDraft(patch) {
    onChange((current) => ({ ...current, ...patch }));
  }

  return (
    <div className="forum-category-quick-form">
      <header>
        <span className="forum-step-badge">1</span>
        <span>
          <strong>Creer une categorie</strong>
          <small>Une categorie regroupe les sujets du meme type.</small>
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
        <input value={draft.name} placeholder="Ex: Annonces" onChange={(event) => updateDraft({ name: event.target.value })} />
      </label>
      <label className="form-row">
        <span>Acces</span>
        <select value={draft.visibility} onChange={(event) => updateDraft({ visibility: event.target.value })}>
          <option value="members">Tous les membres</option>
          <option value="officers">Officiers seulement</option>
          <option value="admins">Admins seulement</option>
        </select>
      </label>
      <label className="form-row wide">
        <span>Description</span>
        <textarea
          value={draft.description}
          placeholder="A quoi sert cette categorie ?"
          onChange={(event) => updateDraft({ description: event.target.value })}
        />
      </label>
      <button className="teal-action" type="button" onClick={() => onSave(draft)} disabled={!draft.name?.trim()}>
        <CheckCircle2 size={16} />
        Creer la categorie
      </button>
    </div>
  );
}

export function ForumThreadList({
  activeThread,
  canPost,
  categories = [],
  draft,
  onChangeDraft,
  onCreate,
  onSelect,
  pagination = {},
  threads = [],
}) {
  const categoryOptions = categories.filter((category) => category.permissions?.canPost);
  const disabled = !canPost || categoryOptions.length === 0;
  const selectedCategoryId = draft.categoryId || categoryOptions[0]?.id || "";
  const helperText =
    categoryOptions.length === 0
      ? "Etape 2 bloquee : cree une categorie a gauche avant de lancer un sujet."
      : disabled
        ? "Ton role ne peut pas poster dans cette categorie."
        : "Un sujet = une question, une decision ou une consigne claire.";

  function updateDraft(patch) {
    onChangeDraft((current) => ({ ...current, ...patch }));
  }

  return (
    <section className="panel wide-panel forum-threads-panel">
      <PanelHeader icon={FileText} title="Sujets" meta={`${pagination.total || threads.length} au total`} />
      <div className="forum-compose">
        <header className="forum-compose-intro">
          <span className="forum-step-badge">2</span>
          <span>
            <strong>Nouveau sujet</strong>
            <small>{helperText}</small>
          </span>
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
        <label className="form-row wide">
          <span>Premier message</span>
          <textarea
            value={draft.body}
            placeholder={disabled ? "Message reserve a cette categorie" : "Lance la discussion de guilde..."}
            onChange={(event) => updateDraft({ body: event.target.value })}
            disabled={disabled}
          />
        </label>
        <button className="teal-action" type="button" onClick={onCreate} disabled={disabled || !draft.title.trim() || !draft.body.trim()}>
          Creer le sujet
        </button>
      </div>
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
            text={categoryOptions.length ? "Lance le premier sujet de cette categorie." : "Les sujets apparaitront ici apres la premiere categorie."}
            compact
          />
        )}
      </div>
    </section>
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

export function ForumCategoryEditor({ draft, onChange, onSave }) {
  function updateDraft(patch) {
    onChange((current) => ({ ...current, ...patch }));
  }

  return (
    <section className="panel forum-category-editor">
      <PanelHeader icon={Settings} title="Categorie" meta="Moderation" />
      <label className="form-row">
        <span>Nom</span>
        <input value={draft.name} onChange={(event) => updateDraft({ name: event.target.value })} />
      </label>
      <label className="form-row">
        <span>Acces</span>
        <select value={draft.visibility} onChange={(event) => updateDraft({ visibility: event.target.value })}>
          <option value="members">Membres</option>
          <option value="officers">Officiers</option>
          <option value="admins">Admins</option>
        </select>
      </label>
      <label className="form-row wide">
        <span>Description</span>
        <textarea value={draft.description} onChange={(event) => updateDraft({ description: event.target.value })} />
      </label>
      <button className="teal-action" type="button" onClick={() => onSave(draft)} disabled={!draft.name.trim()}>
        Enregistrer
      </button>
    </section>
  );
}

export function ForumPermissionsPanel({ category, onSave, roles = [] }) {
  const [draft, setDraft] = useState([]);

  useEffect(() => {
    setDraft(buildForumPermissionDraft(category, roles));
  }, [category?.id, roles]);

  function togglePermission(roleId, key) {
    setDraft((current) =>
      current.map((permission) =>
        permission.roleId === roleId ? { ...permission, [key]: !permission[key] } : permission,
      ),
    );
  }

  if (!category) return null;

  return (
    <section className="panel forum-permissions-panel">
      <PanelHeader icon={Shield} title="Permissions" meta={category.name} />
      <div className="forum-permission-list">
        {draft.map((permission) => (
          <div className="forum-permission-row" key={permission.roleId}>
            <strong>{permission.roleName}</strong>
            <label>
              <input type="checkbox" checked={permission.canRead} onChange={() => togglePermission(permission.roleId, "canRead")} />
              Lire
            </label>
            <label>
              <input type="checkbox" checked={permission.canPost} onChange={() => togglePermission(permission.roleId, "canPost")} />
              Poster
            </label>
            <label>
              <input
                type="checkbox"
                checked={permission.canModerate}
                onChange={() => togglePermission(permission.roleId, "canModerate")}
              />
              Moderer
            </label>
          </div>
        ))}
      </div>
      <button className="teal-action" type="button" onClick={() => onSave(category.id, draft)}>
        Sauver les roles
      </button>
    </section>
  );
}

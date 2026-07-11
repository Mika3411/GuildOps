import React from "react";
import {
  Heart,
  LogOut,
  Mail,
  MailPlus,
  MessageSquare,
  Paperclip,
  Plus,
  Reply,
  Search,
  Send,
  Smile,
  Trash2,
  UserRound,
  UsersRound,
  X
} from "lucide-react";
import {
  isApiConfigured
} from "../../lib/apiClient.js";
import {
  PUBLIC_CHAT_LIMIT_LABEL
} from "../../lib/publicChatGuards.js";
import {
  getDefaultConversation,
  getConversationParticipantIds,
  getConversationInitials,
  getOriginalText,
  getTranslatedText,
  getSourceLanguage,
  getTargetLanguage,
  getTranslationStatusLabel,
  formatChatTime,
  isGroupConversation
} from "../../lib/guildOpsTransforms.js";
import {
  EmptyState,
  LiveStatus,
  ModuleHero,
  PanelHeader,
  TranslationPanel
} from "../shared/Shared.jsx";

function getRecipientName(recipient = {}) {
  return recipient.nickname || recipient.displayName || "Membre";
}

function getRecipientMeta(recipient = {}) {
  return [recipient.email, recipient.role, recipient.status || recipient.preferredLanguage].filter(Boolean).join(" · ");
}

function getRecipientSearchValue(recipient = {}) {
  return [recipient.nickname, recipient.displayName, recipient.email, recipient.role, recipient.status, recipient.preferredLanguage]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function getReplyPreviewText(replyTo = {}) {
  return String(replyTo.text || "Message cité").trim() || "Message cité";
}

function getMessageReaderNames(message = {}) {
  if (!Array.isArray(message.readBy)) return [];

  const names = message.readBy
    .map((reader) => String(reader?.displayName || reader?.nickname || reader?.name || "").trim())
    .filter(Boolean);

  return [...new Set(names)];
}

function getReadTooltipText(message = {}) {
  const readerNames = getMessageReaderNames(message);

  if (!message.read) return "Pas encore lu";
  if (!readerNames.length) return "Lu";
  if (readerNames.length === 1) return `Lu par ${readerNames[0]}`;
  if (readerNames.length <= 3) return `Lu par ${readerNames.join(", ")}`;

  return `Lu par ${readerNames.slice(0, 3).join(", ")} et ${readerNames.length - 3} autres`;
}

function getMessageImageAttachments(message = {}) {
  return Array.isArray(message.attachments)
    ? message.attachments.filter((attachment) => attachment?.type === "image" && (attachment.dataUrl || attachment.url))
    : [];
}

const MESSAGE_EMOJIS = Object.freeze([
  "👍",
  "🔥",
  "❤️",
  "😂",
  "👏",
  "✅",
  "⚔️",
  "🛡️",
  "📌",
  "👀",
  "🙏",
  "🎯",
  "💬",
  "😄",
  "😮",
  "😢",
]);

function MessageAttachments({ attachments = [] }) {
  const images = attachments.filter((attachment) => attachment?.type === "image" && (attachment.dataUrl || attachment.url));

  if (!images.length) return null;

  return (
    <span className="thread-message-media">
      {images.map((attachment) => {
        const src = attachment.dataUrl || attachment.url;

        return (
          <img
            src={src}
            alt={attachment.alt || attachment.name || "Image envoyée"}
            loading="lazy"
            key={attachment.id || src}
          />
        );
      })}
    </span>
  );
}

const CREST_VARIANTS = [
  { tone: "gold", symbol: "tower", a: "#d9a747", b: "#6a421d" },
  { tone: "red", symbol: "blade", a: "#b84b4b", b: "#542126" },
  { tone: "emerald", symbol: "spire", a: "#78b978", b: "#244832" },
  { tone: "sapphire", symbol: "helm", a: "#72a6c9", b: "#223b55" },
  { tone: "steel", symbol: "helm", a: "#c9c4b8", b: "#4a4a42" },
];

function getStringHash(value = "") {
  return [...String(value || "GuildOps")].reduce((hash, letter) => (hash * 31 + letter.charCodeAt(0)) % 997, 17);
}

function getCrestVariant(label = "") {
  return CREST_VARIANTS[getStringHash(label) % CREST_VARIANTS.length];
}

function CrestSymbol({ symbol }) {
  if (symbol === "tower") {
    return (
      <>
        <path className="faction-crest-symbol" d="M44 23l-11 51h22L44 23Z" />
        <path className="faction-crest-line" d="M31 43h26M28 74h32M39 34l10 13M49 34L39 47" />
        <path className="faction-crest-line" d="M28 34c7-10 25-10 32 0M21 27c12-16 34-16 46 0" />
      </>
    );
  }

  if (symbol === "blade") {
    return (
      <>
        <path className="faction-crest-symbol" d="M44 20l12 21-7 34H39l-7-34 12-21Z" />
        <path className="faction-crest-line" d="M44 25v51M30 58h28M34 74h20" />
      </>
    );
  }

  if (symbol === "spire") {
    return (
      <>
        <path className="faction-crest-symbol" d="M44 18l19 37-19 31-19-31 19-37Z" />
        <path className="faction-crest-line" d="M44 23v55M27 56h34M35 42l9-13 9 13" />
      </>
    );
  }

  return (
    <>
      <path className="faction-crest-symbol" d="M25 50c7-18 31-18 38 0l-8 27H33l-8-27Z" />
      <path className="faction-crest-line" d="M30 52h28M36 42l-7-13M52 42l7-13M39 77V63h10v14" />
    </>
  );
}

function FactionCrest({ className = "", compact = false, label = "GuildOps" }) {
  const variant = getCrestVariant(label);

  return (
    <span
      className={`faction-crest is-${variant.tone}${compact ? " is-compact" : ""}${className ? ` ${className}` : ""}`}
      style={{ "--crest-a": variant.a, "--crest-b": variant.b }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 88 100" focusable="false">
        <path className="faction-crest-wing" d="M8 24l16-8 5 12-12 8 12 8-5 12L8 48Z" />
        <path className="faction-crest-wing" d="M80 24l-16-8-5 12 12 8-12 8 5 12 16-8Z" />
        <path className="faction-crest-back" d="M44 3l34 13v50L44 97 10 66V16L44 3Z" />
        <path className="faction-crest-cap" d="M27 12h34l8 9-25 10-25-10 8-9Z" />
        <path className="faction-crest-frame" d="M44 9l28 11v43L44 90 16 63V20l28-11Z" />
        <path className="faction-crest-fill" d="M44 18l20 8v32L44 78 24 58V26l20-8Z" />
        <path className="faction-crest-notch" d="M25 27l19-7 19 7M27 59l17 15 17-15M20 37h9M59 37h9" />
        <circle className="faction-crest-rivet" cx="21" cy="24" r="2" />
        <circle className="faction-crest-rivet" cx="67" cy="24" r="2" />
        <circle className="faction-crest-rivet" cx="24" cy="64" r="2" />
        <circle className="faction-crest-rivet" cx="64" cy="64" r="2" />
        <path className="faction-crest-sheen" d="M25 21l25-10 11 5-36 15Z" />
        <CrestSymbol symbol={variant.symbol} />
      </svg>
    </span>
  );
}

function CommsCrest() {
  return (
    <svg className="comms-crest-art" viewBox="0 0 96 104" aria-hidden="true" focusable="false">
      <path className="comms-outer" d="M48 4l38 15v48L48 100 10 67V19L48 4Z" />
      <path className="comms-inner" d="M48 14l28 11v36L48 88 20 61V25l28-11Z" />
      <path className="comms-scroll" d="M29 31h38v32c0 8-7 14-15 14h-8c-8 0-15-6-15-14V31Z" />
      <path className="comms-ribbon" d="M25 31c0-6 5-10 11-10h24c6 0 11 4 11 10H25Z" />
      <path className="comms-seal" d="M48 48l8 5-2 9h-12l-2-9 8-5Z" />
      <path className="comms-line" d="M36 38h24M36 45h24M35 68h26" />
      <path className="comms-rune" d="M38 56l5-5 5 5M58 56l-5-5-5 5" />
    </svg>
  );
}

function SignalTowerMark() {
  return (
    <svg className="signal-tower-art" viewBox="0 0 112 116" aria-hidden="true" focusable="false">
      <path className="signal-tower-shell" d="M56 4l42 18v50L56 112 14 72V22L56 4Z" />
      <path className="signal-tower-inner" d="M56 17l29 13v34L56 94 27 64V30l29-13Z" />
      <path className="signal-tower-spikes" d="M20 46H6M92 46h14M26 24L15 13M86 24l11-11M26 75L15 86M86 75l11 11" />
      <path className="signal-tower-beam" d="M56 34l-13 48h26L56 34Z" />
      <path className="signal-tower-lines" d="M48 53h16M44 68h24M51 45l10 13M61 45L51 58M46 82h20" />
      <path className="signal-tower-waves" d="M42 32c7-8 21-8 28 0M35 25c11-13 31-13 42 0M28 18c16-18 40-18 56 0" />
    </svg>
  );
}

function isEmailSearch(value = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function getThreadParticipants(conversation = {}, recipients = []) {
  const participantsById = new Map();

  (conversation.participants || []).forEach((participant) => {
    if (participant?.id) participantsById.set(participant.id, participant);
  });
  recipients.forEach((recipient) => {
    if (recipient?.id && !participantsById.has(recipient.id)) {
      participantsById.set(recipient.id, recipient);
    }
  });

  return getConversationParticipantIds(conversation).map((id) => {
    const participant = participantsById.get(id);

    if (participant) return participant;

    return {
      id,
      displayName: conversation.participantId === id ? conversation.title : "Membre",
      nickname: conversation.participantId === id ? conversation.title : "Membre",
    };
  });
}

function focusThreadComposer() {
  window.requestAnimationFrame(() => {
    const composer = document.querySelector(".thread-input");
    const textarea = composer?.querySelector("textarea");

    composer?.scrollIntoView({ behavior: "smooth", block: "center" });
    textarea?.focus();
  });
}

export function InternalMessages({
  activeConversation,
  conversations = [],
  messageRecipients = [],
  onDeleteConversation,
  onInviteByEmail,
  onSelectConversation,
  onStartGroupConversation,
  onStartPrivateConversation,
  realtimeStatus = "API requise",
  unreadCount = 0,
}) {
  const [groupComposerOpen, setGroupComposerOpen] = React.useState(false);
  const [groupFeedback, setGroupFeedback] = React.useState("");
  const [groupMemberIds, setGroupMemberIds] = React.useState([]);
  const [groupQuery, setGroupQuery] = React.useState("");
  const [recipientQuery, setRecipientQuery] = React.useState("");
  const [inviteFeedback, setInviteFeedback] = React.useState({ email: "", message: "", status: "idle" });
  const visibleConversations = conversations;
  const normalizedGroupQuery = groupQuery.trim().toLowerCase();
  const normalizedRecipientQuery = recipientQuery.trim().toLowerCase();
  const selectedGroupMembers = React.useMemo(
    () => groupMemberIds.map((id) => messageRecipients.find((recipient) => recipient.id === id)).filter(Boolean),
    [groupMemberIds, messageRecipients],
  );
  const groupRecipientMatches = React.useMemo(() => {
    return messageRecipients
      .filter((recipient) => !normalizedGroupQuery || getRecipientSearchValue(recipient).includes(normalizedGroupQuery))
      .slice(0, 10);
  }, [messageRecipients, normalizedGroupQuery]);
  const recipientMatches = React.useMemo(() => {
    if (!normalizedRecipientQuery) return [];
    return messageRecipients
      .filter((recipient) => getRecipientSearchValue(recipient).includes(normalizedRecipientQuery))
      .slice(0, 8);
  }, [messageRecipients, normalizedRecipientQuery]);
  const canInviteByEmail = isEmailSearch(normalizedRecipientQuery) && recipientMatches.length === 0;

  function startRecipientConversation(recipientId) {
    onStartPrivateConversation?.(recipientId);
    setRecipientQuery("");
    setInviteFeedback({ email: "", message: "", status: "idle" });
  }

  function dismissEmailPrompt() {
    setRecipientQuery("");
    setInviteFeedback({ email: "", message: "", status: "idle" });
  }

  function resetGroupComposer() {
    setGroupComposerOpen(false);
    setGroupFeedback("");
    setGroupMemberIds([]);
    setGroupQuery("");
  }

  function toggleGroupMember(recipientId) {
    setGroupFeedback("");
    setGroupMemberIds((current) =>
      current.includes(recipientId) ? current.filter((id) => id !== recipientId) : [...current, recipientId],
    );
  }

  function createGroupConversation() {
    if (groupMemberIds.length < 2) {
      setGroupFeedback("Sélectionne au moins deux membres.");
      return;
    }

    onStartGroupConversation?.(groupMemberIds);
    resetGroupComposer();
    setRecipientQuery("");
    setInviteFeedback({ email: "", message: "", status: "idle" });
  }

  async function inviteEmail() {
    if (!canInviteByEmail || !onInviteByEmail) return;

    setInviteFeedback({ email: normalizedRecipientQuery, message: "Vérification du compte...", status: "pending" });

    try {
      const payload = await onInviteByEmail(normalizedRecipientQuery);

      if (payload?.recipient?.id) {
        startRecipientConversation(payload.recipient.id);
        return;
      }

      setInviteFeedback({
        email: normalizedRecipientQuery,
        message: payload?.message || `Mail d'inscription envoyé à ${normalizedRecipientQuery}.`,
        status: "sent",
      });
    } catch (error) {
      setInviteFeedback({
        email: normalizedRecipientQuery,
        message: error?.message || "Impossible d'envoyer le mail d'inscription pour le moment.",
        status: "error",
      });
    }
  }

  return (
    <aside className={`message-inbox-pane ${groupComposerOpen ? "is-grouping" : ""} ${visibleConversations.length ? "" : "is-empty"}`.trim()}>
      <header className="message-inbox-header">
        <span>
          <Mail size={18} />
          <strong>Conversations</strong>
        </span>
        <div className="message-inbox-actions">
          <button
            type="button"
            className={groupComposerOpen ? "is-active" : ""}
            onClick={() => {
              setGroupComposerOpen((current) => !current);
              setGroupFeedback("");
            }}
            aria-expanded={groupComposerOpen}
          >
            <UsersRound size={14} />
            Groupe
          </button>
          <LiveStatus as="em">{unreadCount} non lus</LiveStatus>
        </div>
      </header>
      <p className="message-inbox-status" aria-live="polite">{realtimeStatus}</p>
      {groupComposerOpen ? (
        <div className="message-group-composer">
          <header>
            <span>
              <UsersRound size={15} />
              <strong>Nouveau groupe</strong>
            </span>
            <button type="button" onClick={resetGroupComposer} aria-label="Fermer le nouveau groupe">
              <X size={13} />
            </button>
          </header>
          <input
            type="search"
            value={groupQuery}
            placeholder="Rechercher des membres"
            onChange={(event) => setGroupQuery(event.target.value)}
          />
          {selectedGroupMembers.length ? (
            <div className="message-group-selected">
              {selectedGroupMembers.map((recipient) => (
                <span key={recipient.id}>
                  {getRecipientName(recipient)}
                  <button type="button" onClick={() => toggleGroupMember(recipient.id)} aria-label={`Retirer ${getRecipientName(recipient)}`}>
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <div className="message-group-options">
            {groupRecipientMatches.length ? (
              groupRecipientMatches.map((recipient) => (
                <label key={recipient.id}>
                  <input
                    type="checkbox"
                    checked={groupMemberIds.includes(recipient.id)}
                    onChange={() => toggleGroupMember(recipient.id)}
                  />
                  <span>
                    <strong>{getRecipientName(recipient)}</strong>
                    <small>{getRecipientMeta(recipient) || "Membre"}</small>
                  </span>
                </label>
              ))
            ) : (
              <p>Aucun membre trouvé.</p>
            )}
          </div>
          <div className="message-group-actions">
            <button type="button" onClick={createGroupConversation}>
              Créer le groupe
            </button>
            <button type="button" className="is-secondary" onClick={resetGroupComposer}>
              Annuler
            </button>
          </div>
          {groupFeedback ? <small className="message-group-feedback" aria-live="polite">{groupFeedback}</small> : null}
        </div>
      ) : null}
      <div className="message-recipient-search">
        <label>
          <span>
            <Search size={14} />
            Chercher un membre
          </span>
          <input
            type="search"
            value={recipientQuery}
            placeholder="Nom, pseudo ou email"
            onChange={(event) => {
              setRecipientQuery(event.target.value);
              setInviteFeedback({ email: "", message: "", status: "idle" });
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && recipientMatches[0]) {
                event.preventDefault();
                startRecipientConversation(recipientMatches[0].id);
              }
            }}
          />
        </label>
        {normalizedRecipientQuery ? (
          <div className="message-recipient-results" aria-live="polite">
            {recipientMatches.length ? (
              recipientMatches.map((recipient) => (
                <button
                  type="button"
                  className="message-recipient-result"
                  key={recipient.id}
                  onClick={() => startRecipientConversation(recipient.id)}
                >
                  <FactionCrest compact label={getRecipientName(recipient)} />
                  <span>
                    <strong>{getRecipientName(recipient)}</strong>
                    <small>{getRecipientMeta(recipient) || "Message direct"}</small>
                  </span>
                  <UserRound size={15} />
                </button>
              ))
            ) : (
              <div className="message-email-invite">
                {canInviteByEmail ? (
                  <>
                    <MailPlus size={16} />
                    <span>
                      <strong>Ce membre n'existe pas encore.</strong>
                      <small>Souhaitez-vous lui envoyer un mail d'invitation à s'inscrire ?</small>
                      <small>{normalizedRecipientQuery}</small>
                    </span>
                    <div className="message-email-actions">
                      <button type="button" onClick={inviteEmail} disabled={inviteFeedback.status === "pending"}>
                        {inviteFeedback.status === "pending" ? "Envoi..." : "Envoyer le mail"}
                      </button>
                      <button
                        type="button"
                        className="is-secondary"
                        onClick={dismissEmailPrompt}
                        disabled={inviteFeedback.status === "pending"}
                      >
                        Annuler
                      </button>
                    </div>
                  </>
                ) : (
                  <p>Aucun membre trouvé.</p>
                )}
              </div>
            )}
          </div>
        ) : null}
        {inviteFeedback.message ? (
          <p className={`message-invite-feedback is-${inviteFeedback.status}`} aria-live="polite">{inviteFeedback.message}</p>
        ) : null}
      </div>
      <div className="message-list">
        {visibleConversations.length ? (
          visibleConversations.map((conversation) => (
            <article
              className={`message-row ${activeConversation?.id === conversation.id ? "is-active" : ""}`}
              key={conversation.id}
              aria-current={activeConversation?.id === conversation.id ? "true" : undefined}
            >
              <button type="button" className="message-row-main" onClick={() => onSelectConversation?.(conversation)}>
                <FactionCrest label={conversation.title} />
                <span>
                  <strong>{conversation.title}</strong>
                  <small>
                    {conversation.author}: {conversation.preview}
                  </small>
                </span>
                <time>{formatChatTime({ createdAt: conversation.lastMessageAt })}</time>
                {conversation.unreadCount ? <i>{conversation.unreadCount}</i> : null}
              </button>
              <button
                type="button"
                className="message-row-action"
                onClick={() => onDeleteConversation?.(conversation.id)}
                aria-label={`Supprimer ${conversation.title || "la conversation"}`}
              >
                <Trash2 size={14} />
              </button>
            </article>
          ))
        ) : (
          <EmptyState
            actionIcon={Send}
            actionLabel="Envoyer un message"
            icon={Mail}
            title="Canal prêt, aucun échange"
            text="C'est normal pour une nouvelle guilde: personne n'a encore lancé la discussion. Envoie le premier message au canal de guilde."
            onAction={focusThreadComposer}
            compact
          />
        )}
      </div>
    </aside>
  );
}

export function MessageThread({
  activeConversation,
  loadOlderThreadMessages,
  messageRecipients = [],
  messageNextCursor,
  onAddConversationMember,
  onDeleteConversation,
  onLeaveGroupConversation,
  onReplyToThreadMessage,
  onRemoveConversationMember,
  onToggleThreadMessageLike,
  threadMessages = [],
}) {
  const conversation = activeConversation || getDefaultConversation();
  const [memberPickerOpen, setMemberPickerOpen] = React.useState(false);
  const [selectedMemberId, setSelectedMemberId] = React.useState("");
  const participantIds = getConversationParticipantIds(conversation);
  const participants = getThreadParticipants(conversation, messageRecipients);
  const canManageParticipants = conversation.type === "private" || isGroupConversation(conversation);
  const displayParticipants = participants.length ? participants : messageRecipients.slice(0, 8);
  const availableRecipients = messageRecipients.filter((recipient) => recipient.id && !participantIds.includes(recipient.id));

  React.useEffect(() => {
    setMemberPickerOpen(false);
    setSelectedMemberId("");
  }, [conversation.id]);

  function addSelectedMember() {
    if (!selectedMemberId) return;
    onAddConversationMember?.(selectedMemberId);
    setMemberPickerOpen(false);
    setSelectedMemberId("");
  }

  return (
    <section className="message-thread-panel">
      <header className="message-thread-header">
        <span className="message-thread-title">
          <FactionCrest compact label={conversation.title || conversation.channel || "Guilde"} />
          <span>
            <small>
              {isGroupConversation(conversation)
                ? "Conversation de groupe"
                : conversation.type === "private"
                  ? "Message privé"
                  : `Canal ${conversation.channel || "general"}`}
            </small>
            <strong>{conversation.title || "Guilde"}</strong>
          </span>
        </span>
        {displayParticipants.length ? (
          <div
            className="message-thread-participant-strip"
            aria-label={`${displayParticipants.length} participant${displayParticipants.length > 1 ? "s" : ""}`}
          >
            <span>Participants</span>
            <div>
              {displayParticipants.slice(0, 8).map((participant) => (
                <FactionCrest compact key={participant.id} label={getRecipientName(participant)} />
              ))}
            </div>
            <strong>{displayParticipants.length}</strong>
          </div>
        ) : null}
        <div className="message-thread-actions">
          {availableRecipients.length ? (
            <button
              type="button"
              className={`is-add ${memberPickerOpen ? "is-active" : ""}`}
              onClick={() => setMemberPickerOpen((current) => !current)}
              aria-label="Ajouter un membre à la conversation"
              aria-expanded={memberPickerOpen}
              title="Ajouter un membre"
            >
              <Plus size={17} />
            </button>
          ) : null}
          {isGroupConversation(conversation) ? (
            <button type="button" className="is-warning" onClick={() => onLeaveGroupConversation?.(conversation.id)}>
              <LogOut size={14} />
              Quitter
            </button>
          ) : null}
          <button type="button" className="is-danger" onClick={() => onDeleteConversation?.(conversation.id)}>
            <Trash2 size={14} />
            Supprimer
          </button>
          {messageNextCursor ? (
            <button type="button" className="link-action inline" onClick={loadOlderThreadMessages}>
              Plus ancien
            </button>
          ) : null}
        </div>
      </header>
      {memberPickerOpen ? (
        <div className="message-member-picker">
          <label>
            <span>Ajouter un membre</span>
            <select value={selectedMemberId} onChange={(event) => setSelectedMemberId(event.target.value)}>
              <option value="">Choisir un membre</option>
              {availableRecipients.map((recipient) => (
                <option key={recipient.id} value={recipient.id}>
                  {getRecipientName(recipient)}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={addSelectedMember} disabled={!selectedMemberId}>
            Ajouter
          </button>
          <button type="button" className="is-secondary" onClick={() => setMemberPickerOpen(false)} aria-label="Fermer l'ajout de membre">
            <X size={14} />
          </button>
        </div>
      ) : null}
      {canManageParticipants ? (
        <div className="message-participants-panel">
          <div className="message-participants-heading">
            <span>Participants</span>
            <em>{participants.length}</em>
          </div>
          <div className="message-participant-list">
            {participants.map((participant) => (
              <span className="message-participant-chip" key={participant.id}>
                {getRecipientName(participant)}
                <button
                  type="button"
                  onClick={() => onRemoveConversationMember?.(participant.id)}
                  disabled={participants.length <= 1}
                  aria-label={`Retirer ${getRecipientName(participant)} de la conversation`}
                >
                  <X size={13} />
                </button>
              </span>
            ))}
          </div>
        </div>
      ) : null}
      <div className="thread-feed">
        {threadMessages.length ? (
          threadMessages.map((message) => (
            <article className={`thread-message ${message.isOwn ? "is-own" : ""}`} key={message.id}>
              <FactionCrest className="thread-message-crest" compact label={message.author || (message.isOwn ? "Moi" : "Membre")} />
              <div className="thread-message-copy">
                {message.replyTo ? (
                  <span className="thread-message-reply">
                    <small>Réponse à {message.replyTo.author || "Membre"}</small>
                    <span>{getReplyPreviewText(message.replyTo)}</span>
                  </span>
                ) : null}
                <strong>{message.author || (message.isOwn ? "Moi" : "Membre")}</strong>
                <span>{getTranslatedText(message)}</span>
                <MessageAttachments attachments={getMessageImageAttachments(message)} />
                <small className="thread-message-meta">
                  <time>{formatChatTime(message)}</time>
                  <span
                    className={`thread-read-status ${message.read ? "is-read" : "is-unread"}`}
                    tabIndex={0}
                    aria-label={getReadTooltipText(message)}
                    title={getReadTooltipText(message)}
                  >
                    {message.read ? "Lu" : "Non lu"}
                    <span className="thread-read-tooltip" role="tooltip">
                      {getReadTooltipText(message)}
                    </span>
                  </span>
                </small>
                <span className="thread-message-actions" aria-label="Actions du message">
                  <button
                    type="button"
                    className={`thread-message-action is-like ${message.likedByMe ? "is-active" : ""}`}
                    onClick={() => onToggleThreadMessageLike?.(message.id)}
                    aria-pressed={Boolean(message.likedByMe)}
                    aria-label={`${message.likedByMe ? "Retirer le like" : "Liker"} le message de ${message.author || "ce membre"}`}
                  >
                    <Heart size={14} fill={message.likedByMe ? "currentColor" : "none"} />
                    <span>{message.likeCount ? message.likeCount : "J'aime"}</span>
                  </button>
                  <button
                    type="button"
                    className="thread-message-action is-reply"
                    onClick={() => onReplyToThreadMessage?.(message.id)}
                    aria-label={`Répondre au message de ${message.author || "ce membre"}`}
                  >
                    <Reply size={14} />
                    <span>Répondre</span>
                  </button>
                </span>
              </div>
            </article>
          ))
        ) : (
          <EmptyState
            actionIcon={Send}
            actionLabel="Envoyer un message"
            className="thread-empty-state"
            icon={MessageSquare}
            title="Aucun message pour l'instant"
            text="Le fil est neuf, ce qui est attendu au démarrage d'une guilde. Un premier message suffit à ouvrir la coordination."
            onAction={focusThreadComposer}
            compact
          />
        )}
      </div>
    </section>
  );
}

export function ThreadComposer({
  activeConversation,
  messageAttachment,
  messageDraft,
  messageError,
  messageReplyTarget,
  onAttachMessageImage,
  onCancelMessageReply,
  onClearMessageAttachment,
  sendGuildThreadMessage,
  setMessageDraft,
}) {
  const conversation = activeConversation || getDefaultConversation();
  const emojiPickerId = React.useId();
  const emojiMenuRef = React.useRef(null);
  const emojiToggleRef = React.useRef(null);
  const fileInputRef = React.useRef(null);
  const textareaRef = React.useRef(null);
  const [emojiPickerOpen, setEmojiPickerOpen] = React.useState(false);
  const canSend = Boolean(messageDraft.trim() || messageAttachment);

  React.useEffect(() => {
    if (!emojiPickerOpen) return undefined;

    function handlePointerDown(event) {
      if (emojiMenuRef.current?.contains(event.target)) return;
      if (emojiToggleRef.current?.contains(event.target)) return;
      setEmojiPickerOpen(false);
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") setEmojiPickerOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [emojiPickerOpen]);

  function insertEmoji(emoji) {
    const textarea = textareaRef.current;
    const selectionStart = textarea?.selectionStart ?? messageDraft.length;
    const selectionEnd = textarea?.selectionEnd ?? messageDraft.length;

    setMessageDraft((currentDraft) => {
      const current = String(currentDraft || "");
      const start = Math.min(selectionStart, current.length);
      const end = Math.min(Math.max(selectionEnd, start), current.length);

      return `${current.slice(0, start)}${emoji}${current.slice(end)}`;
    });
    setEmojiPickerOpen(false);

    window.requestAnimationFrame(() => {
      const nextTextarea = textareaRef.current;
      if (!nextTextarea) return;

      const caretPosition = selectionStart + emoji.length;
      nextTextarea.focus();
      nextTextarea.setSelectionRange(caretPosition, caretPosition);
    });
  }

  function handleSendMessage() {
    if (!canSend) return;
    setEmojiPickerOpen(false);
    sendGuildThreadMessage();
  }

  return (
    <div className="thread-input">
      <span>Message</span>
      {messageReplyTarget ? (
        <div className="thread-reply-target">
          <span>
            <small>Réponse à {messageReplyTarget.author || "Membre"}</small>
            <strong>{getReplyPreviewText(messageReplyTarget)}</strong>
          </span>
          <button type="button" onClick={onCancelMessageReply} aria-label="Annuler la réponse">
            <X size={14} />
          </button>
        </div>
      ) : null}
      {messageAttachment ? (
        <div className="thread-attachment-preview">
          <img src={messageAttachment.dataUrl || messageAttachment.url} alt={messageAttachment.alt || "Image sélectionnée"} />
          <span>
            <small>
              {messageAttachment.compressed
                ? `Image compressée · ${messageAttachment.compressionLabel || "optimisée"}`
                : "Image jointe"}
            </small>
            <strong>{messageAttachment.name || "Image"}</strong>
          </span>
          <button type="button" onClick={() => onClearMessageAttachment?.()} aria-label="Retirer l'image">
            <X size={14} />
          </button>
        </div>
      ) : null}
      {emojiPickerOpen ? (
        <div className="thread-emoji-picker" id={emojiPickerId} ref={emojiMenuRef} role="listbox" aria-label="Émojis rapides">
          {MESSAGE_EMOJIS.map((emoji) => (
            <button
              type="button"
              className="thread-emoji-option"
              key={emoji}
              onClick={() => insertEmoji(emoji)}
              aria-label={`Insérer ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      ) : null}
      <div className="thread-input-box">
        <button
          type="button"
          className="thread-attach-button"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Ajouter une image"
        >
          <Paperclip size={20} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="thread-file-input"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onAttachMessageImage?.(file);
            event.target.value = "";
          }}
        />
        <textarea
          ref={textareaRef}
          value={messageDraft}
          placeholder={conversation.type === "private" ? "Ecrire ici..." : "Ecrire ici..."}
          aria-label="Message"
          onChange={(event) => setMessageDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              handleSendMessage();
            }
          }}
        />
        <button
          ref={emojiToggleRef}
          type="button"
          className={`thread-emoji-toggle ${emojiPickerOpen ? "is-active" : ""}`}
          onClick={() => setEmojiPickerOpen((current) => !current)}
          aria-label="Ajouter un emoji"
          aria-expanded={emojiPickerOpen}
          aria-controls={emojiPickerId}
        >
          <Smile size={20} />
        </button>
      </div>
      <button type="button" onClick={handleSendMessage} disabled={!canSend} aria-label="Envoyer le message">
        <Send size={15} />
        Envoyer
      </button>
      {messageError ? <small className="form-note" aria-live="polite">{messageError}</small> : null}
    </div>
  );
}

export function GuestChat({
  chatMessages,
  chatDraft,
  chatNotice = "",
  cooldownSeconds = 0,
  publicChatEnabled = true,
  setChatDraft,
  sendChat,
  translateOn,
}) {
  const cooldownRemaining = Math.max(0, Number(cooldownSeconds) || 0);
  const chatButtonDisabled = !publicChatEnabled || cooldownRemaining > 0;

  return (
    <section className="panel guest-chat">
      <PanelHeader
        icon={MessageSquare}
        title="Chat invite"
        meta={
          publicChatEnabled
            ? cooldownRemaining > 0
              ? `Pause ${cooldownRemaining}s`
              : isApiConfigured()
                ? PUBLIC_CHAT_LIMIT_LABEL
                : "API requise"
            : "Désactivé"
        }
      />
      {publicChatEnabled ? (
        <div className="chat-feed">
          {chatMessages.length ? (
            chatMessages.slice(-4).map((message) => (
              <p key={message.id} className={message.moderationStatus && message.moderationStatus !== "visible" ? "is-muted" : ""}>
                <time>{formatChatTime(message)}</time>
                <strong>{message.author}</strong>
                <span>{translateOn ? getTranslatedText(message) : getOriginalText(message)}</span>
                <small className="translation-meta">
                  Original {getSourceLanguage(message)} · Cible {getTargetLanguage(message)} ·{" "}
                  {message.moderationStatus && message.moderationStatus !== "visible"
                    ? "moderation"
                    : getTranslationStatusLabel(message)}
                </small>
              </p>
            ))
          ) : (
            <EmptyState icon={MessageSquare} title="Chat calme" text="Le premier message apparaitra ici." compact />
          )}
        </div>
      ) : (
        <p className="empty-state">Le chat invités est desactive dans les sections du site.</p>
      )}
      {isApiConfigured() ? (
        <p className="form-note public-chat-policy">Limite {PUBLIC_CHAT_LIMIT_LABEL}. Certains messages passent en moderation.</p>
      ) : null}
      <label className="chat-input">
        <input
          value={chatDraft}
          disabled={!publicChatEnabled}
          placeholder={publicChatEnabled ? "Ecrire un message..." : "Chat invités désactivé"}
          onChange={(event) => setChatDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && publicChatEnabled) sendChat();
          }}
        />
        <button type="button" onClick={sendChat} disabled={chatButtonDisabled} aria-label="Envoyer le message">
          <Send size={15} />
        </button>
      </label>
      {chatNotice ? (
        <p className="form-note public-chat-notice" aria-live="polite">
          {chatNotice}
        </p>
      ) : null}
    </section>
  );
}

export function MessagesView(props) {
  return (
    <div className="page-grid two-columns messages-page">
      <ModuleHero
        badge={props.unreadMessageCount}
        className="is-utility-compact"
        crest={<FactionCrest label="GuildOps" />}
        eyebrow="Privé"
        mark={<SignalTowerMark />}
        metric={`${props.unreadMessageCount || 0} non lus`}
        title="Messages"
      />
      <section className="panel wide-panel message-inbox-workspace">
        <InternalMessages
          activeConversation={props.activeConversation}
          conversations={props.conversations}
          messageRecipients={props.messageRecipients}
          onInviteByEmail={props.onInviteByEmail}
          onDeleteConversation={props.onDeleteConversation}
          onSelectConversation={props.onSelectConversation}
          onStartGroupConversation={props.onStartGroupConversation}
          onStartPrivateConversation={props.onStartPrivateConversation}
          realtimeStatus={props.messageRealtimeStatus}
          unreadCount={props.unreadMessageCount}
        />
        <MessageThread
          activeConversation={props.activeConversation}
          loadOlderThreadMessages={props.loadOlderThreadMessages}
          messageRecipients={props.messageRecipients}
          messageNextCursor={props.messageNextCursor}
          onAddConversationMember={props.onAddConversationMember}
          onDeleteConversation={props.onDeleteConversation}
          onLeaveGroupConversation={props.onLeaveGroupConversation}
          onReplyToThreadMessage={props.onReplyToThreadMessage}
          onRemoveConversationMember={props.onRemoveConversationMember}
          onToggleThreadMessageLike={props.onToggleThreadMessageLike}
          threadMessages={props.threadMessages}
        />
        <ThreadComposer
          activeConversation={props.activeConversation}
          messageAttachment={props.messageAttachment}
          messageDraft={props.messageDraft}
          messageError={props.messageError}
          messageReplyTarget={props.messageReplyTarget}
          onAttachMessageImage={props.onAttachMessageImage}
          onCancelMessageReply={props.onCancelMessageReply}
          onClearMessageAttachment={props.onClearMessageAttachment}
          sendGuildThreadMessage={props.sendGuildThreadMessage}
          setMessageDraft={props.setMessageDraft}
        />
      </section>
      <GuestChat
        chatMessages={props.chatMessages}
        chatDraft={props.chatDraft}
        chatNotice={props.chatNotice}
        cooldownSeconds={props.chatCooldownSeconds}
        publicChatEnabled={props.siteDraft?.sections?.publicChat}
        setChatDraft={props.setChatDraft}
        sendChat={props.sendChat}
        translateOn={props.translateOn}
      />
      <TranslationPanel
        translateOn={props.translateOn}
        setTranslateOn={props.setTranslateOn}
        targetLanguage={props.targetLanguage}
        setTargetLanguage={props.setTargetLanguage}
      />
    </div>
  );
}

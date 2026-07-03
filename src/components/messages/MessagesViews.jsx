import React from "react";
import {
  Lock,
  Mail,
  MessageSquare,
  Plus,
  Send
} from "lucide-react";
import {
  isApiConfigured
} from "../../lib/apiClient.js";
import {
  PUBLIC_CHAT_LIMIT_LABEL
} from "../../lib/publicChatGuards.js";
import {
  getDefaultConversation,
  getConversationInitials,
  getOriginalText,
  getTranslatedText,
  getSourceLanguage,
  getTargetLanguage,
  getTranslationStatusLabel,
  formatChatTime
} from "../../lib/guildOpsTransforms.js";
import {
  EmptyState,
  PanelHeader,
  TranslationPanel
} from "../shared/Shared.jsx";

export function InternalMessages({
  activeConversation,
  conversations = [],
  onSelectConversation,
  realtimeStatus = "Mode aperçu",
  unreadCount = 0,
}) {
  const visibleConversations = conversations;

  return (
    <section className="panel message-preview">
      <PanelHeader icon={Mail} title="Messagerie interne" meta={`${unreadCount} non lus · ${realtimeStatus}`} />
      <div className="message-list">
        {visibleConversations.length ? (
          visibleConversations.map((conversation) => (
            <button
              type="button"
              className={`message-row ${activeConversation?.id === conversation.id ? "is-active" : ""}`}
              key={conversation.id}
              onClick={() => onSelectConversation?.(conversation)}
            >
              <span className="avatar small">{getConversationInitials(conversation)}</span>
              <span>
                <strong>{conversation.title}</strong>
                <small>
                  {conversation.author}: {conversation.preview}
                </small>
              </span>
              {conversation.unreadCount ? <i>{conversation.unreadCount}</i> : null}
            </button>
          ))
        ) : (
          <EmptyState icon={Mail} title="Aucune conversation" text="Ecris au canal de guilde pour ouvrir le fil." compact />
        )}
      </div>
    </section>
  );
}

export function MessageThread({
  activeConversation,
  loadOlderThreadMessages,
  messageDraft,
  messageError,
  messageNextCursor,
  messageRecipients = [],
  onStartPrivateConversation,
  sendGuildThreadMessage,
  setMessageDraft,
  threadMessages = [],
}) {
  const conversation = activeConversation || getDefaultConversation();

  return (
    <section className="panel message-thread-panel wide-panel">
      <PanelHeader
        icon={conversation.type === "private" ? Lock : Mail}
        title={conversation.title || "Guilde"}
        meta={conversation.type === "private" ? "Message prive" : `Canal ${conversation.channel || "general"}`}
      />
      <div className="thread-toolbar">
        <select
          value=""
          onChange={(event) => {
            if (event.target.value) onStartPrivateConversation?.(event.target.value);
          }}
        >
          <option value="">Nouveau message prive</option>
          {messageRecipients.map((recipient) => (
            <option key={recipient.id} value={recipient.id}>
              {recipient.nickname || recipient.displayName}
            </option>
          ))}
        </select>
        {messageNextCursor ? (
          <button type="button" className="link-action inline" onClick={loadOlderThreadMessages}>
            Plus ancien
          </button>
        ) : null}
      </div>
      <div className="thread-feed">
        {threadMessages.length ? (
          threadMessages.map((message) => (
            <article className={`thread-message ${message.isOwn ? "is-own" : ""}`} key={message.id}>
              <strong>{message.author || (message.isOwn ? "Moi" : "Membre")}</strong>
              <span>{getTranslatedText(message)}</span>
              <small>
                {formatChatTime(message)} · {message.read ? "Lu" : "Non lu"}
              </small>
            </article>
          ))
        ) : (
          <p className="empty-state">Aucun message dans cette conversation.</p>
        )}
      </div>
      <label className="chat-input thread-input">
        <input
          value={messageDraft}
          placeholder={conversation.type === "private" ? "Ecrire un message prive..." : "Ecrire au canal..."}
          onChange={(event) => setMessageDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") sendGuildThreadMessage();
          }}
        />
        <button type="button" onClick={sendGuildThreadMessage} aria-label="Envoyer le message">
          <Send size={15} />
        </button>
      </label>
      {messageError ? <p className="form-note">{messageError}</p> : null}
    </section>
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
                : "Mode aperçu"
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
    <div className="page-grid two-columns">
      <InternalMessages
        activeConversation={props.activeConversation}
        conversations={props.conversations}
        onSelectConversation={props.onSelectConversation}
        realtimeStatus={props.messageRealtimeStatus}
        unreadCount={props.unreadMessageCount}
      />
      <MessageThread
        activeConversation={props.activeConversation}
        loadOlderThreadMessages={props.loadOlderThreadMessages}
        messageDraft={props.messageDraft}
        messageError={props.messageError}
        messageNextCursor={props.messageNextCursor}
        messageRecipients={props.messageRecipients}
        onStartPrivateConversation={props.onStartPrivateConversation}
        sendGuildThreadMessage={props.sendGuildThreadMessage}
        setMessageDraft={props.setMessageDraft}
        threadMessages={props.threadMessages}
      />
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

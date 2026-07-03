import {
  slugify
} from "../guildSiteStore.js";
import {
  normalizeLanguageChoice
} from "./shared.js";

export function getDefaultConversation() {
  return {
    id: "internal:general",
    type: "internal",
    channel: "general",
    title: "Guilde",
    preview: "Aucun message pour le moment",
    author: "GuildOps",
    unreadCount: 0,
    lastMessageAt: null,
  };
}

export function buildLocalConversations(messages = []) {
  const conversations = messages.map((message) => ({
    id: `internal:${slugify(message.channel || "general")}`,
    type: "internal",
    channel: slugify(message.channel || "general") || "general",
    title: message.channel || "Guilde",
    preview: message.text || "",
    author: message.from || "GuildOps",
    unreadCount: Number(message.unread || 0),
    lastMessageAt: message.createdAt || null,
  }));

  return conversations.length ? conversations : [getDefaultConversation()];
}

export function buildLocalThreadMessages(messages = [], activeConversation = getDefaultConversation()) {
  const conversationTitle = activeConversation.title || "";
  return messages
    .filter((message) => !conversationTitle || message.channel === conversationTitle || activeConversation.type === "internal")
    .slice(0, 5)
    .map((message) => ({
      id: `local-thread-${message.id}`,
      author: message.from,
      text: message.text,
      translated: message.text,
      displayText: message.text,
      createdAt: message.createdAt || new Date().toISOString(),
      read: !message.unread,
      isOwn: false,
      conversationType: "internal",
      channel: slugify(message.channel || "general") || "general",
      translationStatus: "original",
    }));
}

export function countLocalUnread(messages = []) {
  return messages.reduce((total, message) => total + Number(message.unread || 0), 0);
}

export function normalizeApiConversation(conversation = {}) {
  if (!conversation) return getDefaultConversation();
  const type = conversation.type === "private" ? "private" : "internal";
  const channel = conversation.channel || "general";
  const participantId = conversation.participantId || conversation.participantUserId;

  return {
    id: conversation.id || (type === "private" ? `private:${participantId}` : `internal:${channel}`),
    type,
    channel,
    participantId,
    title: conversation.title || conversation.name || (type === "private" ? "Message prive" : "Guilde"),
    preview: conversation.preview || "",
    author: conversation.author || "GuildOps",
    unreadCount: Number(conversation.unreadCount || conversation.unread_count || 0),
    lastMessageAt: conversation.lastMessageAt || conversation.last_message_at || null,
  };
}

export function normalizeApiConversations(conversations = []) {
  const normalized = conversations.map(normalizeApiConversation);
  return normalized.length ? normalized : [getDefaultConversation()];
}

export function normalizeApiRecipient(recipient = {}) {
  return {
    id: recipient.id,
    displayName: recipient.displayName || recipient.display_name || recipient.nickname || "Membre",
    nickname: recipient.nickname || recipient.displayName || recipient.display_name || "Membre",
    preferredLanguage: recipient.preferredLanguage || recipient.preferred_language || "fr",
  };
}

export function normalizeApiPrivateMessage(message = {}) {
  const sourceLanguage = normalizeLanguageChoice(message.sourceLanguage || message.original?.language || "auto");
  const targetLanguage = normalizeLanguageChoice(message.targetLanguage || message.translated?.language || sourceLanguage);
  const translatedText = message.translated?.text || message.displayText || message.original?.text || "";
  const originalText = message.original?.text || message.text || translatedText;

  return {
    id: message.id,
    author: message.author || (message.isOwn ? "Moi" : "Membre"),
    source: sourceLanguage,
    target: targetLanguage,
    text: originalText,
    translated: translatedText,
    translationStatus: message.translated?.status || "original",
    translationPending: message.translated?.status === "queued",
    translationProvider: message.translated?.provider || null,
    createdAt: message.createdAt || Date.now(),
    conversationType: message.conversationType || (message.recipientUserId ? "private" : "internal"),
    channel: message.channel || message.metadata?.channel || "general",
    isOwn: Boolean(message.isOwn),
    read: Boolean(message.read),
    recipientUserId: message.recipientUserId || message.recipient_user_id || null,
    senderUserId: message.senderUserId || message.sender_user_id || null,
  };
}

export function buildConversationQuery(conversation = getDefaultConversation()) {
  return {
    conversationType: conversation.type || "internal",
    channel: conversation.channel || "general",
    participantId: conversation.type === "private" ? conversation.participantId : undefined,
  };
}

export function buildConversationReadBody(conversation = getDefaultConversation()) {
  return buildConversationQuery(conversation);
}

export function messageMatchesConversation(message = {}, conversation = getDefaultConversation()) {
  if (!message || !conversation) return false;
  if (conversation.type === "private") {
    return (
      message.conversationType === "private" &&
      (message.senderUserId === conversation.participantId || message.recipientUserId === conversation.participantId)
    );
  }

  return message.conversationType !== "private" && (message.channel || "general") === (conversation.channel || "general");
}

export function upsertConversationFromMessage(current = [], message = {}, activeConversation = getDefaultConversation()) {
  const conversation =
    message.conversationType === "private"
      ? {
          id: `private:${message.isOwn ? message.recipientUserId : message.senderUserId}`,
          type: "private",
          participantId: message.isOwn ? message.recipientUserId : message.senderUserId,
          title: message.isOwn ? activeConversation?.title || "Message prive" : message.author || "Message prive",
          preview: getOriginalText(message),
          author: message.author || "Membre",
          unreadCount: message.isOwn || messageMatchesConversation(message, activeConversation) ? 0 : 1,
          lastMessageAt: message.createdAt,
        }
      : {
          id: `internal:${message.channel || "general"}`,
          type: "internal",
          channel: message.channel || "general",
          title: message.channel === "general" ? "Guilde" : message.channel || "Guilde",
          preview: getOriginalText(message),
          author: message.author || "Membre",
          unreadCount: message.isOwn || messageMatchesConversation(message, activeConversation) ? 0 : 1,
          lastMessageAt: message.createdAt,
        };
  const existing = current.find((item) => item.id === conversation.id);
  const merged = existing
    ? {
        ...existing,
        ...conversation,
        unreadCount: conversation.unreadCount ? Number(existing.unreadCount || 0) + 1 : conversation.unreadCount,
      }
    : conversation;

  return [merged, ...current.filter((item) => item.id !== conversation.id)];
}

export function getConversationInitials(conversation = {}) {
  return String(conversation.title || "GM")
    .split(/[\s_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function buildLocalOutgoingMessage(text, conversation = getDefaultConversation(), currentUser = {}, targetLanguage = "FR") {
  return {
    id: `local-message-${Date.now()}`,
    author: currentUser.displayName || "Moi",
    source: normalizeLanguageChoice(currentUser.preferredLanguage || "AUTO"),
    target: targetLanguage,
    text,
    translated: translateMessage(text, targetLanguage),
    translationStatus: "original",
    createdAt: new Date().toISOString(),
    conversationType: conversation.type || "internal",
    channel: conversation.channel || "general",
    recipientUserId: conversation.participantId || null,
    senderUserId: currentUser.id || null,
    isOwn: true,
    read: true,
  };
}

export function translateMessage(text, target) {
  if (target === "FR") {
    if (/rally/i.test(text)) return "Rassemblement signale. Merci de confirmer votre presence.";
    if (/help|attack/i.test(text)) return "Aide demandee. Attaque en cours.";
    return `Traduit FR: ${text}`;
  }
  return text;
}

export function normalizeApiChatMessage(message = {}) {
  const sourceLanguage = normalizeLanguageChoice(message.sourceLanguage || message.original?.language || "auto");
  const targetLanguage = normalizeLanguageChoice(message.targetLanguage || message.translated?.language || sourceLanguage);
  const translatedText = message.translated?.text || message.displayText || message.original?.text || "";
  const originalText = message.original?.text || message.text || translatedText;

  return {
    id: message.id,
    author: message.author || "Invite",
    source: sourceLanguage,
    target: targetLanguage,
    text: originalText,
    translated: translatedText,
    translationStatus: message.translated?.status || "original",
    translationPending: message.translated?.status === "queued",
    translationProvider: message.translated?.provider || null,
    createdAt: message.createdAt || Date.now(),
    moderationStatus: message.moderationStatus || message.moderation_status || "visible",
    public: true,
  };
}

export function getOriginalText(message = {}) {
  return message.text || message.original?.text || "";
}

export function getTranslatedText(message = {}) {
  if (message.translationPending) return `${getOriginalText(message)} (traduction en cours)`;
  return message.translated || message.translated?.text || message.displayText || getOriginalText(message);
}

export function getSourceLanguage(message = {}) {
  return normalizeLanguageChoice(message.source || message.sourceLanguage || message.original?.language || "auto");
}

export function getTargetLanguage(message = {}) {
  return normalizeLanguageChoice(message.target || message.targetLanguage || message.translated?.language || getSourceLanguage(message));
}

export function getTranslationStatusLabel(message = {}) {
  const status = message.translationStatus || message.translated?.status || "original";
  if (status === "cached") return "cache";
  if (status === "queued") return "en file";
  return "original";
}

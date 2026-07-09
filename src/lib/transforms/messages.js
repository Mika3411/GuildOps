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
  const conversationsByChannel = new Map();

  messages.forEach((message) => {
    const channel = slugify(message.channel || "general") || "general";
    const existing = conversationsByChannel.get(channel);

    conversationsByChannel.set(channel, {
      id: `internal:${channel}`,
      type: "internal",
      channel,
      title: message.channel || "Guilde",
      preview: message.text || existing?.preview || "",
      author: message.from || existing?.author || "GuildOps",
      unreadCount: Number(existing?.unreadCount || 0) + Number(message.unread || 0),
      lastMessageAt: message.createdAt || existing?.lastMessageAt || null,
    });
  });

  const conversations = [...conversationsByChannel.values()];

  return conversations.length ? conversations : [getDefaultConversation()];
}

export function buildLocalThreadMessages(messages = [], activeConversation = getDefaultConversation()) {
  const conversationChannel = slugify(activeConversation.channel || activeConversation.title || "general") || "general";

  return messages
    .filter((message) => {
      if (activeConversation.type === "private") return false;
      return (slugify(message.channel || "general") || "general") === conversationChannel;
    })
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
      likeCount: Number(message.likeCount || 0),
      likedByMe: Boolean(message.likedByMe),
      replyTo: normalizeMessageReplyTarget(message.replyTo),
      readBy: normalizeMessageReaders(message.readBy || message.read_by),
      attachments: normalizeMessageAttachments(message.attachments || message.metadata?.attachments),
    }));
}

export function countLocalUnread(messages = []) {
  return messages.reduce((total, message) => total + Number(message.unread || 0), 0);
}

export function normalizeApiConversation(conversation = {}) {
  if (!conversation) return getDefaultConversation();
  const type = conversation.type === "group" ? "group" : conversation.type === "private" ? "private" : "internal";
  const channel = conversation.channel || "general";
  const participants = normalizeConversationParticipants(conversation.participants || conversation.members || []);
  const participantIds = getConversationParticipantIds({
    ...conversation,
    participants,
  });
  const participantId = conversation.participantId || conversation.participantUserId || participantIds[0];

  return {
    id: conversation.id || (type === "group" ? buildGroupConversationId(participantIds) : type === "private" ? `private:${participantId}` : `internal:${channel}`),
    type,
    channel,
    participantId,
    participantIds,
    participants,
    title: conversation.title || conversation.name || (type === "group" ? getConversationParticipantsTitle(participants) : type === "private" ? "Message privé" : "Guilde"),
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
  return normalizeMessageRecipient(recipient);
}

export function normalizeMessageRecipient(recipient = {}) {
  const id = String(recipient.userId || recipient.user_id || recipient.id || "").trim();
  const email = String(recipient.email || recipient.user?.email || "").trim().toLowerCase();
  const displayName = String(
    recipient.displayName || recipient.display_name || recipient.name || recipient.nickname || email || "Membre",
  ).trim();
  const nickname = String(recipient.nickname || recipient.name || recipient.displayName || recipient.display_name || displayName).trim();

  return {
    id,
    displayName: displayName || "Membre",
    email,
    nickname: nickname || displayName || "Membre",
    preferredLanguage: recipient.preferredLanguage || recipient.preferred_language || "fr",
    role: recipient.role || recipient.roleLabel || recipient.role_label || "",
    status: recipient.status || recipient.presence || "",
  };
}

export function getConversationParticipantIds(conversation = {}) {
  const ids = [
    conversation.participantId,
    conversation.participantUserId,
    ...(Array.isArray(conversation.participantIds) ? conversation.participantIds : []),
    ...(Array.isArray(conversation.participant_ids) ? conversation.participant_ids : []),
    ...(Array.isArray(conversation.participants)
      ? conversation.participants.map((participant) => participant.id || participant.userId || participant.user_id)
      : []),
  ]
    .filter(Boolean)
    .map((id) => String(id).trim())
    .filter(Boolean);

  return [...new Set(ids)];
}

export function normalizeConversationParticipants(participants = []) {
  return participants
    .map(normalizeMessageRecipient)
    .filter((participant) => participant.id);
}

export function buildGroupConversationId(participantIds = []) {
  const sortedIds = [...new Set(participantIds.filter(Boolean).map((id) => String(id)))].sort();
  return `group:${sortedIds.join(":")}`;
}

export function getConversationParticipantsTitle(participants = []) {
  const names = normalizeConversationParticipants(participants).map((participant) => participant.nickname || participant.displayName);
  return names.length ? names.join(", ") : "Conversation";
}

export function isGroupConversation(conversation = {}) {
  return conversation.type === "group" || getConversationParticipantIds(conversation).length > 1;
}

export function normalizeLocalMessageRecipients(members = [], currentUser = {}) {
  const currentIds = new Set(
    [currentUser.id, currentUser.userId, currentUser.user_id]
      .filter(Boolean)
      .map((id) => String(id)),
  );
  const recipientsById = new Map();

  members.forEach((member, index) => {
    const recipient = normalizeMessageRecipient({
      ...member,
      id: member.userId || member.user_id || member.id || `local-member-${index}`,
      displayName: member.displayName || member.display_name || member.name || member.nickname,
    });
    const status = String(member.status || "").toLowerCase();

    if (!recipient.id || currentIds.has(recipient.id) || status === "banned") return;
    recipientsById.set(recipient.id, recipient);
  });

  return [...recipientsById.values()].sort((left, right) =>
    (left.nickname || left.displayName).localeCompare(right.nickname || right.displayName, "fr", { sensitivity: "base" }),
  );
}

export function normalizeApiPrivateMessage(message = {}) {
  const sourceLanguage = normalizeLanguageChoice(message.sourceLanguage || message.original?.language || "auto");
  const targetLanguage = normalizeLanguageChoice(message.targetLanguage || message.translated?.language || sourceLanguage);
  const translatedText = message.translated?.text || message.displayText || message.original?.text || "";
  const originalText = message.original?.text || message.text || translatedText;
  const metadata = message.metadata || {};

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
    likeCount: Number(message.likeCount ?? message.like_count ?? metadata.likeCount ?? 0),
    likedByMe: Boolean(message.likedByMe ?? message.liked_by_me ?? metadata.likedByMe),
    replyTo: normalizeMessageReplyTarget(message.replyTo || message.reply_to || metadata.replyTo),
    readBy: normalizeMessageReaders(message.readBy || message.read_by || metadata.readBy),
    attachments: normalizeMessageAttachments(message.attachments || message.attachments_list || metadata.attachments),
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
  if (isGroupConversation(conversation)) {
    const participantIds = new Set(getConversationParticipantIds(conversation));
    return (
      message.conversationType === "group" ||
      participantIds.has(message.senderUserId) ||
      participantIds.has(message.recipientUserId)
    );
  }

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
    message.conversationType === "group"
      ? {
          ...activeConversation,
          id: activeConversation?.id || buildGroupConversationId(message.participantIds || []),
          type: "group",
          participantId: message.participantIds?.[0] || activeConversation?.participantId,
          participantIds: message.participantIds || activeConversation?.participantIds || [],
          participants: message.participants || activeConversation?.participants || [],
          title: activeConversation?.title || getConversationParticipantsTitle(message.participants || []),
          preview: getOriginalText(message),
          author: message.author || "Membre",
          unreadCount: message.isOwn || messageMatchesConversation(message, activeConversation) ? 0 : 1,
          lastMessageAt: message.createdAt,
        }
      : message.conversationType === "private"
      ? {
          id: `private:${message.isOwn ? message.recipientUserId : message.senderUserId}`,
          type: "private",
          participantId: message.isOwn ? message.recipientUserId : message.senderUserId,
          title: message.isOwn ? activeConversation?.title || "Message privé" : message.author || "Message privé",
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

export function buildLocalOutgoingMessage(text, conversation = getDefaultConversation(), currentUser = {}, targetLanguage = "FR", options = {}) {
  const participantIds = getConversationParticipantIds(conversation);

  return {
    id: `local-message-${Date.now()}`,
    author: currentUser.displayName || "Moi",
    source: normalizeLanguageChoice(currentUser.preferredLanguage || "AUTO"),
    target: targetLanguage,
    text,
    translated: translateMessage(text, targetLanguage),
    translationStatus: "original",
    createdAt: new Date().toISOString(),
    conversationType: isGroupConversation(conversation) ? "group" : conversation.type || "internal",
    channel: conversation.channel || "general",
    recipientUserId: participantIds[0] || conversation.participantId || null,
    participantIds,
    participants: conversation.participants || [],
    senderUserId: currentUser.id || null,
    isOwn: true,
    read: true,
    likeCount: 0,
    likedByMe: false,
    replyTo: normalizeMessageReplyTarget(options.replyTo),
    readBy: normalizeMessageReaders(options.readBy || [{ id: currentUser.id || "me", displayName: currentUser.displayName || "Moi" }]),
    attachments: normalizeMessageAttachments(options.attachments),
  };
}

export function normalizeMessageAttachments(attachments = []) {
  if (!Array.isArray(attachments)) return [];

  return attachments
    .map((attachment, index) => {
      const type = attachment?.type === "image" || String(attachment?.mimeType || attachment?.mime_type || "").startsWith("image/")
        ? "image"
        : "";
      const mimeType = String(attachment?.mimeType || attachment?.mime_type || "").trim();
      const dataUrl = String(attachment?.dataUrl || attachment?.data_url || "").trim();
      const url = String(attachment?.url || attachment?.src || "").trim();
      const src = dataUrl || url;

      if (type !== "image" || !src) return null;

      return {
        id: String(attachment?.id || `image-${index}`).trim(),
        type,
        name: String(attachment?.name || attachment?.fileName || attachment?.file_name || "Image").trim(),
        mimeType,
        size: Number(attachment?.size || 0),
        dataUrl,
        url,
        alt: String(attachment?.alt || attachment?.name || "Image envoyée").trim(),
        compressed: Boolean(attachment?.compressed),
        originalSize: Number(attachment?.originalSize || attachment?.original_size || 0),
        compressionLabel: String(attachment?.compressionLabel || attachment?.compression_label || "").trim(),
      };
    })
    .filter(Boolean);
}

export function normalizeMessageReaders(readers = []) {
  if (!Array.isArray(readers)) return [];

  const readersById = new Map();

  readers.forEach((reader, index) => {
    const id = String(reader?.id || reader?.userId || reader?.user_id || reader?.displayName || reader?.display_name || index).trim();
    const displayName = String(
      reader?.displayName || reader?.display_name || reader?.nickname || reader?.name || reader?.email || "Membre",
    ).trim();

    if (!id || !displayName) return;

    readersById.set(id, {
      id,
      displayName,
      readAt: reader?.readAt || reader?.read_at || null,
    });
  });

  return [...readersById.values()];
}

export function normalizeMessageReplyTarget(replyTo) {
  if (!replyTo) return null;

  const id = String(replyTo.id || replyTo.messageId || replyTo.message_id || "").trim();
  if (!id) return null;

  const author = String(replyTo.author || replyTo.authorName || replyTo.author_name || "Membre").trim();
  const text = String(replyTo.text || replyTo.displayText || replyTo.body || replyTo.preview || "").trim();

  return {
    id,
    author: author || "Membre",
    text: text.slice(0, 180),
    createdAt: replyTo.createdAt || replyTo.created_at || null,
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
  return message.text || message.original?.text || (normalizeMessageAttachments(message.attachments).length ? "Image" : "");
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

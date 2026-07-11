import {
  useEffect,
  useRef,
  useState
} from "react";
import {
  guildOpsApi
} from "../lib/guildOpsApi.js";
import {
  formatPublicChatCooldown,
  getPublicChatRateLimitDetails
} from "../lib/publicChatGuards.js";
import {
  appendUniqueById,
  buildBankCommandResponse,
  buildConversationQuery,
  buildConversationReadBody,
  buildGroupConversationId,
  buildLocalOutgoingMessage,
  getConversationParticipantIds,
  getConversationParticipantsTitle,
  getApiGuildId,
  getDefaultConversation,
  getPublicGuildSlug,
  isGroupConversation,
  messageMatchesConversation,
  normalizeApiChatMessage,
  normalizeApiConversation,
  normalizeApiConversations,
  normalizeApiPrivateMessage,
  normalizeApiRecipient,
  normalizeConversationParticipants,
  normalizeLanguageChoice,
  normalizeMessageAttachments,
  parseRealtimeEvent,
  prependUniqueById,
  translateMessage,
  upsertConversationFromMessage
} from "../lib/guildOpsTransforms.js";

const MESSAGE_IMAGE_MAX_BYTES = 900 * 1024;
const MESSAGE_IMAGE_TARGET_BYTES = 820 * 1024;
const MESSAGE_IMAGE_MAX_DIMENSION = 1600;
const MESSAGE_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

function mergeThreadMessages(...messageLists) {
  return messageLists.reduce(
    (merged, messages) => appendUniqueById(merged, Array.isArray(messages) ? messages : []),
    [],
  );
}

function inferConversationFromMessage(message = {}) {
  const participants = normalizeConversationParticipants(message.participants || []);
  const participantIds = getConversationParticipantIds({
    participantId: message.recipientUserId || message.senderUserId,
    participantIds: message.participantIds,
    participants,
  });

  if (message.conversationType === "group" || participantIds.length > 1) {
    return {
      id: buildGroupConversationId(participantIds),
      type: "group",
      participantId: participantIds[0],
      participantIds,
      participants,
      title: getConversationParticipantsTitle(participants),
    };
  }

  if (message.conversationType === "private") {
    const participantId = message.isOwn ? message.recipientUserId : message.senderUserId;
    const participant = participants.find((item) => item.id === participantId) || participants[0];

    return {
      id: `private:${participantId}`,
      type: "private",
      participantId,
      participantIds: participantId ? [participantId] : [],
      participants: participant ? [participant] : [],
      title: participant?.nickname || participant?.displayName || "Message privé",
    };
  }

  return {
    id: `internal:${message.channel || "general"}`,
    type: "internal",
    channel: message.channel || "general",
    title: message.channel === "general" ? "Guilde" : message.channel || "Guilde",
  };
}

function upsertConversationKeepingLabels(current = [], message = {}, conversationHint = null) {
  const inferredConversation = inferConversationFromMessage(message);
  const hint = conversationHint?.id ? conversationHint : inferredConversation;
  const nextConversations = upsertConversationFromMessage(current, message, hint);
  const conversationId = hint.id || inferredConversation.id;
  const existing = current.find((conversation) => conversation.id === conversationId);

  if (!existing && !hint) return nextConversations;

  return nextConversations.map((conversation) => {
    if (conversation.id !== conversationId) return conversation;

    const existingParticipants = Array.isArray(existing?.participants) ? existing.participants : [];
    const hintParticipants = Array.isArray(hint?.participants) ? hint.participants : [];
    const existingParticipantIds = Array.isArray(existing?.participantIds) ? existing.participantIds : [];
    const hintParticipantIds = Array.isArray(hint?.participantIds) ? hint.participantIds : [];

    return {
      ...conversation,
      type: existing?.type || hint?.type || conversation.type,
      channel: existing?.channel || hint?.channel || conversation.channel,
      participantId: existing?.participantId || hint?.participantId || conversation.participantId,
      participantIds: existingParticipantIds.length ? existingParticipantIds : hintParticipantIds.length ? hintParticipantIds : conversation.participantIds,
      participants: existingParticipants.length ? existingParticipants : hintParticipants.length ? hintParticipants : conversation.participants,
      title: existing?.title || hint?.title || conversation.title,
    };
  });
}

function markMessagesRead(messages = []) {
  return messages.map((message) => (message.read ? message : { ...message, read: true }));
}

function getMessageDisplayText(message = {}) {
  if (message.displayText) return message.displayText;
  if (typeof message.translated === "string") return message.translated;
  if (message.translated?.text) return message.translated.text;
  if (message.text) return message.text;
  if (message.original?.text) return message.original.text;
  if (normalizeMessageAttachments(message.attachments).length) return "Image";
  return "";
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Lecture de l'image impossible."));
    reader.readAsDataURL(file);
  });
}

function blobToDataUrl(blob) {
  return readFileAsDataUrl(blob);
}

function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Compression de l'image impossible."));
        }
      },
      mimeType,
      quality,
    );
  });
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image illisible."));
    image.src = dataUrl;
  });
}

function formatFileSize(bytes = 0) {
  const value = Number(bytes || 0);

  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
  return `${Math.max(1, Math.round(value / 1024))} Ko`;
}

function getCompressedImageName(fileName = "image") {
  const baseName = String(fileName || "image").replace(/\.[^.]+$/, "") || "image";
  return `${baseName}-compressee.jpg`;
}

async function compressImageFile(file) {
  const originalDataUrl = await readFileAsDataUrl(file);

  if (file.size <= MESSAGE_IMAGE_MAX_BYTES) {
    return {
      dataUrl: originalDataUrl,
      mimeType: file.type,
      name: file.name || "Image",
      size: file.size,
      compressed: false,
      originalSize: file.size,
      compressionLabel: "",
    };
  }

  const image = await loadImage(originalDataUrl);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;

  if (!sourceWidth || !sourceHeight) {
    throw new Error("Image illisible.");
  }

  let maxDimension = Math.min(MESSAGE_IMAGE_MAX_DIMENSION, Math.max(sourceWidth, sourceHeight));
  let bestBlob = null;

  for (let round = 0; round < 7; round += 1) {
    const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    canvas.width = width;
    canvas.height = height;

    if (!context) {
      throw new Error("Compression de l'image impossible.");
    }

    context.fillStyle = "#061219";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    for (const quality of [0.82, 0.72, 0.62, 0.52]) {
      const blob = await canvasToBlob(canvas, "image/jpeg", quality);

      if (!bestBlob || blob.size < bestBlob.size) {
        bestBlob = blob;
      }

      if (blob.size <= MESSAGE_IMAGE_TARGET_BYTES) {
        const dataUrl = await blobToDataUrl(blob);

        return {
          dataUrl,
          mimeType: "image/jpeg",
          name: getCompressedImageName(file.name),
          size: blob.size,
          compressed: true,
          originalSize: file.size,
          compressionLabel: `${formatFileSize(file.size)} -> ${formatFileSize(blob.size)}`,
        };
      }
    }

    maxDimension = Math.round(maxDimension * 0.78);
  }

  if (bestBlob && bestBlob.size <= MESSAGE_IMAGE_MAX_BYTES) {
    const dataUrl = await blobToDataUrl(bestBlob);

    return {
      dataUrl,
      mimeType: "image/jpeg",
      name: getCompressedImageName(file.name),
      size: bestBlob.size,
      compressed: true,
      originalSize: file.size,
      compressionLabel: `${formatFileSize(file.size)} -> ${formatFileSize(bestBlob.size)}`,
    };
  }

  throw new Error("Image trop lourde même après compression.");
}

function createMessageReplyTarget(message = {}) {
  const id = String(message.id || "").trim();
  if (!id) return null;

  return {
    id,
    author: message.author || (message.isOwn ? "Moi" : "Membre"),
    text: getMessageDisplayText(message).slice(0, 180),
    createdAt: message.createdAt || null,
  };
}

function getConversationUnreadCounts(conversations = []) {
  return new Map(conversations.map((conversation) => [conversation.id, Number(conversation.unreadCount || 0)]));
}

function markConversationReadInList(conversations = [], conversationId) {
  if (!conversationId) {
    return {
      conversations,
      clearedUnread: 0,
    };
  }

  let clearedUnread = 0;
  const nextConversations = conversations.map((conversation) => {
    if (conversation.id !== conversationId) return conversation;
    clearedUnread = Number(conversation.unreadCount || 0);
    return clearedUnread ? { ...conversation, unreadCount: 0 } : conversation;
  });

  return {
    conversations: nextConversations,
    clearedUnread,
  };
}

export function useMessagesController({
  apiEnabled,
  currentUser,
  selectedGuild,
  siteDraft,
  guildOpsData,
  authSession,
  bankCommand,
  bankRequests,
  bankStock,
  onBankCommand,
  moduleEnabled = true,
  translationEnabled = true,
  onNotificationsChanged,
  messagesVisible = true,
}) {
  const [translateOn, setTranslateOn] = useState(() => Boolean(translationEnabled));
  const [targetLanguage, setTargetLanguage] = useState(() => normalizeLanguageChoice(currentUser.preferredLanguage || "FR"));
  const [chatMessages, setChatMessages] = useState(() => (moduleEnabled ? guildOpsData.publicChat : []));
  const [chatDraft, setChatDraft] = useState("");
  const [chatNotice, setChatNotice] = useState("");
  const [chatCooldownUntil, setChatCooldownUntil] = useState(0);
  const [chatCooldownRemaining, setChatCooldownRemaining] = useState(0);
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const messageInteractionsRef = useRef(new Map());
  const [messageReplyTarget, setMessageReplyTarget] = useState(null);
  const [threadMessages, setThreadMessages] = useState([]);
  const [messageRecipients, setMessageRecipients] = useState([]);
  const [messageDraft, setMessageDraft] = useState("");
  const [messageAttachment, setMessageAttachment] = useState(null);
  const [messageNextCursor, setMessageNextCursor] = useState(null);
  const [messageError, setMessageError] = useState("");
  const [groupThreadMessages, setGroupThreadMessages] = useState({});
  const carriedGroupThreadRef = useRef(null);
  const [hiddenConversationIds, setHiddenConversationIds] = useState([]);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const conversationUnreadCountsRef = useRef(getConversationUnreadCounts(conversations));
  const [messageRealtimeStatus, setMessageRealtimeStatus] = useState(moduleEnabled ? apiEnabled ? "Connexion..." : "API requise" : "Désactivé");

  function getMergedGroupThreadMessages(conversation = getDefaultConversation(), resolvedMessages = []) {
    return mergeThreadMessages(resolvedMessages);
  }

  function filterVisibleConversations(nextConversations, hiddenIds = hiddenConversationIds) {
    if (!hiddenIds.length) return nextConversations;
    const hidden = new Set(hiddenIds);
    return nextConversations.filter((conversation) => !hidden.has(conversation.id));
  }

  function rememberMessageInteraction(message) {
    if (!message?.id) return;

    const current = messageInteractionsRef.current.get(message.id) || {};

    messageInteractionsRef.current.set(message.id, {
      ...current,
      likedByMe: Boolean(message.likedByMe),
      likeCount: Number(message.likeCount || 0),
      replyTo: message.replyTo || current.replyTo || null,
      readBy: message.readBy || current.readBy || [],
    });
  }

  function applyMessageInteractions(message) {
    if (!message?.id) return message;

    const interaction = messageInteractionsRef.current.get(message.id);

    return {
      ...message,
      likedByMe: Boolean(interaction?.likedByMe ?? message.likedByMe),
      likeCount: Number(interaction?.likeCount ?? message.likeCount ?? 0),
      replyTo: interaction?.replyTo || message.replyTo || null,
      readBy: interaction?.readBy || message.readBy || [],
    };
  }

  function markMessageReadByCurrentUser(message) {
    if (!message?.read) return message;

    const currentUserId = String(currentUser.id || currentUser.userId || currentUser.user_id || "me").trim();
    const currentUserName = String(currentUser.displayName || currentUser.name || "Moi").trim();
    const readBy = Array.isArray(message.readBy) ? message.readBy : [];
    const alreadyListed = readBy.some((reader) => {
      const readerId = String(reader?.id || reader?.userId || reader?.user_id || "").trim();
      const readerName = String(reader?.displayName || reader?.display_name || reader?.name || "").trim();
      return (currentUserId && readerId === currentUserId) || (!readerId && readerName === currentUserName);
    });

    if (alreadyListed) return { ...message, readBy };

    return {
      ...message,
      readBy: [
        ...readBy,
        {
          id: currentUserId || "me",
          displayName: currentUserName || "Moi",
          readAt: new Date().toISOString(),
        },
      ],
    };
  }

  function prepareThreadMessages(messages = []) {
    return markMessagesRead(messages).map(markMessageReadByCurrentUser).map(applyMessageInteractions);
  }

  function finalizeOutgoingMessage(message, replyTo) {
    const nextMessage = applyMessageInteractions({
      ...message,
      replyTo: replyTo || message.replyTo || null,
      likeCount: Number(message.likeCount || 0),
      likedByMe: Boolean(message.likedByMe),
    });

    rememberMessageInteraction(nextMessage);
    return nextMessage;
  }

  function updateThreadMessage(messageId, updater) {
    if (!messageId) return;

    function updateMessages(messages = []) {
      let changed = false;
      const nextMessages = messages.map((message) => {
        if (message.id !== messageId) return message;
        changed = true;
        const nextMessage = updater(message);
        rememberMessageInteraction(nextMessage);
        return nextMessage;
      });

      return changed ? nextMessages : messages;
    }

    setThreadMessages(updateMessages);
    setGroupThreadMessages((current) => {
      let changed = false;
      const nextThreads = Object.fromEntries(
        Object.entries(current).map(([conversationId, messages]) => {
          const nextMessages = updateMessages(messages);
          if (nextMessages !== messages) changed = true;
          return [conversationId, nextMessages];
        }),
      );

      return changed ? nextThreads : current;
    });
  }

  function toggleThreadMessageLike(messageId) {
    updateThreadMessage(messageId, (message) => {
      const likedByMe = !message.likedByMe;
      const likeCount = Math.max(0, Number(message.likeCount || 0) + (likedByMe ? 1 : -1));

      return {
        ...message,
        likedByMe,
        likeCount,
      };
    });
  }

  function replyToThreadMessage(messageId) {
    const target = createMessageReplyTarget(threadMessages.find((message) => message.id === messageId));
    if (!target) return;
    setMessageReplyTarget(target);
  }

  function cancelThreadMessageReply() {
    setMessageReplyTarget(null);
  }

  async function attachMessageImage(file) {
    if (!file) return;

    if (!MESSAGE_IMAGE_TYPES.has(file.type)) {
      setMessageError("Choisis une image PNG, JPG, WEBP ou GIF.");
      return;
    }

    try {
      setMessageError(file.size > MESSAGE_IMAGE_MAX_BYTES ? "Compression de l'image..." : "");
      const imageFile = await compressImageFile(file);
      const attachment = normalizeMessageAttachments([
        {
          id: `image-${Date.now()}`,
          type: "image",
          name: imageFile.name,
          mimeType: imageFile.mimeType,
          size: imageFile.size,
          dataUrl: imageFile.dataUrl,
          alt: file.name || "Image envoyée",
          compressed: imageFile.compressed,
          originalSize: imageFile.originalSize,
          compressionLabel: imageFile.compressionLabel,
        },
      ])[0];

      if (!attachment) {
        setMessageError("Image non reconnue.");
        return;
      }

      setMessageAttachment(attachment);
      setMessageError("");
    } catch (error) {
      setMessageError(error?.message || "Impossible de charger cette image.");
    }
  }

  function clearMessageAttachment() {
    setMessageAttachment(null);
  }

  function markConversationRead(conversationId) {
    if (!conversationId) return;

    const unreadToClear = Number(conversationUnreadCountsRef.current.get(conversationId) || 0);

    setActiveConversation((current) =>
      current?.id === conversationId && current.unreadCount ? { ...current, unreadCount: 0 } : current,
    );

    if (!unreadToClear) return;

    conversationUnreadCountsRef.current.set(conversationId, 0);
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === conversationId ? { ...conversation, unreadCount: 0 } : conversation,
      ),
    );
    setUnreadMessageCount((current) => Math.max(0, Number(current || 0) - unreadToClear));
  }

  useEffect(() => {
    conversationUnreadCountsRef.current = getConversationUnreadCounts(conversations);
  }, [conversations]);

  useEffect(() => {
    setMessageReplyTarget(null);
  }, [activeConversation?.id]);

  useEffect(() => {
    if (!moduleEnabled) {
      setChatMessages([]);
      setConversations([]);
      setActiveConversation(null);
      setThreadMessages([]);
      setMessageRecipients([]);
      setMessageError("");
      setMessageReplyTarget(null);
      setMessageAttachment(null);
      setHiddenConversationIds([]);
      setUnreadMessageCount(0);
      setMessageRealtimeStatus("Désactivé");
      return;
    }

    setChatMessages(guildOpsData.publicChat);

    if (!apiEnabled || !getApiGuildId(selectedGuild)) {
      setConversations([]);
      setActiveConversation(null);
      setThreadMessages([]);
      setMessageRecipients([]);
      setMessageError("");
      setMessageReplyTarget(null);
      setMessageAttachment(null);
      setHiddenConversationIds([]);
      setUnreadMessageCount(0);
      setMessageRealtimeStatus("API requise");
    }
  }, [apiEnabled, guildOpsData.publicChat, moduleEnabled, selectedGuild]);

  useEffect(() => {
    if (!translationEnabled) {
      setTranslateOn(false);
    }
  }, [translationEnabled]);

  useEffect(() => {
    setTargetLanguage(normalizeLanguageChoice(currentUser.preferredLanguage || "FR"));
  }, [currentUser.preferredLanguage]);

  useEffect(() => {
    if (!chatCooldownUntil) {
      setChatCooldownRemaining(0);
      return undefined;
    }

    function updateCooldown() {
      const remaining = Math.max(0, Math.ceil((chatCooldownUntil - Date.now()) / 1000));
      setChatCooldownRemaining(remaining);

      if (remaining === 0) {
        setChatCooldownUntil(0);
      }
    }

    updateCooldown();
    const interval = window.setInterval(updateCooldown, 1000);

    return () => window.clearInterval(interval);
  }, [chatCooldownUntil]);

  useEffect(() => {
    const guildId = getApiGuildId(selectedGuild);
    const slug = siteDraft.guildId && guildId && siteDraft.guildId !== guildId ? "" : getPublicGuildSlug(selectedGuild, siteDraft);

    if (!moduleEnabled || !authSession.isAuthenticated || !selectedGuild || !apiEnabled || !slug || !siteDraft.sections?.publicChat) return undefined;

    const controller = new AbortController();

    guildOpsApi
      .listPublicChat(
        slug,
        {
          targetLanguage: targetLanguage.toLowerCase(),
          limit: 25,
        },
        { signal: controller.signal },
      )
      .then((payload) => {
        setChatMessages(Array.isArray(payload?.messages) ? payload.messages.map(normalizeApiChatMessage) : guildOpsData.publicChat);
      })
      .catch(() => {});

    return () => controller.abort();
  }, [apiEnabled, authSession.isAuthenticated, guildOpsData.publicChat, moduleEnabled, selectedGuild, siteDraft, targetLanguage]);

  useEffect(() => {
    const guildId = getApiGuildId(selectedGuild);
    const slug = siteDraft.guildId && guildId && siteDraft.guildId !== guildId ? "" : getPublicGuildSlug(selectedGuild, siteDraft);

    if (!moduleEnabled || !authSession.isAuthenticated || !selectedGuild || !apiEnabled || !slug || !siteDraft.sections?.publicChat) return undefined;

    let stream;

    try {
      stream = guildOpsApi.openPublicChatStream(slug);
      stream.addEventListener("public_message", (event) => {
        const payload = parseRealtimeEvent(event);
        if (payload?.message) {
          setChatMessages((current) => appendUniqueById(current, [normalizeApiChatMessage(payload.message)]));
        }
      });
      stream.addEventListener("public_moderation", (event) => {
        const payload = parseRealtimeEvent(event);
        if (payload?.messageId) {
          setChatMessages((current) =>
            current.map((message) =>
              message.id === payload.messageId ? { ...message, moderationStatus: payload.status || "hidden" } : message,
            ),
          );
        }
      });
    } catch {
      return undefined;
    }

    return () => stream?.close();
  }, [apiEnabled, authSession.isAuthenticated, moduleEnabled, selectedGuild, siteDraft]);

  useEffect(() => {
    const guildId = getApiGuildId(selectedGuild);

    if (!moduleEnabled || !apiEnabled || !guildId) {
      setMessageRealtimeStatus(moduleEnabled ? "API requise" : "Désactivé");
      setConversations([]);
      setActiveConversation(null);
      setThreadMessages([]);
      setMessageRecipients([]);
      setUnreadMessageCount(0);
      return undefined;
    }

    const controller = new AbortController();
    setMessageError("");

    Promise.all([
      guildOpsApi.listConversations(guildId, { signal: controller.signal }),
      guildOpsApi.listMessageRecipients(guildId, { signal: controller.signal }),
      guildOpsApi.getUnreadMessageCount(guildId, { signal: controller.signal }),
    ])
      .then(([conversationPayload, recipientsPayload, unreadPayload]) => {
        const visibleConversations = filterVisibleConversations(normalizeApiConversations(conversationPayload?.conversations));
        const nextActiveConversation =
          visibleConversations.find((conversation) => conversation.id === activeConversation?.id) || visibleConversations[0] || null;
        const readState = messagesVisible
          ? markConversationReadInList(visibleConversations, nextActiveConversation?.id)
          : { conversations: visibleConversations, clearedUnread: 0 };
        conversationUnreadCountsRef.current = getConversationUnreadCounts(readState.conversations);

        setConversations(readState.conversations);
        setActiveConversation(
          nextActiveConversation
            ? { ...nextActiveConversation, unreadCount: messagesVisible ? 0 : nextActiveConversation.unreadCount }
            : null,
        );
        setMessageRecipients((recipientsPayload?.recipients || []).map(normalizeApiRecipient));
        setUnreadMessageCount(Math.max(0, Number(unreadPayload?.unreadCount || 0) - readState.clearedUnread));
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setMessageError(error?.message || "Messagerie indisponible.");
      });

    return () => controller.abort();
  }, [apiEnabled, hiddenConversationIds, messagesVisible, moduleEnabled, selectedGuild]);

  useEffect(() => {
    const guildId = getApiGuildId(selectedGuild);
    const conversation = activeConversation || getDefaultConversation();

    function resolveGroupThreadMessages(groupConversation) {
      const cachedThreadMessages = groupThreadMessages[groupConversation.id];
      const carriedThreadMessages =
        carriedGroupThreadRef.current?.conversationId === groupConversation.id
          ? carriedGroupThreadRef.current.messages
          : null;
      const nextThreadMessages =
        Array.isArray(cachedThreadMessages) && cachedThreadMessages.length
          ? cachedThreadMessages
          : carriedThreadMessages || cachedThreadMessages || [];

      if (carriedGroupThreadRef.current?.conversationId === groupConversation.id) {
        carriedGroupThreadRef.current = null;
      }

      return nextThreadMessages;
    }

    if (!moduleEnabled || !apiEnabled || !guildId) {
      setThreadMessages([]);
      setMessageNextCursor(null);
      return undefined;
    }

    if (!messagesVisible) {
      return undefined;
    }

    if (isGroupConversation(conversation)) {
      setThreadMessages(prepareThreadMessages(getMergedGroupThreadMessages(conversation, resolveGroupThreadMessages(conversation))));
      setMessageNextCursor(null);
      markConversationRead(conversation.id);
      return undefined;
    }

    markConversationRead(conversation.id);

    const controller = new AbortController();

    guildOpsApi
      .listGuildMessages(
        guildId,
        {
          ...buildConversationQuery(conversation),
          targetLanguage: targetLanguage.toLowerCase(),
          limit: 30,
        },
        { signal: controller.signal },
      )
      .then((payload) => {
        setThreadMessages(prepareThreadMessages((payload?.messages || []).map(normalizeApiPrivateMessage)));
        setMessageNextCursor(payload?.nextCursor || null);
        setConversations((current) =>
          current.map((item) => (item.id === conversation.id ? { ...item, unreadCount: 0 } : item)),
        );
        return guildOpsApi.markGuildConversationRead(guildId, buildConversationReadBody(conversation));
      })
      .then((payload) => {
        if (payload?.unreadCount !== undefined) {
          setUnreadMessageCount(Number(payload.unreadCount || 0));
        }
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setMessageError(error?.message || "Conversation indisponible.");
      });

    return () => controller.abort();
  }, [activeConversation?.id, apiEnabled, groupThreadMessages, messagesVisible, moduleEnabled, selectedGuild, targetLanguage]);

  useEffect(() => {
    const guildId = getApiGuildId(selectedGuild);

    if (!moduleEnabled || !apiEnabled || !guildId) {
      setMessageRealtimeStatus(moduleEnabled ? "API requise" : "Désactivé");
      return undefined;
    }

    let stream;
    setMessageRealtimeStatus("Connexion...");

    try {
      stream = guildOpsApi.openGuildMessageStream(guildId);
      stream.onopen = () => setMessageRealtimeStatus("En direct");
      stream.addEventListener("connected", (event) => {
        const payload = parseRealtimeEvent(event);
        setMessageRealtimeStatus("En direct");
        if (payload?.unreadCount !== undefined) setUnreadMessageCount(Number(payload.unreadCount || 0));
      });
      stream.addEventListener("private_message", (event) => {
        const payload = parseRealtimeEvent(event);
        const message = payload?.message ? normalizeApiPrivateMessage(payload.message) : null;
        if (!message) return;

        setConversations((current) =>
          filterVisibleConversations(upsertConversationKeepingLabels(current, message, messagesVisible ? activeConversation : null)),
        );

        if (messagesVisible && messageMatchesConversation(message, activeConversation)) {
          setThreadMessages((current) => appendUniqueById(current, prepareThreadMessages([{ ...message, read: true }])));

          if (!message.isOwn) {
            void guildOpsApi
              .markGuildConversationRead(guildId, buildConversationReadBody(activeConversation))
              .then((readPayload) => {
                if (readPayload?.unreadCount !== undefined) setUnreadMessageCount(Number(readPayload.unreadCount || 0));
              })
              .finally(() => {
                onNotificationsChanged?.();
              })
              .catch(() => {});
          }
        } else if (!message.isOwn) {
          onNotificationsChanged?.();
        }
      });
      stream.addEventListener("unread_count", (event) => {
        const payload = parseRealtimeEvent(event);
        if (payload?.unreadCount !== undefined) setUnreadMessageCount(Number(payload.unreadCount || 0));
      });
      stream.onerror = () => setMessageRealtimeStatus("Reconnexion");
    } catch {
      setMessageRealtimeStatus("API indisponible");
      return undefined;
    }

    return () => stream?.close();
  }, [activeConversation, apiEnabled, hiddenConversationIds, messagesVisible, moduleEnabled, onNotificationsChanged, selectedGuild]);

  function selectConversation(conversation) {
    if (!moduleEnabled) return;
    setActiveConversation(normalizeApiConversation(conversation));
    setMessageError("");
  }

  function unhideConversation(conversationId) {
    if (!conversationId) return;
    setHiddenConversationIds((current) => (current.includes(conversationId) ? current.filter((id) => id !== conversationId) : current));
  }

  function removeConversationFromInbox(conversationId) {
    if (!moduleEnabled || !conversationId) return;

    const nextConversations = conversations.filter((conversation) => conversation.id !== conversationId);
    const nextActiveConversation =
      activeConversation?.id === conversationId
        ? nextConversations[0] || null
        : activeConversation;

    setHiddenConversationIds((current) => (current.includes(conversationId) ? current : [...current, conversationId]));
    setConversations(nextConversations);
    setActiveConversation(nextActiveConversation);
    setMessageNextCursor(null);
    setMessageError("");

    if (activeConversation?.id === conversationId) {
      setThreadMessages([]);
      setMessageDraft("");
      setMessageAttachment(null);
    }

    setGroupThreadMessages((current) => {
      if (!current[conversationId]) return current;
      const nextThreadMessages = { ...current };
      delete nextThreadMessages[conversationId];
      return nextThreadMessages;
    });
  }

  function deleteConversation(conversationId = activeConversation?.id) {
    removeConversationFromInbox(conversationId);
  }

  function leaveGroupConversation(conversationId = activeConversation?.id) {
    const conversation =
      conversations.find((item) => item.id === conversationId) ||
      (activeConversation?.id === conversationId ? activeConversation : null);

    if (!isGroupConversation(conversation)) return;
    removeConversationFromInbox(conversationId);
  }

  function getConversationParticipant(recipientId, conversation = activeConversation) {
    return (
      messageRecipients.find((item) => item.id === recipientId) ||
      normalizeConversationParticipants(conversation?.participants || []).find((item) => item.id === recipientId) ||
      {
        id: recipientId,
        displayName: conversation?.participantId === recipientId ? conversation.title : "Membre",
        nickname: conversation?.participantId === recipientId ? conversation.title : "Membre",
        preferredLanguage: "fr",
        role: "",
        status: "",
      }
    );
  }

  function buildParticipantConversation(conversation, participants) {
    const normalizedParticipants = normalizeConversationParticipants(participants);
    const participantIds = normalizedParticipants.map((participant) => participant.id);
    const isGroup = participantIds.length > 1;

    return {
      ...conversation,
      id: isGroup ? buildGroupConversationId(participantIds) : `private:${participantIds[0]}`,
      type: isGroup ? "group" : "private",
      participantId: participantIds[0],
      participantIds,
      participants: normalizedParticipants,
      title: getConversationParticipantsTitle(normalizedParticipants),
      preview: conversation?.preview || (isGroup ? "Conversation de groupe" : "Nouveau message privé"),
      author: conversation?.author || currentUser.displayName,
      unreadCount: 0,
    };
  }

  function updateConversationParticipants(participants) {
    const conversation = activeConversation || getDefaultConversation();

    if (!participants.length) {
      setMessageError("Garde au moins un destinataire dans cette conversation.");
      return;
    }

    const nextConversation = buildParticipantConversation(conversation, participants);
    const currentThreadMessages = threadMessages;
    const carriedThreadMessages = mergeThreadMessages(
      currentThreadMessages,
      groupThreadMessages[conversation.id],
      groupThreadMessages[nextConversation.id],
    );

    carriedGroupThreadRef.current = isGroupConversation(nextConversation)
      ? {
          conversationId: nextConversation.id,
          messages: carriedThreadMessages,
        }
      : null;

    setConversations((current) => [
      nextConversation,
      ...current.filter((item) => item.id !== conversation.id && item.id !== nextConversation.id),
    ]);
    setHiddenConversationIds((current) =>
      current.includes(conversation.id) || current.includes(nextConversation.id)
        ? current.filter((id) => id !== conversation.id && id !== nextConversation.id)
        : current,
    );
    setActiveConversation(nextConversation);
    setMessageError("");
    setMessageNextCursor(null);

    if (isGroupConversation(nextConversation)) {
      const nextStoredMessages = mergeThreadMessages(
        currentThreadMessages,
        groupThreadMessages[conversation.id],
        groupThreadMessages[nextConversation.id],
      );

      setGroupThreadMessages((current) => ({
        ...current,
        [conversation.id]: mergeThreadMessages(current[conversation.id], currentThreadMessages),
        [nextConversation.id]: mergeThreadMessages(currentThreadMessages, current[conversation.id], current[nextConversation.id]),
      }));
      setThreadMessages(nextStoredMessages);
    } else {
      setThreadMessages([]);
    }
  }

  function startPrivateConversation(recipientId) {
    if (!moduleEnabled) return;
    const recipient = messageRecipients.find((item) => item.id === recipientId);
    if (!recipient) return;

    const conversation = {
      id: `private:${recipient.id}`,
      type: "private",
      participantId: recipient.id,
      participantIds: [recipient.id],
      participants: [recipient],
      title: recipient.nickname || recipient.displayName,
      preview: "Nouveau message privé",
      author: currentUser.displayName,
      unreadCount: 0,
      lastMessageAt: null,
    };

    setConversations((current) => [conversation, ...current.filter((item) => item.id !== conversation.id)]);
    unhideConversation(conversation.id);
    setActiveConversation(conversation);
    setThreadMessages([]);
    setMessageNextCursor(null);
  }

  function startGroupConversation(recipientIds = []) {
    if (!moduleEnabled) return;
    const uniqueRecipientIds = [...new Set(recipientIds.filter(Boolean))];
    const participants = uniqueRecipientIds
      .map((recipientId) => messageRecipients.find((item) => item.id === recipientId))
      .filter(Boolean);

    if (participants.length < 2) {
      setMessageError("Sélectionne au moins deux membres pour créer un groupe.");
      return;
    }

    const conversation = buildParticipantConversation({}, participants);

    setConversations((current) => [conversation, ...current.filter((item) => item.id !== conversation.id)]);
    unhideConversation(conversation.id);
    setActiveConversation(conversation);
    setThreadMessages(prepareThreadMessages(getMergedGroupThreadMessages(conversation, groupThreadMessages[conversation.id] || [])));
    setMessageNextCursor(null);
    setMessageError("");
  }

  function addMessageParticipant(recipientId) {
    if (!moduleEnabled) return;
    const conversation = activeConversation || getDefaultConversation();
    const nextRecipient = messageRecipients.find((item) => item.id === recipientId);

    if (!nextRecipient) return;

    const existingIds = getConversationParticipantIds(conversation);
    if (existingIds.includes(nextRecipient.id)) return;

    const existingParticipants = existingIds.map((id) => getConversationParticipant(id, conversation));
    updateConversationParticipants([...existingParticipants, nextRecipient]);
  }

  function removeMessageParticipant(recipientId) {
    if (!moduleEnabled) return;
    const conversation = activeConversation || getDefaultConversation();
    const existingIds = getConversationParticipantIds(conversation);

    if (!existingIds.includes(recipientId)) return;
    const nextIds = existingIds.filter((id) => id !== recipientId);

    updateConversationParticipants(nextIds.map((id) => getConversationParticipant(id, conversation)));
  }

  async function inviteMessageRecipientByEmail(email) {
    if (!moduleEnabled) return null;
    const normalizedEmail = String(email || "").trim().toLowerCase();

    if (!normalizedEmail) return null;
    setMessageError("");

    if (!apiEnabled || !getApiGuildId(selectedGuild)) {
      const error = new Error("API requise pour envoyer une invitation.");
      setMessageError(error.message);
      throw error;
    }

    try {
      const payload = await guildOpsApi.sendMessageInvitation(getApiGuildId(selectedGuild), { email: normalizedEmail });
      const recipient = payload?.recipient?.id ? normalizeApiRecipient(payload.recipient) : null;

      if (recipient) {
        setMessageRecipients((current) => [recipient, ...current.filter((item) => item.id !== recipient.id)]);
      }

      return {
        ...payload,
        recipient,
      };
    } catch (error) {
      const recipient = error?.payload?.error?.details?.recipient;

      if (recipient?.id) {
        const normalizedRecipient = normalizeApiRecipient(recipient);
        setMessageRecipients((current) => [normalizedRecipient, ...current.filter((item) => item.id !== normalizedRecipient.id)]);
      }

      throw error;
    }
  }

  async function sendGuildThreadMessage() {
    if (!moduleEnabled) return;
    const messageText = messageDraft.trim();
    const outgoingAttachment = messageAttachment;
    const outgoingAttachments = outgoingAttachment ? [outgoingAttachment] : [];
    const messageBody = messageText || (outgoingAttachment ? "Image" : "");
    const conversation = activeConversation || getDefaultConversation();
    const participantIds = getConversationParticipantIds(conversation);
    const replyTo = messageReplyTarget;
    if (!messageBody && !outgoingAttachments.length) return;

    if ((conversation.type === "private" || isGroupConversation(conversation)) && participantIds.length === 0) {
      setMessageError("Choisis un destinataire pour envoyer un message privé.");
      return;
    }

    const guildId = getApiGuildId(selectedGuild);

    if (!apiEnabled || !guildId) {
      setMessageError("API requise pour envoyer un message.");
      return;
    }

    setMessageDraft("");
    setMessageAttachment(null);
    setMessageError("");

    if (isGroupConversation(conversation)) {
      const localMessage = finalizeOutgoingMessage(
        buildLocalOutgoingMessage(messageBody, conversation, currentUser, targetLanguage, { replyTo, attachments: outgoingAttachments }),
        replyTo,
      );

      try {
        await Promise.all(
          participantIds.map((recipientUserId) =>
            guildOpsApi.sendGuildMessage(guildId, {
              body: messageBody,
              attachments: outgoingAttachments,
              conversationType: "private",
              recipientUserId,
              sourceLanguage: currentUser.preferredLanguage?.toLowerCase?.() || "auto",
              targetLanguage: targetLanguage.toLowerCase(),
            }),
          ),
        );

        setThreadMessages((current) => appendUniqueById(current, [localMessage]));
        setGroupThreadMessages((current) => ({
          ...current,
          [conversation.id]: appendUniqueById(mergeThreadMessages(threadMessages, current[conversation.id]), [localMessage]),
        }));
        setConversations((current) => upsertConversationKeepingLabels(current, localMessage, conversation));
        setMessageReplyTarget(null);
      } catch (error) {
        setMessageDraft(messageText);
        setMessageAttachment(outgoingAttachment);
        setMessageError(error?.message || "Envoi impossible.");
      }
      return;
    }

    try {
      const payload = await guildOpsApi.sendGuildMessage(guildId, {
        body: messageBody,
        attachments: outgoingAttachments,
        conversationType: conversation.type || "internal",
        channel: conversation.channel || "general",
        recipientUserId: conversation.type === "private" ? conversation.participantId : undefined,
        sourceLanguage: currentUser.preferredLanguage?.toLowerCase?.() || "auto",
        targetLanguage: targetLanguage.toLowerCase(),
      });
      const apiMessage = payload?.message ? finalizeOutgoingMessage(normalizeApiPrivateMessage(payload.message), replyTo) : null;

      if (apiMessage) {
        setThreadMessages((current) => appendUniqueById(current, [apiMessage]));
        setConversations((current) => upsertConversationKeepingLabels(current, apiMessage, conversation));
        setMessageReplyTarget(null);
      }
    } catch (error) {
      setMessageDraft(messageText);
      setMessageAttachment(outgoingAttachment);
      setMessageError(error?.message || "Envoi impossible.");
    }
  }

  async function loadOlderThreadMessages() {
    const guildId = getApiGuildId(selectedGuild);
    const conversation = activeConversation || getDefaultConversation();

    if (!moduleEnabled || !apiEnabled || !guildId || !messageNextCursor) return;

    try {
      const payload = await guildOpsApi.listGuildMessages(guildId, {
        ...buildConversationQuery(conversation),
        cursor: messageNextCursor,
        targetLanguage: targetLanguage.toLowerCase(),
        limit: 30,
      });
      setThreadMessages((current) => prependUniqueById(current, prepareThreadMessages((payload?.messages || []).map(normalizeApiPrivateMessage))));
      setMessageNextCursor(payload?.nextCursor || null);
    } catch (error) {
      setMessageError(error?.message || "Impossible de charger les messages plus anciens.");
    }
  }

  async function sendChat() {
    if (!moduleEnabled) return;
    const messageText = chatDraft.trim();
    if (!siteDraft.sections?.publicChat) return;
    if (!messageText) return;

    const cooldownRemaining = Math.max(0, Math.ceil((chatCooldownUntil - Date.now()) / 1000));
    if (cooldownRemaining > 0) {
      setChatNotice(formatPublicChatCooldown(cooldownRemaining));
      return;
    }

    if (!apiEnabled) {
      setChatNotice("API requise pour envoyer un message.");
      return;
    }

    const slug = getPublicGuildSlug(selectedGuild, siteDraft);

    if (!slug) {
      setChatNotice("Site de guilde requis pour envoyer un message.");
      return;
    }

    const isBankCommand = messageText.toLowerCase() === bankCommand.trim().toLowerCase();
    const createdAt = Date.now();
    const bankResponse = buildBankCommandResponse({
      command: bankCommand,
      guild: selectedGuild,
      requests: bankRequests,
      stock: bankStock,
    });
    const outgoingMessage = {
      id: createdAt,
      author: "[Invite] Scout",
      source: normalizeLanguageChoice(currentUser.preferredLanguage || "AUTO"),
      target: targetLanguage,
      text: messageText,
      translated: translateMessage(messageText, targetLanguage),
      translationStatus: "queued",
      translationPending: true,
      public: true,
    };
    const bankSystemMessage = isBankCommand
      ? {
          id: createdAt + 1,
          author: "[GuildOps] Banque",
          source: "FR",
          target: targetLanguage,
          text: bankResponse,
          translated: bankResponse,
          translationStatus: "original",
          public: true,
          system: true,
        }
      : null;
    const optimisticIds = new Set([outgoingMessage.id, bankSystemMessage?.id].filter(Boolean));

    setChatMessages((current) => [
      ...current,
      outgoingMessage,
      ...(bankSystemMessage ? [bankSystemMessage] : []),
    ]);

    try {
      const payload = await guildOpsApi.sendPublicChat(slug, {
        body: messageText,
        guestName: currentUser.displayName || "Invite",
        sourceLanguage: currentUser.preferredLanguage?.toLowerCase?.() || "auto",
        targetLanguage: targetLanguage.toLowerCase(),
      });
      const apiMessage = payload?.message ? normalizeApiChatMessage(payload.message) : null;

      if (apiMessage) {
        setChatMessages((current) => {
          const withoutDuplicates = current.filter((message) => message.id !== outgoingMessage.id && message.id !== apiMessage.id);
          return [...withoutDuplicates, apiMessage];
        });
      }
      setChatNotice(payload?.moderation?.status === "flagged" ? "Message envoye en moderation." : "");
    } catch (error) {
      const rateLimit = getPublicChatRateLimitDetails(error);

      setChatMessages((current) => current.filter((message) => !optimisticIds.has(message.id)));
      setChatDraft(messageText);

      if (rateLimit) {
        setChatCooldownUntil(Date.now() + rateLimit.retryAfterSeconds * 1000);
        setChatNotice(formatPublicChatCooldown(rateLimit.retryAfterSeconds));
        return;
      }

      setChatNotice(error?.message || "Message non envoye.");
      return;
    }

    if (isBankCommand) {
      onBankCommand?.(createdAt);
    }

    setChatDraft("");
  }

  function changeTargetLanguage(value) {
    if (!moduleEnabled) return;
    const nextLanguage = normalizeLanguageChoice(value);
    setTargetLanguage(nextLanguage);

    if (!authSession.isApiEnabled) return;

    void guildOpsApi
      .updateMe({ preferredLanguage: nextLanguage.toLowerCase() })
      .then(() => authSession.reload())
      .catch(() => {});
  }

  return {
    activeConversation,
    addMessageParticipant,
    attachMessageImage,
    changeTargetLanguage,
    chatCooldownRemaining,
    chatDraft,
    chatMessages,
    chatNotice,
    conversations,
    deleteConversation,
    loadOlderThreadMessages,
    inviteMessageRecipientByEmail,
    leaveGroupConversation,
    messageAttachment,
    messageReplyTarget,
    messageDraft,
    messageError,
    messageNextCursor,
    messageRealtimeStatus,
    messageRecipients,
    removeMessageParticipant,
    replyToThreadMessage,
    selectConversation,
    sendChat,
    sendGuildThreadMessage,
    setChatDraft,
    setMessageDraft,
    setTargetLanguage,
    setTranslateOn: translationEnabled ? setTranslateOn : () => setTranslateOn(false),
    startGroupConversation,
    startPrivateConversation,
    targetLanguage,
    threadMessages,
    toggleThreadMessageLike,
    translateOn,
    unreadMessageCount,
    cancelThreadMessageReply,
    clearMessageAttachment,
  };
}

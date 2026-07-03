import {
  useEffect,
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
  buildLocalConversations,
  buildLocalOutgoingMessage,
  buildLocalThreadMessages,
  countLocalUnread,
  getApiGuildId,
  getDefaultConversation,
  getPublicGuildSlug,
  messageMatchesConversation,
  normalizeApiChatMessage,
  normalizeApiConversation,
  normalizeApiConversations,
  normalizeApiPrivateMessage,
  normalizeApiRecipient,
  normalizeLanguageChoice,
  parseRealtimeEvent,
  prependUniqueById,
  translateMessage,
  upsertConversationFromMessage
} from "../lib/guildOpsTransforms.js";

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
}) {
  const [translateOn, setTranslateOn] = useState(() => Boolean(translationEnabled));
  const [targetLanguage, setTargetLanguage] = useState(() => normalizeLanguageChoice(currentUser.preferredLanguage || "FR"));
  const [chatMessages, setChatMessages] = useState(() => (moduleEnabled ? guildOpsData.publicChat : []));
  const [chatDraft, setChatDraft] = useState("");
  const [chatNotice, setChatNotice] = useState("");
  const [chatCooldownUntil, setChatCooldownUntil] = useState(0);
  const [chatCooldownRemaining, setChatCooldownRemaining] = useState(0);
  const [conversations, setConversations] = useState(() => (moduleEnabled ? buildLocalConversations(guildOpsData.internalMessages) : []));
  const [activeConversation, setActiveConversation] = useState(() => (moduleEnabled ? buildLocalConversations(guildOpsData.internalMessages)[0] : null));
  const [threadMessages, setThreadMessages] = useState(() => (moduleEnabled ? buildLocalThreadMessages(guildOpsData.internalMessages) : []));
  const [messageRecipients, setMessageRecipients] = useState([]);
  const [messageDraft, setMessageDraft] = useState("");
  const [messageNextCursor, setMessageNextCursor] = useState(null);
  const [messageError, setMessageError] = useState("");
  const [unreadMessageCount, setUnreadMessageCount] = useState(() => (moduleEnabled ? countLocalUnread(guildOpsData.internalMessages) : 0));
  const [messageRealtimeStatus, setMessageRealtimeStatus] = useState(moduleEnabled ? apiEnabled ? "Connexion..." : "Mode aperçu" : "Désactivé");

  useEffect(() => {
    if (!moduleEnabled) {
      setChatMessages([]);
      setConversations([]);
      setActiveConversation(null);
      setThreadMessages([]);
      setMessageRecipients([]);
      setMessageError("");
      setUnreadMessageCount(0);
      setMessageRealtimeStatus("Désactivé");
      return;
    }

    setChatMessages(guildOpsData.publicChat);
    const localConversations = buildLocalConversations(guildOpsData.internalMessages);
    setConversations(localConversations);
    setActiveConversation((current) => localConversations.find((conversation) => conversation.id === current?.id) || localConversations[0]);
    setThreadMessages(buildLocalThreadMessages(guildOpsData.internalMessages));
    setUnreadMessageCount(countLocalUnread(guildOpsData.internalMessages));
  }, [guildOpsData, moduleEnabled]);

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
      setMessageRealtimeStatus(moduleEnabled ? "Mode aperçu" : "Désactivé");
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
        const nextConversations = normalizeApiConversations(conversationPayload?.conversations);
        setConversations(nextConversations);
        setActiveConversation((current) => nextConversations.find((conversation) => conversation.id === current?.id) || nextConversations[0]);
        setMessageRecipients((recipientsPayload?.recipients || []).map(normalizeApiRecipient));
        setUnreadMessageCount(Number(unreadPayload?.unreadCount || 0));
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setMessageError(error?.message || "Messagerie indisponible.");
      });

    return () => controller.abort();
  }, [apiEnabled, moduleEnabled, selectedGuild]);

  useEffect(() => {
    const guildId = getApiGuildId(selectedGuild);
    const conversation = activeConversation || getDefaultConversation();

    if (!moduleEnabled || !apiEnabled || !guildId) {
      setThreadMessages(moduleEnabled ? buildLocalThreadMessages(guildOpsData.internalMessages, conversation) : []);
      setMessageNextCursor(null);
      return undefined;
    }

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
        setThreadMessages((payload?.messages || []).map(normalizeApiPrivateMessage));
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
  }, [activeConversation?.id, apiEnabled, guildOpsData.internalMessages, moduleEnabled, selectedGuild, targetLanguage]);

  useEffect(() => {
    const guildId = getApiGuildId(selectedGuild);

    if (!moduleEnabled || !apiEnabled || !guildId) {
      setMessageRealtimeStatus(moduleEnabled ? "Mode aperçu" : "Désactivé");
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

        setConversations((current) => upsertConversationFromMessage(current, message, activeConversation));

        if (messageMatchesConversation(message, activeConversation)) {
          setThreadMessages((current) => appendUniqueById(current, [message]));

          if (!message.isOwn) {
            void guildOpsApi
              .markGuildConversationRead(guildId, buildConversationReadBody(activeConversation))
              .then((readPayload) => {
                if (readPayload?.unreadCount !== undefined) setUnreadMessageCount(Number(readPayload.unreadCount || 0));
              })
              .catch(() => {});
          }
        }
      });
      stream.addEventListener("unread_count", (event) => {
        const payload = parseRealtimeEvent(event);
        if (payload?.unreadCount !== undefined) setUnreadMessageCount(Number(payload.unreadCount || 0));
      });
      stream.onerror = () => setMessageRealtimeStatus("Reconnexion");
    } catch {
      setMessageRealtimeStatus("Mode aperçu");
      return undefined;
    }

    return () => stream?.close();
  }, [activeConversation, apiEnabled, moduleEnabled, selectedGuild]);

  function selectConversation(conversation) {
    if (!moduleEnabled) return;
    setActiveConversation(normalizeApiConversation(conversation));
    setMessageError("");
  }

  function startPrivateConversation(recipientId) {
    if (!moduleEnabled) return;
    const recipient = messageRecipients.find((item) => item.id === recipientId);
    if (!recipient) return;

    const conversation = {
      id: `private:${recipient.id}`,
      type: "private",
      participantId: recipient.id,
      title: recipient.nickname || recipient.displayName,
      preview: "Nouveau message prive",
      author: currentUser.displayName,
      unreadCount: 0,
      lastMessageAt: null,
    };

    setConversations((current) => [conversation, ...current.filter((item) => item.id !== conversation.id)]);
    setActiveConversation(conversation);
    setThreadMessages([]);
    setMessageNextCursor(null);
  }

  async function sendGuildThreadMessage() {
    if (!moduleEnabled) return;
    const messageText = messageDraft.trim();
    const conversation = activeConversation || getDefaultConversation();
    if (!messageText) return;

    if (conversation.type === "private" && !conversation.participantId) {
      setMessageError("Choisis un destinataire pour envoyer un message prive.");
      return;
    }

    setMessageDraft("");
    setMessageError("");

    if (!apiEnabled || !getApiGuildId(selectedGuild)) {
      const localMessage = buildLocalOutgoingMessage(messageText, conversation, currentUser, targetLanguage);
      setThreadMessages((current) => appendUniqueById(current, [localMessage]));
      setConversations((current) => upsertConversationFromMessage(current, localMessage, conversation));
      return;
    }

    const guildId = getApiGuildId(selectedGuild);

    try {
      const payload = await guildOpsApi.sendGuildMessage(guildId, {
        body: messageText,
        conversationType: conversation.type || "internal",
        channel: conversation.channel || "general",
        recipientUserId: conversation.type === "private" ? conversation.participantId : undefined,
        sourceLanguage: currentUser.preferredLanguage?.toLowerCase?.() || "auto",
        targetLanguage: targetLanguage.toLowerCase(),
      });
      const apiMessage = payload?.message ? normalizeApiPrivateMessage(payload.message) : null;

      if (apiMessage) {
        setThreadMessages((current) => appendUniqueById(current, [apiMessage]));
        setConversations((current) => upsertConversationFromMessage(current, apiMessage, conversation));
      }
    } catch (error) {
      setMessageDraft(messageText);
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
      setThreadMessages((current) => prependUniqueById(current, (payload?.messages || []).map(normalizeApiPrivateMessage)));
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

    if (apiEnabled) {
      const slug = getPublicGuildSlug(selectedGuild, siteDraft);

      if (slug) {
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

          if (rateLimit) {
            setChatMessages((current) => current.filter((message) => !optimisticIds.has(message.id)));
            setChatDraft(messageText);
            setChatCooldownUntil(Date.now() + rateLimit.retryAfterSeconds * 1000);
            setChatNotice(formatPublicChatCooldown(rateLimit.retryAfterSeconds));
            return;
          }

          setChatNotice(error?.message || "Message affiche ici, mais pas encore envoye au chat public.");
        }
      }
    } else {
      setChatNotice("");
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
    changeTargetLanguage,
    chatCooldownRemaining,
    chatDraft,
    chatMessages,
    chatNotice,
    conversations,
    loadOlderThreadMessages,
    messageDraft,
    messageError,
    messageNextCursor,
    messageRealtimeStatus,
    messageRecipients,
    selectConversation,
    sendChat,
    sendGuildThreadMessage,
    setChatDraft,
    setMessageDraft,
    setTargetLanguage,
    setTranslateOn: translationEnabled ? setTranslateOn : () => setTranslateOn(false),
    startPrivateConversation,
    targetLanguage,
    threadMessages,
    translateOn,
    unreadMessageCount,
  };
}

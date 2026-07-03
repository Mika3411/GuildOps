import {
  useEffect,
  useMemo,
  useState
} from "react";
import {
  guilds
} from "../data/guildOpsMockData.js";
import {
  useAuthSession
} from "./useAuthSession.js";
import {
  useBankController
} from "./useBankController.js";
import {
  useDiplomacyController
} from "./useDiplomacyController.js";
import {
  useEventsController
} from "./useEventsController.js";
import {
  useForumController
} from "./useForumController.js";
import {
  useGuildOpsData
} from "./useGuildOpsData.js";
import {
  useMessagesController
} from "./useMessagesController.js";
import {
  useSosController
} from "./useSosController.js";
import {
  isApiConfigured
} from "../lib/apiClient.js";
import {
  guildOpsApi
} from "../lib/guildOpsApi.js";
import {
  can,
  getRoleLabel
} from "../lib/rbac.js";
import {
  buildGuildSitePayload,
  createGuildSiteDraft,
  isDesignOptionUnlocked,
  loadPurchasedDesignIds,
  loadPublishedSite,
  savePublishedSite,
  slugify,
  unlockDesignOption
} from "../lib/guildSiteStore.js";
import {
  buildPublicDiplomacySnapshot,
  buildPublicForumSnapshot,
  getGuildKey,
  getPublicRouteSegment,
  getPublicRouteSlug,
} from "../lib/guildOpsTransforms.js";
import {
  getAdministrationModules,
  getDefaultEnabledModuleIds,
  getGuildOpsModuleByView,
  getGuildOpsMobileNavItems,
  getGuildOpsModule,
  getGuildOpsNavItems,
  getGuildOpsModuleByRoute,
  guildOpsModules,
  isGuildOpsModuleEnabled
} from "../config/moduleRegistry.js";
import {
  normalizeRealmCodeForGame
} from "../config/guildOpsConfig.js";

const EMPTY_LIST = Object.freeze([]);
const EMPTY_USER = Object.freeze({
  id: "",
  displayName: "",
  initials: "",
  preferredLanguage: "FR",
  role: "membre",
  roles: ["membre"],
});

function collectModuleActivationIds(moduleId, result = new Set()) {
  const module = getGuildOpsModule(moduleId);
  if (!module || result.has(module.id)) return result;

  module.dependencies.forEach((dependencyId) => collectModuleActivationIds(dependencyId, result));
  result.add(module.id);
  return result;
}

function collectModuleDisableIds(moduleId, enabledModuleIds, result = new Set()) {
  if (result.has(moduleId)) return result;

  result.add(moduleId);
  const enabledSet = new Set(enabledModuleIds);
  guildOpsModules.forEach((module) => {
    if (enabledSet.has(module.id) && module.dependencies.includes(moduleId)) {
      collectModuleDisableIds(module.id, enabledModuleIds, result);
    }
  });

  return result;
}

function normalizeEnabledModuleIds(moduleIds) {
  const defaults = getDefaultEnabledModuleIds();
  if (!Array.isArray(moduleIds)) return defaults;

  const next = new Set(defaults);
  moduleIds.forEach((moduleId) => {
    if (getGuildOpsModule(moduleId)) {
      next.add(moduleId);
    }
  });

  return guildOpsModules.filter((module) => next.has(module.id)).map((module) => module.id);
}

function getInviteRouteSlug(pathname) {
  const match = /^\/join\/([^/?#]+)/.exec(pathname);
  return match ? slugify(decodeURIComponent(match[1])) : "";
}

function getInitialAdministrationModuleIds(member) {
  const hasGlobalAdministration = can(member, "admin_all");

  return getAdministrationModules()
    .filter((module) => {
      if (hasGlobalAdministration) return true;
      return module.permissionKeys.some((permission) => can(member, permission));
    })
    .map((module) => module.id);
}

function createAdministrationAccess(members = []) {
  return Object.fromEntries(
    members.map((member) => [member.id, getInitialAdministrationModuleIds(member)]),
  );
}

function normalizeAdministrationAccess(members = [], currentAccess = {}) {
  const validModuleIds = new Set(getAdministrationModules().map((module) => module.id));

  return Object.fromEntries(
    members.map((member) => {
      const storedModuleIds = Array.isArray(currentAccess[member.id])
        ? currentAccess[member.id].filter((moduleId) => validModuleIds.has(moduleId))
        : getInitialAdministrationModuleIds(member);

      return [member.id, [...new Set(storedModuleIds)]];
    }),
  );
}

function sortAdministrationModuleIds(moduleIds = []) {
  const order = new Map(getAdministrationModules().map((module, index) => [module.id, index]));
  return [...new Set(moduleIds)]
    .filter((moduleId) => order.has(moduleId))
    .sort((left, right) => order.get(left) - order.get(right));
}

export function useGuildOpsController() {
  const apiEnabled = isApiConfigured();
  const authSession = useAuthSession(null);
  const guildOpsState = useGuildOpsData({
    enabled: !apiEnabled || authSession.isAuthenticated,
    reloadKey: `${authSession.user?.id || "guest"}:${authSession.context?.activeGuild?.id || "no-guild"}`,
  });
  const { data: guildOpsData } = guildOpsState;
  const currentUser = authSession.user || guildOpsData.authUser || EMPTY_USER;
  const activeGuilds = authSession.guilds.length ? authSession.guilds : guildOpsData.guilds.length ? guildOpsData.guilds : apiEnabled ? EMPTY_LIST : guilds;

  const [routePath, setRoutePath] = useState(() => window.location.pathname);
  const [activeView, setActiveView] = useState("command");
  const [selectedGuild, setSelectedGuild] = useState(() => activeGuilds[0]);
  const [sitePublished, setSitePublished] = useState(() => guildOpsData.site.published);
  const [siteDraft, setSiteDraft] = useState(() => createGuildSiteDraft(activeGuilds[0], guildOpsData.site));
  const [lastPublishedSite, setLastPublishedSite] = useState(() => loadPublishedSite(slugify(guildOpsData.site.name || activeGuilds[0]?.name)));
  const [purchasedDesignIds, setPurchasedDesignIds] = useState(() => loadPurchasedDesignIds());
  const [publishingSite, setPublishingSite] = useState(false);
  const [sitePublishError, setSitePublishError] = useState("");
  const [guildCreateError, setGuildCreateError] = useState("");
  const [creatingGuild, setCreatingGuild] = useState(false);
  const [enabledModuleIds, setEnabledModuleIds] = useState(() => getDefaultEnabledModuleIds());
  const [administrationAccess, setAdministrationAccess] = useState(() => createAdministrationAccess(guildOpsData.members));
  const bootstrapEnabledModuleKey = Array.isArray(guildOpsData.enabledModules) ? guildOpsData.enabledModules.join("|") : "";
  const bootstrapGuildKey = getGuildKey(guildOpsData.context?.activeGuild || authSession.context?.activeGuild);
  const enabledModuleKey = enabledModuleIds.join("|");
  const moduleAvailability = useMemo(
    () => ({
      bank: isGuildOpsModuleEnabled("bank", enabledModuleIds),
      diplomacy: isGuildOpsModuleEnabled("diplomacy", enabledModuleIds),
      events: isGuildOpsModuleEnabled("wars_events", enabledModuleIds),
      forum: isGuildOpsModuleEnabled("forum", enabledModuleIds),
      messages: isGuildOpsModuleEnabled("messages", enabledModuleIds),
      sos: isGuildOpsModuleEnabled("sos_attack", enabledModuleIds),
      translation: isGuildOpsModuleEnabled("translation", enabledModuleIds),
    }),
    [enabledModuleKey],
  );
  const [roleEdits, setRoleEdits] = useState(() =>
    Object.fromEntries(guildOpsData.members.map((member) => [member.id, getRoleLabel(member.role)])),
  );

  useEffect(() => {
    setSelectedGuild(
      (current) =>
        activeGuilds.find((guild) => guild.isActive) ||
        activeGuilds.find((guild) => getGuildKey(guild) === getGuildKey(current)) ||
        activeGuilds[0],
    );
    setSitePublished(guildOpsData.site.published);
    setRoleEdits(Object.fromEntries(guildOpsData.members.map((member) => [member.id, getRoleLabel(member.role)])));
    setAdministrationAccess((current) => normalizeAdministrationAccess(guildOpsData.members, current));
  }, [activeGuilds, guildOpsData]);

  useEffect(() => {
    setEnabledModuleIds(normalizeEnabledModuleIds(guildOpsData.enabledModules));
  }, [bootstrapEnabledModuleKey, bootstrapGuildKey]);

  useEffect(() => {
    const activeModule = getGuildOpsModuleByView(activeView);
    if (activeModule && !isGuildOpsModuleEnabled(activeModule, enabledModuleIds)) {
      setActiveView("modules");
    }
  }, [activeView, enabledModuleKey]);

  useEffect(() => {
    const onPopState = () => setRoutePath(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (routePath === "/app/modules") {
      setActiveView("modules");
      return;
    }

    const routeModule = getGuildOpsModuleByRoute(routePath);
    if (routeModule) {
      setActiveView(routeModule.view);
    }
  }, [routePath]);

  useEffect(() => {
    if (!selectedGuild) return;
    const draftSlug = slugify(guildOpsData.site.name || selectedGuild.name);
    const storedSite = loadPublishedSite(draftSlug);
    setSiteDraft(createGuildSiteDraft(selectedGuild, storedSite || guildOpsData.site));
    setLastPublishedSite(storedSite);
    setSitePublishError("");
  }, [guildOpsData.site, selectedGuild]);

  const eventsController = useEventsController({
    apiEnabled,
    currentUser,
    selectedGuild,
    siteDraft,
    guildOpsData,
    authSession,
    moduleEnabled: moduleAvailability.events,
  });
  const bankController = useBankController({
    apiEnabled,
    currentUser,
    selectedGuild,
    siteDraft,
    guildOpsData,
    authSession,
    moduleEnabled: moduleAvailability.bank,
  });
  const messagesController = useMessagesController({
    apiEnabled,
    currentUser,
    selectedGuild,
    siteDraft,
    guildOpsData,
    authSession,
    bankCommand: bankController.bankCommand,
    bankRequests: bankController.bankRequests,
    bankStock: bankController.bankStock,
    onBankCommand: bankController.recordBankCommand,
    moduleEnabled: moduleAvailability.messages,
    translationEnabled: moduleAvailability.translation,
  });
  const forumController = useForumController({
    apiEnabled,
    currentUser,
    selectedGuild,
    siteDraft,
    guildOpsData,
    authSession,
    moduleEnabled: moduleAvailability.forum,
  });
  const diplomacyController = useDiplomacyController({
    apiEnabled,
    currentUser,
    selectedGuild,
    siteDraft,
    guildOpsData,
    authSession,
    moduleEnabled: moduleAvailability.diplomacy,
  });
  const sosController = useSosController({
    apiEnabled,
    currentUser,
    selectedGuild,
    siteDraft,
    guildOpsData,
    authSession,
    currentMemberId: eventsController.currentMemberId,
    moduleEnabled: moduleAvailability.sos,
  });

  const navItems = useMemo(() => getGuildOpsNavItems(enabledModuleIds), [enabledModuleIds]);
  const mobileNavItems = useMemo(() => getGuildOpsMobileNavItems(enabledModuleIds), [enabledModuleIds]);
  const publicDiplomacy = useMemo(
    () =>
      buildPublicDiplomacySnapshot({
        coordinates: diplomacyController.diplomacyCoordinates,
        napAgreements: diplomacyController.diplomacyNapAgreements,
        relations: diplomacyController.diplomacyRelations,
      }),
    [
      diplomacyController.diplomacyCoordinates,
      diplomacyController.diplomacyNapAgreements,
      diplomacyController.diplomacyRelations,
    ],
  );
  const publicForum = useMemo(
    () =>
      buildPublicForumSnapshot({
        categories: forumController.forumCategories,
        threads: forumController.forumThreadsState,
      }),
    [forumController.forumCategories, forumController.forumThreadsState],
  );

  const publicRouteSlug = getPublicRouteSlug(routePath);
  const publicRouteSegment = getPublicRouteSegment(routePath);
  const inviteRouteSlug = getInviteRouteSlug(routePath);
  const publicSitePath = `/g/${slugify(siteDraft.guildName)}`;
  const publicSiteUrl = `${window.location.origin}${publicSitePath}`;

  function enableGuildOpsModule(moduleId) {
    setEnabledModuleIds((current) => {
      const next = new Set(current);
      collectModuleActivationIds(moduleId).forEach((id) => next.add(id));
      return [...next];
    });
  }

  function disableGuildOpsModule(moduleId) {
    setEnabledModuleIds((current) => {
      const idsToDisable = collectModuleDisableIds(moduleId, current);
      return current.filter((id) => !idsToDisable.has(id));
    });
  }

  function purchaseTemplateDesign(designId) {
    const nextPurchasedDesignIds = unlockDesignOption(designId, purchasedDesignIds);
    setPurchasedDesignIds(nextPurchasedDesignIds);
    setSiteDraft((current) => ({ ...current, design: designId }));
    return nextPurchasedDesignIds;
  }

  function useTemplateDesign(designId) {
    if (!isDesignOptionUnlocked(designId, purchasedDesignIds)) return;

    setSiteDraft((current) => ({ ...current, design: designId }));
    navigateToView("command");
  }

  function toggleAdministrationMember(memberId) {
    setAdministrationAccess((current) => {
      const currentModuleIds = current[memberId] || [];
      const nextModuleIds = currentModuleIds.length ? [] : ["site"];

      return {
        ...current,
        [memberId]: nextModuleIds,
      };
    });
  }

  function toggleAdministrationModule(memberId, moduleId) {
    setAdministrationAccess((current) => {
      const currentModuleIds = current[memberId] || [];
      const hasModule = currentModuleIds.includes(moduleId);
      const nextModuleIds = hasModule
        ? currentModuleIds.filter((currentModuleId) => currentModuleId !== moduleId)
        : sortAdministrationModuleIds([...currentModuleIds, moduleId]);

      return {
        ...current,
        [memberId]: nextModuleIds,
      };
    });
  }

  function toggleAllAdministrationModules(memberId) {
    setAdministrationAccess((current) => {
      const allModuleIds = getAdministrationModules().map((module) => module.id);
      const currentModuleIds = current[memberId] || [];
      const hasAllModules = allModuleIds.every((moduleId) => currentModuleIds.includes(moduleId));

      return {
        ...current,
        [memberId]: hasAllModules ? [] : allModuleIds,
      };
    });
  }

  function navigateToView(view) {
    const module = getGuildOpsModuleByView(view);
    if (module && !isGuildOpsModuleEnabled(module, enabledModuleIds)) {
      setActiveView("modules");
      navigateToPath("/app/modules");
      return;
    }

    setActiveView(view);

    const nextPath = view === "modules" ? "/app/modules" : module?.route;
    if (nextPath && window.location.pathname !== nextPath) {
      navigateToPath(nextPath);
    }
  }

  function navigateToPath(path) {
    window.history.pushState({}, "", path);
    setRoutePath(window.location.pathname);
  }

  function openPublicSite() {
    navigateToPath(publicSitePath);
  }

  async function createGuild(body) {
    if (!authSession.isApiEnabled) return null;

    const organizationId = body.organizationId || authSession.context?.activeOrganization?.id || authSession.organizations[0]?.id;

    if (!organizationId) {
      setGuildCreateError("Aucune organisation disponible pour creer la guilde.");
      return null;
    }

    setCreatingGuild(true);
    setGuildCreateError("");

    try {
      const payload = await guildOpsApi.createGuild({
        organizationId,
        name: body.name,
        tag: body.tag || undefined,
        gameName: body.gameName,
        serverCode: normalizeRealmCodeForGame(body.serverCode, body.gameName),
        defaultLanguage: body.defaultLanguage || "fr",
        playStyle: body.playStyle || undefined,
        description: body.description || undefined,
        isPublic: Boolean(body.isPublic),
      });
      const createdGuild = payload?.guild;

      if (createdGuild?.id) {
        await authSession.updateContext({
          activeOrganizationId: organizationId,
          activeGuildId: createdGuild.id,
        });
        await guildOpsState.reload();
      }

      return createdGuild || null;
    } catch (error) {
      setGuildCreateError(error?.message || "Creation de guilde impossible.");
      return null;
    } finally {
      setCreatingGuild(false);
    }
  }

  function changeActiveGuild(guild) {
    setSelectedGuild(guild);

    if (!authSession.isApiEnabled || !guild?.id) return;

    void authSession.updateContext({
      activeOrganizationId: guild.organizationId || guild.organization_id || null,
      activeGuildId: guild.id,
    });
  }

  async function publishGuildSite() {
    if (!can(currentUser, "manage_site")) return null;

    const payload = buildGuildSitePayload({ ...siteDraft, publicDiplomacy, publicForum }, selectedGuild);
    setPublishingSite(true);
    setSitePublishError("");

    try {
      const apiPayload = apiEnabled
        ? await guildOpsApi.publishGuildSite(payload.guildId, payload)
        : payload;
      const publishedSite = savePublishedSite(apiPayload || payload);

      setLastPublishedSite(publishedSite);
      setSiteDraft(createGuildSiteDraft(selectedGuild, publishedSite));
      setSitePublished(true);
      return publishedSite;
    } catch (error) {
      setSitePublishError(error?.message || "Mise en ligne impossible pour le moment.");
      return null;
    } finally {
      setPublishingSite(false);
    }
  }

  return {
    activeGuilds,
    activeView,
    authSession,
    guildOpsState,
    inviteRouteSlug,
    publicRouteSlug,
    routePath,
    onNavigatePath: navigateToPath,
    landingProps: {
      onOpenApp: () => navigateToPath("/app"),
      onOpenGallery: () => navigateToPath("/guildes"),
      onOpenLogin: () => navigateToPath("/auth/login"),
      onOpenRegister: () => navigateToPath("/auth/register"),
    },
    publicRouteProps: {
      fallbackSite: lastPublishedSite,
      members: eventsController.members,
      publicDiplomacy,
      publicForum,
      onNavigatePublicRoute: navigateToPath,
      onBackToBuilder: () => navigateToPath("/app"),
      routeSegment: publicRouteSegment,
      slug: publicRouteSlug,
    },
    joinRouteProps: {
      authSession,
      inviteSlug: inviteRouteSlug,
      onJoined: async () => {
        await authSession.reload?.();
        await guildOpsState.reload?.();
      },
      onOpenApp: () => navigateToPath("/app"),
      onOpenPublicSite: (slug = inviteRouteSlug) => navigateToPath(`/g/${slugify(slug)}`),
    },
    onboardingProps: {
      creating: creatingGuild,
      currentUser,
      error: guildCreateError,
      onCreateGuild: createGuild,
      organizations: authSession.organizations,
    },
    sidebarProps: {
      activeView,
      guilds: activeGuilds,
      navItems,
      onGuildChange: changeActiveGuild,
      onNavigate: navigateToView,
      selectedGuild,
      unreadMessages: messagesController.unreadMessageCount,
    },
    mobileHeaderProps: {
      activeView,
      navItems,
      onNavigate: navigateToView,
      selectedGuild,
      unreadMessages: messagesController.unreadMessageCount,
    },
    topBarProps: {
      currentUser,
      onCreateSite: publishGuildSite,
      selectedGuild,
      sitePublished,
      publishingSite,
      publicSiteUrl,
      sitePublishError,
      onGuildChange: changeActiveGuild,
      onOpenMemberSpace: () => navigateToView("member"),
      onOpenPublicSite: openPublicSite,
      onLogout: authSession.isApiEnabled ? authSession.logout : null,
    },
    viewRouterProps: {
      activeView,
      administrationAccess,
      authSession,
      currentUser,
      enabledModuleIds,
      purchasedDesignIds,
      onDisableModule: disableGuildOpsModule,
      onEnableModule: enableGuildOpsModule,
      onPurchaseTemplate: purchaseTemplateDesign,
      onUseTemplate: useTemplateDesign,
      onToggleAdministrationMember: toggleAdministrationMember,
      onToggleAdministrationModule: toggleAdministrationModule,
      onToggleAllAdministrationModules: toggleAllAdministrationModules,
      selectedGuild,
      members: eventsController.members,
      selfStatus: eventsController.selfStatus,
      setSelfStatus: eventsController.setSelfStatus,
      events: eventsController.activeEvents,
      createEvent: eventsController.createEvent,
      creatingEvent: eventsController.creatingEvent,
      eventCreateError: eventsController.eventCreateError,
      checkIn: eventsController.checkIn,
      checkinError: eventsController.checkinError,
      warSummary: eventsController.warSummary,
      updateMemberStatus: eventsController.updateMemberStatus,
      translateOn: messagesController.translateOn,
      setTranslateOn: messagesController.setTranslateOn,
      targetLanguage: messagesController.targetLanguage,
      setTargetLanguage: messagesController.changeTargetLanguage,
      chatMessages: messagesController.chatMessages,
      chatDraft: messagesController.chatDraft,
      chatNotice: messagesController.chatNotice,
      chatCooldownSeconds: messagesController.chatCooldownRemaining,
      setChatDraft: messagesController.setChatDraft,
      sendChat: messagesController.sendChat,
      conversations: messagesController.conversations,
      activeConversation: messagesController.activeConversation,
      onSelectConversation: messagesController.selectConversation,
      threadMessages: messagesController.threadMessages,
      messageDraft: messagesController.messageDraft,
      setMessageDraft: messagesController.setMessageDraft,
      sendGuildThreadMessage: messagesController.sendGuildThreadMessage,
      loadOlderThreadMessages: messagesController.loadOlderThreadMessages,
      messageNextCursor: messagesController.messageNextCursor,
      messageRecipients: messagesController.messageRecipients,
      onStartPrivateConversation: messagesController.startPrivateConversation,
      unreadMessageCount: messagesController.unreadMessageCount,
      messageRealtimeStatus: messagesController.messageRealtimeStatus,
      messageError: messagesController.messageError,
      forumCategories: forumController.forumCategories,
      forumRoles: forumController.forumRoles,
      forumCounters: forumController.forumCounters,
      forumCanManage: forumController.forumCanManage,
      activeForumCategoryId: forumController.activeForumCategoryId,
      onSelectForumCategory: forumController.selectForumCategory,
      forumThreads: forumController.forumThreadsState,
      activeForumThread: forumController.activeForumThread,
      onSelectForumThread: forumController.selectForumThread,
      forumPosts: forumController.forumPosts,
      forumThreadPagination: forumController.forumThreadPagination,
      forumPostPagination: forumController.forumPostPagination,
      forumThreadDraft: forumController.forumThreadDraft,
      setForumThreadDraft: forumController.setForumThreadDraft,
      forumReplyDraft: forumController.forumReplyDraft,
      setForumReplyDraft: forumController.setForumReplyDraft,
      forumCategoryDraft: forumController.forumCategoryDraft,
      setForumCategoryDraft: forumController.setForumCategoryDraft,
      forumEditingPostId: forumController.forumEditingPostId,
      forumError: forumController.forumError,
      forumLoading: forumController.forumLoading,
      onSaveForumCategory: forumController.saveForumCategory,
      onSaveForumCategoryPermissions: forumController.saveForumCategoryPermissions,
      onCreateForumThread: forumController.createForumThread,
      onUpdateForumThreadFlags: forumController.updateForumThreadFlags,
      onSendForumReply: forumController.sendForumReply,
      onEditForumPost: forumController.beginForumPostEdit,
      onDeleteForumPost: forumController.deleteForumPost,
      diplomacyRelations: diplomacyController.diplomacyRelations,
      diplomacyNapAgreements: diplomacyController.diplomacyNapAgreements,
      diplomacyCoordinates: diplomacyController.diplomacyCoordinates,
      diplomacyAudit: diplomacyController.diplomacyAudit,
      diplomacyError: diplomacyController.diplomacyError,
      saveDiplomacyRelation: diplomacyController.saveDiplomacyRelation,
      saveNapAgreement: diplomacyController.saveNapAgreement,
      saveDiplomacyCoordinate: diplomacyController.saveDiplomacyCoordinate,
      sosAlerts: sosController.sosAlerts,
      sosForm: sosController.sosForm,
      sosRealtimeStatus: sosController.sosRealtimeStatus,
      sosError: sosController.sosError,
      setSosForm: sosController.setSosForm,
      sendSos: sosController.sendSos,
      acknowledgeSos: sosController.acknowledgeSos,
      bankRequests: bankController.bankRequests,
      bankError: bankController.bankError,
      approveRequest: bankController.approveRequest,
      createBankRequest: bankController.createBankRequest,
      updateBankRequestStatus: bankController.updateBankRequestStatus,
      bankStock: bankController.bankStock,
      bankMovements: bankController.bankMovementsLog,
      addBankMovement: bankController.addBankMovement,
      bankCommand: bankController.bankCommand,
      setBankCommand: bankController.setBankCommand,
      siteDraft,
      setSiteDraft,
      publishGuildSite,
      publishingSite,
      sitePublishError,
      publicSiteUrl,
      onOpenPublicSite: openPublicSite,
      sitePublished,
      setSitePublished,
      guilds: activeGuilds,
      roleEdits,
      setRoleEdits,
      onGuildChange: changeActiveGuild,
      onNavigate: navigateToView,
    },
    mobileBottomNavProps: {
      activeView,
      mobileNav: mobileNavItems,
      onNavigate: navigateToView,
      unreadMessages: messagesController.unreadMessageCount,
    },
  };
}

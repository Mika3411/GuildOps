import {
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  useAbsenceController
} from "./useAbsenceController.js";
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
  useNotificationsController
} from "./useNotificationsController.js";
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
  getGuildOpsNavItems,
  getGuildOpsModuleByRoute,
  isGuildOpsModuleEnabled
} from "../config/moduleRegistry.js";
import {
  normalizeRealmCodeForGame
} from "../config/guildOpsConfig.js";
import {
  buildGuildOpsControllerProps
} from "./guildOpsController/buildGuildOpsControllerProps.js";
import {
  createAdministrationAccess,
  normalizeAdministrationAccess,
  sortAdministrationModuleIds
} from "./guildOpsController/administrationAccess.js";
import {
  normalizeMemberBlock,
  normalizeMembershipRequest,
} from "./guildOpsController/memberModerationStorage.js";
import {
  collectModuleActivationIds,
  collectModuleDisableIds,
  normalizeEnabledModuleIds
} from "./guildOpsController/moduleState.js";
import {
  getInviteRouteSlug
} from "./guildOpsController/routeUtils.js";


const EMPTY_LIST = Object.freeze([]);
const EMPTY_USER = Object.freeze({
  id: "",
  displayName: "",
  initials: "",
  preferredLanguage: "FR",
  role: "membre",
  roles: ["membre"],
});
export function useGuildOpsController() {
  const apiEnabled = isApiConfigured();
  const authSession = useAuthSession();
  const guildOpsState = useGuildOpsData({
    enabled: apiEnabled && authSession.isAuthenticated,
    reloadKey: `${authSession.user?.id || "guest"}:${authSession.context?.activeGuild?.id || "no-guild"}`,
  });
  const { data: guildOpsData } = guildOpsState;
  const currentUser = authSession.user || guildOpsData.authUser || EMPTY_USER;
  const activeGuilds = authSession.guilds.length ? authSession.guilds : guildOpsData.guilds.length ? guildOpsData.guilds : EMPTY_LIST;

  const [routePath, setRoutePath] = useState(() => window.location.pathname);
  const [activeView, setActiveView] = useState("command");
  const [selectedGuild, setSelectedGuild] = useState(() => activeGuilds[0]);
  const [sitePublished, setSitePublished] = useState(() => guildOpsData.site.published);
  const [siteDraft, setSiteDraft] = useState(() => createGuildSiteDraft(activeGuilds[0], guildOpsData.site));
  const [lastPublishedSite, setLastPublishedSite] = useState(() => loadPublishedSite(slugify(guildOpsData.site.name || activeGuilds[0]?.name)));
  const [purchasedDesignIds, setPurchasedDesignIds] = useState(() => loadPurchasedDesignIds());
  const [membershipRequests, setMembershipRequests] = useState([]);
  const [memberBlocks, setMemberBlocks] = useState([]);
  const [moderatingMemberId, setModeratingMemberId] = useState("");
  const [memberModerationError, setMemberModerationError] = useState("");
  const [rotatingInviteLink, setRotatingInviteLink] = useState(false);
  const [publishingSite, setPublishingSite] = useState(false);
  const [sitePublishError, setSitePublishError] = useState("");
  const [guildCreateError, setGuildCreateError] = useState("");
  const [creatingGuild, setCreatingGuild] = useState(false);
  const [enabledModuleIds, setEnabledModuleIds] = useState(() => getDefaultEnabledModuleIds());
  const enabledModuleIdsRef = useRef(enabledModuleIds);
  const [moduleUpdateError, setModuleUpdateError] = useState("");
  const [administrationAccess, setAdministrationAccess] = useState(() => createAdministrationAccess(guildOpsData.members));
  const bootstrapEnabledModuleKey = Array.isArray(guildOpsData.enabledModules) ? guildOpsData.enabledModules.join("|") : "";
  const bootstrapGuildKey = getGuildKey(guildOpsData.context?.activeGuild || authSession.context?.activeGuild);
  const enabledModuleKey = enabledModuleIds.join("|");
  const publicRouteSlug = getPublicRouteSlug(routePath);
  const publicRouteSegment = getPublicRouteSegment(routePath);
  const inviteRouteSlug = getInviteRouteSlug(routePath);
  const siteDraftEnabledModuleKey = Array.isArray(siteDraft.enabledModules) ? siteDraft.enabledModules.join("|") : "";
  const publishedEnabledModuleKey = Array.isArray(lastPublishedSite?.enabledModules) ? lastPublishedSite.enabledModules.join("|") : "";
  const effectiveEnabledModuleIds = useMemo(() => {
    if (!publicRouteSlug) return enabledModuleIds;

    return [
      ...new Set([
        ...enabledModuleIds,
        ...(siteDraft.enabledModules || []),
        ...(lastPublishedSite?.enabledModules || []),
      ]),
    ];
  }, [enabledModuleKey, publicRouteSlug, siteDraftEnabledModuleKey, publishedEnabledModuleKey]);
  const effectiveEnabledModuleKey = effectiveEnabledModuleIds.join("|");
  const moduleAvailability = useMemo(
    () => ({
      bank: isGuildOpsModuleEnabled("bank", effectiveEnabledModuleIds),
      diplomacy: isGuildOpsModuleEnabled("diplomacy", effectiveEnabledModuleIds),
      events: isGuildOpsModuleEnabled("wars_events", effectiveEnabledModuleIds),
      forum: isGuildOpsModuleEnabled("forum", effectiveEnabledModuleIds),
      messages: isGuildOpsModuleEnabled("messages", effectiveEnabledModuleIds),
      sos: isGuildOpsModuleEnabled("sos_attack", effectiveEnabledModuleIds),
      translation: isGuildOpsModuleEnabled("translation", effectiveEnabledModuleIds),
    }),
    [effectiveEnabledModuleKey],
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
    const normalizedModuleIds = normalizeEnabledModuleIds(guildOpsData.enabledModules);
    enabledModuleIdsRef.current = normalizedModuleIds;
    setEnabledModuleIds(normalizedModuleIds);
    setModuleUpdateError("");
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
    const draftSlug = slugify(selectedGuild.name);
    const storedSite = loadPublishedSite(draftSlug);
    const bootstrapSiteName =
      guildOpsData.site.guildName ||
      guildOpsData.site.guild_name ||
      guildOpsData.site.name ||
      guildOpsData.site.title ||
      "";
    const bootstrapSiteMatchesGuild = !bootstrapSiteName || slugify(bootstrapSiteName) === draftSlug;

    const nextDraft = createGuildSiteDraft(selectedGuild, storedSite || (bootstrapSiteMatchesGuild ? guildOpsData.site : {}));
    const nextPublished = Boolean(
      storedSite?.published ||
        storedSite?.status === "published" ||
        nextDraft.published ||
        nextDraft.status === "published",
    );

    setSiteDraft(nextDraft);
    setLastPublishedSite(storedSite);
    setSitePublished(nextPublished);
    setSitePublishError("");
  }, [guildOpsData.site, selectedGuild]);

  useEffect(() => {
    if (!apiEnabled || !authSession.isAuthenticated || !selectedGuild?.id || !can(currentUser, "approve_members")) {
      setMembershipRequests([]);
      return undefined;
    }

    const controller = new AbortController();

    guildOpsApi
      .listMembershipRequests(selectedGuild.id, { signal: controller.signal })
      .then((payload) => {
        if (controller.signal.aborted) return;
        const requests = Array.isArray(payload?.requests) ? payload.requests : [];
        setMembershipRequests(requests.map(normalizeMembershipRequest).filter(Boolean));
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setMembershipRequests([]);
        }
      });

    return () => controller.abort();
  }, [apiEnabled, authSession.isAuthenticated, currentUser, selectedGuild?.id]);

  useEffect(() => {
    if (!apiEnabled || !authSession.isAuthenticated || !selectedGuild?.id || !can(currentUser, "manage_members")) {
      setMemberBlocks([]);
      return undefined;
    }

    const controller = new AbortController();

    guildOpsApi
      .listMemberBlocks(selectedGuild.id, { signal: controller.signal })
      .then((payload) => {
        if (controller.signal.aborted) return;
        const blocks = Array.isArray(payload?.blocks) ? payload.blocks : [];
        setMemberBlocks(blocks.map(normalizeMemberBlock).filter(Boolean));
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setMemberBlocks([]);
        }
      });

    return () => controller.abort();
  }, [apiEnabled, authSession.isAuthenticated, currentUser, selectedGuild?.id]);

  const eventsController = useEventsController({
    apiEnabled,
    currentUser,
    selectedGuild,
    siteDraft,
    guildOpsData,
    authSession,
    moduleEnabled: moduleAvailability.events,
  });
  const absenceController = useAbsenceController({
    currentUser,
    selectedGuild,
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
  const notificationsController = useNotificationsController({
    apiEnabled,
    authSession,
    selectedGuild,
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

  async function approveMembershipRequest(requestId) {
    if (!can(currentUser, "approve_members")) return;
    if (!apiEnabled || !selectedGuild?.id) {
      setMemberModerationError("API requise pour valider une adhésion.");
      return;
    }

    const approvedRequest = membershipRequests.find((request) => request.id === requestId && request.status === "pending");
    if (!approvedRequest) return;

    const payload = await guildOpsApi.decideMembershipRequest(selectedGuild.id, requestId, "approved");
    const decidedRequest = normalizeMembershipRequest(payload?.request);
    if (decidedRequest) {
      setMembershipRequests((current) => current.map((request) => (request.id === requestId ? decidedRequest : request)));
    }
    if (payload?.member) {
      eventsController.addLocalMember({
        id: payload.member.id,
        name: payload.member.nickname || payload.member.name,
        role: "Membre",
        status: payload.member.status || "active",
      });
    }
  }

  async function refuseMembershipRequest(requestId) {
    if (!can(currentUser, "approve_members")) return;
    if (!apiEnabled || !selectedGuild?.id) {
      setMemberModerationError("API requise pour refuser une adhésion.");
      return;
    }

    const payload = await guildOpsApi.decideMembershipRequest(selectedGuild.id, requestId, "refused");
    const decidedRequest = normalizeMembershipRequest(payload?.request);
    if (decidedRequest) {
      setMembershipRequests((current) => current.map((request) => (request.id === requestId ? decidedRequest : request)));
    }
  }

  function upsertMemberBlock(block) {
    const normalizedBlock = normalizeMemberBlock(block);
    if (!normalizedBlock) return null;

    setMemberBlocks((current) => {
      const next = [
        normalizedBlock,
        ...current.filter((candidate) => candidate.id !== normalizedBlock.id),
      ];

      return next;
    });

    return normalizedBlock;
  }

  function markMembershipRequestRefused(requestId, decidedBy = currentUser.displayName || "Admin") {
    setMembershipRequests((current) => {
      const next = current.map((request) =>
        request.id === requestId && request.status === "pending"
          ? {
              ...request,
              status: "refused",
              decidedAt: new Date().toISOString(),
              decidedBy,
            }
          : request,
      );

      return next;
    });
  }

  async function banGuildMember(memberId) {
    if (!can(currentUser, "manage_members")) return;

    const member = eventsController.members.find((candidate) => candidate.id === memberId);
    if (!member) return;

    setMemberModerationError("");
    setModeratingMemberId(memberId);

    try {
      if (!apiEnabled || !selectedGuild?.id) {
        setMemberModerationError("API requise pour bannir un membre.");
        return;
      }

      const payload = await guildOpsApi.banGuildMember(selectedGuild.id, memberId, {
        reason: "Banni et bloque depuis GuildOps.",
        block: true,
      });
      if (payload?.block) {
        upsertMemberBlock(payload.block);
      }
      eventsController.banLocalMember(memberId);
    } catch (error) {
      setMemberModerationError(error?.message || "Impossible de bannir ce membre.");
    } finally {
      setModeratingMemberId("");
    }
  }

  async function blockMembershipRequest(requestId) {
    if (!can(currentUser, "manage_members")) return;

    const request = membershipRequests.find((candidate) => candidate.id === requestId);
    if (!request) return;

    setMemberModerationError("");
    setModeratingMemberId(requestId);

    try {
      if (!apiEnabled || !selectedGuild?.id) {
        setMemberModerationError("API requise pour bloquer une demande.");
        return;
      }

      const payload = await guildOpsApi.blockGuildMember(selectedGuild.id, {
        userId: request.userId || undefined,
        nickname: request.nickname,
        reason: "Demande refusee et joueur bloque depuis GuildOps.",
      });
      if (payload?.block) {
        upsertMemberBlock(payload.block);
      }

      markMembershipRequestRefused(requestId);
    } catch (error) {
      setMemberModerationError(error?.message || "Impossible de bloquer cette demande.");
    } finally {
      setModeratingMemberId("");
    }
  }

  async function unblockGuildMember(blockId) {
    if (!can(currentUser, "manage_members")) return;

    setMemberModerationError("");
    setModeratingMemberId(blockId);

    try {
      if (!apiEnabled || !selectedGuild?.id) {
        setMemberModerationError("API requise pour débloquer un membre.");
        return;
      }

      const payload = await guildOpsApi.unblockGuildMember(selectedGuild.id, blockId, {
        reason: "Blocage leve depuis GuildOps.",
      });
      if (payload?.block) {
        upsertMemberBlock(payload.block);
      }
    } catch (error) {
      setMemberModerationError(error?.message || "Impossible de debloquer ce joueur.");
    } finally {
      setModeratingMemberId("");
    }
  }

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
  const publicEvents = useMemo(
    () => ({
      nextEvent: eventsController.warSummary?.nextEvent || eventsController.activeEvents[0] || null,
      events: eventsController.activeEvents,
      weeklyObjectives: eventsController.warSummary?.weeklyObjectives || {
        total: 0,
        done: 0,
        completionRate: 0,
        objectives: [],
      },
    }),
    [eventsController.activeEvents, eventsController.warSummary],
  );

  const hasPublishedPublicSite = Boolean(
    siteDraft.published ||
      siteDraft.status === "published" ||
      lastPublishedSite?.published ||
      lastPublishedSite?.status === "published" ||
      sitePublished,
  );
  const publicSiteSlug = slugify(lastPublishedSite?.slug || lastPublishedSite?.publicSlug || siteDraft.slug || siteDraft.guildName);
  const publicSitePath = hasPublishedPublicSite && publicSiteSlug ? `/g/${publicSiteSlug}` : "";
  const publicSiteUrl = publicSitePath ? `${window.location.origin}${publicSitePath}` : "";

  function persistEnabledModuleIds(nextModuleIds, previousModuleIds) {
    const normalizedModuleIds = normalizeEnabledModuleIds(nextModuleIds);
    enabledModuleIdsRef.current = normalizedModuleIds;
    setModuleUpdateError("");
    setSiteDraft((current) => ({ ...current, enabledModules: normalizedModuleIds }));

    if (!apiEnabled || !authSession.isAuthenticated || !selectedGuild?.id) {
      setModuleUpdateError("API requise pour modifier les modules.");
      return;
    }

    guildOpsApi
      .updateGuildModules(selectedGuild.id, normalizedModuleIds)
      .then((payload) => {
        const persistedModuleIds = normalizeEnabledModuleIds(payload?.enabledModules || normalizedModuleIds);
        enabledModuleIdsRef.current = persistedModuleIds;
        setEnabledModuleIds(persistedModuleIds);
        setSiteDraft((current) => ({ ...current, enabledModules: persistedModuleIds }));
      })
      .catch((error) => {
        const fallbackModuleIds = normalizeEnabledModuleIds(previousModuleIds);
        enabledModuleIdsRef.current = fallbackModuleIds;
        setEnabledModuleIds(fallbackModuleIds);
        setSiteDraft((current) => ({ ...current, enabledModules: fallbackModuleIds }));
        setModuleUpdateError(error?.message || "Mise à jour des modules impossible.");
      });
  }

  function enableGuildOpsModule(moduleId) {
    if (!apiEnabled || !authSession.isAuthenticated || !selectedGuild?.id) {
      setModuleUpdateError("API requise pour modifier les modules.");
      return;
    }

    const previousModuleIds = enabledModuleIdsRef.current;
    const next = new Set(previousModuleIds);
    collectModuleActivationIds(moduleId).forEach((id) => next.add(id));
    const nextModuleIds = normalizeEnabledModuleIds([...next]);

    enabledModuleIdsRef.current = nextModuleIds;
    setEnabledModuleIds(nextModuleIds);
    persistEnabledModuleIds(nextModuleIds, previousModuleIds);
  }

  function disableGuildOpsModule(moduleId) {
    if (!apiEnabled || !authSession.isAuthenticated || !selectedGuild?.id) {
      setModuleUpdateError("API requise pour modifier les modules.");
      return;
    }

    const previousModuleIds = enabledModuleIdsRef.current;
    const idsToDisable = collectModuleDisableIds(moduleId, previousModuleIds);
    const nextModuleIds = normalizeEnabledModuleIds(previousModuleIds.filter((id) => !idsToDisable.has(id)));

    enabledModuleIdsRef.current = nextModuleIds;
    setEnabledModuleIds(nextModuleIds);
    persistEnabledModuleIds(nextModuleIds, previousModuleIds);
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

  async function requestGuildMembership(slug, site, body = {}) {
    const draft = createGuildSiteDraft({}, site || {});
    const guildSlug = slugify(slug || draft.slug || draft.guildName || selectedGuild?.name);
    const nickname = String(body.nickname || body.user?.displayName || "Membre").trim();

    if (!apiEnabled) {
      throw new Error("API requise pour envoyer une demande d'adhésion.");
    }

    const payload = await guildOpsApi.createMembershipRequest(guildSlug, {
      nickname,
      message: "Demande envoyée depuis le site public, sans lien d'invitation actif.",
    });
    const apiRequest = normalizeMembershipRequest({
      ...(payload?.request || {}),
      guildSlug,
      guildName: payload?.request?.guildName || draft.guildName || selectedGuild?.name || "Guilde",
      game: payload?.request?.game || draft.game || selectedGuild?.game || "",
      realm: payload?.request?.realm || draft.realm || selectedGuild?.realm || selectedGuild?.server || "",
    });

    if (apiRequest) {
      setMembershipRequests((current) => [
        apiRequest,
        ...current.filter(
          (existingRequest) =>
            !(
              existingRequest.guildSlug === apiRequest.guildSlug &&
              existingRequest.nickname.toLowerCase() === apiRequest.nickname.toLowerCase() &&
              existingRequest.status === "pending"
            ),
        ),
      ]);
    }

    return apiRequest;
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
    if (!publicSitePath) {
      setSitePublishError("Publie le site pour ouvrir une page publique. La guilde privee est deja creee.");
      navigateToView("command");
      return;
    }

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

    const payload = buildGuildSitePayload({ ...siteDraft, enabledModules: enabledModuleIds, publicDiplomacy, publicEvents, publicForum }, selectedGuild);
    if (!apiEnabled || !payload.guildId) {
      setSitePublishError("API requise pour publier le site.");
      return null;
    }

    setPublishingSite(true);
    setSitePublishError("");

    try {
      const apiPayload = await guildOpsApi.publishGuildSite(payload.guildId, payload);
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

  async function rotateInviteLink() {
    if (!can(currentUser, "approve_members") && !can(currentUser, "manage_site")) return null;

    if (!apiEnabled || !selectedGuild?.id) {
      setSitePublishError("API requise pour régénérer le lien d'invitation.");
      return null;
    }

    setRotatingInviteLink(true);

    try {
      const payload = await guildOpsApi.rotateGuildInviteLink(selectedGuild.id);
      const nextDraft = createGuildSiteDraft(selectedGuild, {
        ...siteDraft,
        inviteToken: payload?.inviteToken,
        inviteRotatedAt: payload?.inviteRotatedAt,
        memberInviteUrl: payload?.memberInviteUrl || payload?.inviteLink,
      });

      setSiteDraft(nextDraft);
      setLastPublishedSite((current) => (current ? { ...current, ...nextDraft } : current));
      return nextDraft;
    } finally {
      setRotatingInviteLink(false);
    }
  }

  return buildGuildOpsControllerProps({
    activeGuilds,
    activeView,
    administrationAccess,
    absenceController,
    approveMembershipRequest,
    authSession,
    bankController,
    banGuildMember,
    blockMembershipRequest,
    changeActiveGuild,
    createGuild,
    creatingGuild,
    currentUser,
    diplomacyController,
    disableGuildOpsModule,
    effectiveEnabledModuleIds,
    enableGuildOpsModule,
    enabledModuleIds,
    eventsController,
    forumController,
    guildCreateError,
    guildOpsState,
    inviteRouteSlug,
    lastPublishedSite,
    memberBlocks,
    memberModerationError,
    membershipRequests,
    messagesController,
    notificationsController,
    mobileNavItems,
    moduleUpdateError,
    moderatingMemberId,
    navItems,
    navigateToPath,
    navigateToView,
    openPublicSite,
    publicDiplomacy,
    publicForum,
    publicRouteSegment,
    publicRouteSlug,
    publicSiteUrl,
    publishGuildSite,
    publishingSite,
    purchaseTemplateDesign,
    purchasedDesignIds,
    refuseMembershipRequest,
    requestGuildMembership,
    roleEdits,
    rotateInviteLink,
    rotatingInviteLink,
    routePath,
    selectedGuild,
    setRoleEdits,
    setSiteDraft,
    setSitePublished,
    siteDraft,
    sitePublishError,
    sitePublished,
    sosController,
    toggleAdministrationMember,
    toggleAdministrationModule,
    toggleAllAdministrationModules,
    unblockGuildMember,
    useTemplateDesign
  });
}

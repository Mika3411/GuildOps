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
  buildMemberInvitePath,
  createMemberInviteToken,
  createGuildSiteDraft,
  getMemberInviteToken,
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
const MEMBERSHIP_REQUESTS_STORAGE_KEY = "guildops:membership-requests:v1";
const MEMBER_BLOCKS_STORAGE_KEY = "guildops:member-blocks:v1";

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

function isActiveInviteLink() {
  return Boolean(getActiveInviteToken());
}

function getActiveInviteToken() {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  return getMemberInviteToken(`${window.location.pathname}?invite=${params.get("invite") || ""}`);
}

function loadMembershipRequests() {
  if (typeof window === "undefined" || !window.localStorage) return [];

  try {
    const requests = JSON.parse(window.localStorage.getItem(MEMBERSHIP_REQUESTS_STORAGE_KEY) || "[]");
    return Array.isArray(requests) ? requests.map(normalizeMembershipRequest).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function saveMembershipRequests(requests = []) {
  const normalizedRequests = requests.map(normalizeMembershipRequest).filter(Boolean);

  if (typeof window !== "undefined" && window.localStorage) {
    window.localStorage.setItem(MEMBERSHIP_REQUESTS_STORAGE_KEY, JSON.stringify(normalizedRequests));
  }

  return normalizedRequests;
}

function normalizeMembershipRequest(request = {}) {
  const nickname = String(request.nickname || request.name || "").trim();
  const guildSlug = slugify(request.guildSlug || request.slug || request.guildName || "");

  if (!nickname || !guildSlug) return null;

  return {
    id: String(request.id || `join-request-${guildSlug}-${slugify(nickname)}-${Date.now()}`),
    guildSlug,
    guildName: String(request.guildName || request.guild || guildSlug).trim(),
    game: String(request.game || "").trim(),
    realm: String(request.realm || "").trim(),
    nickname,
    userId: request.userId || "",
    email: request.email || "",
    message: String(request.message || "Demande envoyée depuis le site public.").trim(),
    source: request.source || "public",
    status: ["pending", "approved", "refused"].includes(request.status) ? request.status : "pending",
    requestedAt: request.requestedAt || new Date().toISOString(),
    decidedAt: request.decidedAt || null,
    decidedBy: request.decidedBy || "",
  };
}

function loadMemberBlocks() {
  if (typeof window === "undefined" || !window.localStorage) return [];

  try {
    const blocks = JSON.parse(window.localStorage.getItem(MEMBER_BLOCKS_STORAGE_KEY) || "[]");
    return Array.isArray(blocks) ? blocks.map(normalizeMemberBlock).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function saveMemberBlocks(blocks = []) {
  const normalizedBlocks = blocks.map(normalizeMemberBlock).filter(Boolean);

  if (typeof window !== "undefined" && window.localStorage) {
    window.localStorage.setItem(MEMBER_BLOCKS_STORAGE_KEY, JSON.stringify(normalizedBlocks));
  }

  return normalizedBlocks;
}

function normalizeMemberBlock(block = {}) {
  const nickname = String(block.nickname || block.name || "").trim();
  const guildSlug = slugify(block.guildSlug || block.slug || block.guildName || "");

  if (!nickname) return null;

  return {
    id: String(block.id || `member-block-${guildSlug || "guild"}-${slugify(nickname)}-${Date.now()}`),
    guildId: block.guildId || block.guild_id || "",
    guildSlug,
    userId: block.userId || block.user_id || "",
    nickname,
    normalizedNickname: String(block.normalizedNickname || block.normalized_nickname || slugify(nickname)).trim(),
    reason: String(block.reason || "Joueur bloque par moderation.").trim(),
    blockedBy: block.blockedBy || block.blocked_by || "",
    blockedByName: block.blockedByName || block.blocked_by_name || "",
    blockedAt: block.blockedAt || block.blocked_at || new Date().toISOString(),
    liftedAt: block.liftedAt || block.lifted_at || null,
    liftedBy: block.liftedBy || block.lifted_by || "",
    liftedByName: block.liftedByName || block.lifted_by_name || "",
    liftReason: block.liftReason || block.lift_reason || "",
    active: block.active !== false && !(block.liftedAt || block.lifted_at),
  };
}

function isBlockedForGuild(blocks = [], { guildId = "", guildSlug = "", nickname = "", userId = "" } = {}) {
  const normalizedNickname = String(nickname || "").trim().toLowerCase();
  const normalizedSlug = slugify(guildSlug);

  if (!normalizedNickname && !userId) return false;

  return blocks.some((block) => {
    if (block.active === false) return false;
    const blockGuildMatches =
      (!guildId && !normalizedSlug) ||
      (guildId && block.guildId === guildId) ||
      (normalizedSlug && block.guildSlug === normalizedSlug) ||
      (!block.guildId && !block.guildSlug);
    const userMatches = userId && block.userId === userId;
    const nicknameMatches = block.nickname.toLowerCase() === normalizedNickname;

    return blockGuildMatches && (userMatches || nicknameMatches);
  });
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
  const [membershipRequests, setMembershipRequests] = useState(() => loadMembershipRequests());
  const [memberBlocks, setMemberBlocks] = useState(() => loadMemberBlocks());
  const [moderatingMemberId, setModeratingMemberId] = useState("");
  const [memberModerationError, setMemberModerationError] = useState("");
  const [rotatingInviteLink, setRotatingInviteLink] = useState(false);
  const [publishingSite, setPublishingSite] = useState(false);
  const [sitePublishError, setSitePublishError] = useState("");
  const [guildCreateError, setGuildCreateError] = useState("");
  const [creatingGuild, setCreatingGuild] = useState(false);
  const [enabledModuleIds, setEnabledModuleIds] = useState(() => getDefaultEnabledModuleIds());
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

  useEffect(() => {
    if (!apiEnabled || !authSession.isAuthenticated || !selectedGuild?.id || !can(currentUser, "approve_members")) {
      if (apiEnabled) {
        setMembershipRequests([]);
      }
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
      if (apiEnabled) {
        setMemberBlocks([]);
      }
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

  async function approveMembershipRequest(requestId) {
    if (!can(currentUser, "approve_members")) return;

    const approvedRequest = membershipRequests.find((request) => request.id === requestId && request.status === "pending");
    if (!approvedRequest) return;

    if (apiEnabled && selectedGuild?.id) {
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
      return;
    }

    setMembershipRequests((current) => {
      const next = current.map((request) => {
        if (request.id !== requestId || request.status !== "pending") return request;

        return {
          ...request,
          status: "approved",
          decidedAt: new Date().toISOString(),
          decidedBy: currentUser.displayName || "Admin",
        };
      });

      return saveMembershipRequests(next);
    });

    eventsController.addLocalMember({
      id: `approved-${approvedRequest.guildSlug}-${slugify(approvedRequest.nickname)}`,
      name: approvedRequest.nickname,
      role: "Membre",
      status: "active",
    });
  }

  async function refuseMembershipRequest(requestId) {
    if (!can(currentUser, "approve_members")) return;

    if (apiEnabled && selectedGuild?.id) {
      const payload = await guildOpsApi.decideMembershipRequest(selectedGuild.id, requestId, "refused");
      const decidedRequest = normalizeMembershipRequest(payload?.request);
      if (decidedRequest) {
        setMembershipRequests((current) => current.map((request) => (request.id === requestId ? decidedRequest : request)));
      }
      return;
    }

    setMembershipRequests((current) => {
      const next = current.map((request) =>
        request.id === requestId && request.status === "pending"
          ? {
              ...request,
              status: "refused",
              decidedAt: new Date().toISOString(),
              decidedBy: currentUser.displayName || "Admin",
            }
          : request,
      );

      return saveMembershipRequests(next);
    });
  }

  function upsertMemberBlock(block) {
    const normalizedBlock = normalizeMemberBlock(block);
    if (!normalizedBlock) return null;

    setMemberBlocks((current) => {
      const next = [
        normalizedBlock,
        ...current.filter((candidate) => candidate.id !== normalizedBlock.id),
      ];

      return apiEnabled ? next : saveMemberBlocks(next);
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

      return apiEnabled ? next : saveMembershipRequests(next);
    });
  }

  async function banGuildMember(memberId) {
    if (!can(currentUser, "manage_members")) return;

    const member = eventsController.members.find((candidate) => candidate.id === memberId);
    if (!member) return;

    setMemberModerationError("");
    setModeratingMemberId(memberId);

    try {
      if (apiEnabled && selectedGuild?.id) {
        const payload = await guildOpsApi.banGuildMember(selectedGuild.id, memberId, {
          reason: "Banni et bloque depuis GuildOps.",
          block: true,
        });
        if (payload?.block) {
          upsertMemberBlock(payload.block);
        }
        eventsController.banLocalMember(memberId);
        return;
      }

      const block = upsertMemberBlock({
        id: `local-block-${slugify(selectedGuild?.name || "guild")}-${slugify(member.name || member.nickname)}-${Date.now()}`,
        guildId: selectedGuild?.id || "",
        guildSlug: slugify(selectedGuild?.name || ""),
        userId: member.userId || "",
        nickname: member.nickname || member.name,
        reason: "Banni et bloque depuis GuildOps.",
        blockedByName: currentUser.displayName || "Admin",
        blockedAt: new Date().toISOString(),
      });

      if (block) {
        eventsController.banLocalMember(memberId);
      }
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
      if (apiEnabled && selectedGuild?.id) {
        const payload = await guildOpsApi.blockGuildMember(selectedGuild.id, {
          userId: request.userId || undefined,
          nickname: request.nickname,
          reason: "Demande refusee et joueur bloque depuis GuildOps.",
        });
        if (payload?.block) {
          upsertMemberBlock(payload.block);
        }
      } else {
        upsertMemberBlock({
          id: `local-block-${request.guildSlug}-${slugify(request.nickname)}-${Date.now()}`,
          guildId: selectedGuild?.id || "",
          guildSlug: request.guildSlug,
          userId: request.userId || "",
          nickname: request.nickname,
          reason: "Demande refusee et joueur bloque depuis GuildOps.",
          blockedByName: currentUser.displayName || "Admin",
          blockedAt: new Date().toISOString(),
        });
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
      if (apiEnabled && selectedGuild?.id) {
        const payload = await guildOpsApi.unblockGuildMember(selectedGuild.id, blockId, {
          reason: "Blocage leve depuis GuildOps.",
        });
        if (payload?.block) {
          upsertMemberBlock(payload.block);
        }
        return;
      }

      setMemberBlocks((current) => {
        const next = current.map((block) =>
          block.id === blockId
            ? {
                ...block,
                active: false,
                liftedAt: new Date().toISOString(),
                liftedByName: currentUser.displayName || "Admin",
                liftReason: "Blocage leve depuis GuildOps.",
              }
            : block,
        );

        return saveMemberBlocks(next);
      });
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

  async function requestGuildMembership(slug, site, body = {}) {
    const draft = createGuildSiteDraft({}, site || {});
    const guildSlug = slugify(slug || draft.slug || draft.guildName || selectedGuild?.name);
    const nickname = String(body.nickname || body.user?.displayName || "Membre").trim();
    const requestedAt = new Date().toISOString();

    if (
      !apiEnabled &&
      isBlockedForGuild(memberBlocks, {
        guildId: selectedGuild?.id || "",
        guildSlug,
        nickname,
        userId: body.user?.id || currentUser.id || "",
      })
    ) {
      throw new Error("Ce joueur est bloque pour cette guilde.");
    }

    if (apiEnabled) {
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
        setMembershipRequests((current) => {
          const next = [
            apiRequest,
            ...current.filter(
              (existingRequest) =>
                !(
                  existingRequest.guildSlug === apiRequest.guildSlug &&
                  existingRequest.nickname.toLowerCase() === apiRequest.nickname.toLowerCase() &&
                  existingRequest.status === "pending"
                ),
            ),
          ];
          return next;
        });
      }

      return apiRequest;
    }

    const request = normalizeMembershipRequest({
      id: `join-request-${guildSlug}-${slugify(nickname)}-${Date.now()}`,
      guildSlug,
      guildName: draft.guildName || selectedGuild?.name || "Guilde",
      game: draft.game || selectedGuild?.game || "",
      realm: draft.realm || selectedGuild?.realm || selectedGuild?.server || "",
      nickname,
      userId: body.user?.id || currentUser.id || "",
      email: body.user?.email || currentUser.email || "",
      message: "Demande envoyée depuis le site public, sans lien d'invitation actif.",
      source: "public",
      status: "pending",
      requestedAt,
    });

    setMembershipRequests((current) => {
      const next = [
        request,
        ...current.filter(
          (existingRequest) =>
            !(
              existingRequest.guildSlug === request.guildSlug &&
              existingRequest.nickname.toLowerCase() === request.nickname.toLowerCase() &&
              existingRequest.status === "pending"
            ),
        ),
      ];
      return saveMembershipRequests(next);
    });

    return request;
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

    const payload = buildGuildSitePayload({ ...siteDraft, enabledModules: enabledModuleIds, publicDiplomacy, publicForum }, selectedGuild);
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

  async function rotateInviteLink() {
    if (!can(currentUser, "approve_members") && !can(currentUser, "manage_site")) return null;

    const slug = slugify(siteDraft.slug || siteDraft.guildName || selectedGuild?.name);
    setRotatingInviteLink(true);

    try {
      if (apiEnabled && selectedGuild?.id) {
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
      }

      const inviteToken = createMemberInviteToken();
      const inviteRotatedAt = new Date().toISOString();
      const nextDraft = {
        ...siteDraft,
        slug,
        inviteToken,
        inviteRotatedAt,
        memberInviteUrl: buildMemberInvitePath(slug, inviteToken),
      };

      setSiteDraft(nextDraft);

      if (sitePublished || lastPublishedSite) {
        const publishedSite = savePublishedSite({
          ...(lastPublishedSite || {}),
          ...nextDraft,
          publicSlug: slug,
          slug,
          status: "published",
          published: true,
          publishedAt: lastPublishedSite?.publishedAt || new Date().toISOString(),
        });
        setLastPublishedSite(publishedSite);
      }

      return nextDraft;
    } finally {
      setRotatingInviteLink(false);
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
      acknowledgeSos: sosController.acknowledgeSos,
      currentUser,
      enabledModuleIds: effectiveEnabledModuleIds,
      fallbackSite: lastPublishedSite,
      members: eventsController.members,
      publicDiplomacy,
      publicForum,
      onNavigatePublicRoute: navigateToPath,
      onBackToBuilder: () => navigateToPath("/app"),
      routeSegment: publicRouteSegment,
      sendSos: sosController.sendSos,
      setSosForm: sosController.setSosForm,
      slug: publicRouteSlug,
      sosAlerts: sosController.sosAlerts,
      sosError: sosController.sosError,
      sosForm: sosController.sosForm,
      sosRealtimeStatus: sosController.sosRealtimeStatus,
    },
    joinRouteProps: {
      authSession,
      inviteSlug: inviteRouteSlug,
      isInviteLink: isActiveInviteLink(),
      inviteToken: getActiveInviteToken(),
      memberBlocks,
      onJoined: async () => {
        await authSession.reload?.();
        await guildOpsState.reload?.();
      },
      onOpenApp: () => navigateToPath("/app"),
      onOpenPublicSite: (slug = inviteRouteSlug) => navigateToPath(`/g/${slugify(slug)}`),
      onRequestJoin: requestGuildMembership,
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
      memberBlocks,
      memberModerationError,
      moderatingMemberId,
      membershipRequests,
      onApproveMembershipRequest: approveMembershipRequest,
      onBanGuildMember: banGuildMember,
      onBlockMembershipRequest: blockMembershipRequest,
      onRefuseMembershipRequest: refuseMembershipRequest,
      onRotateInviteLink: rotateInviteLink,
      onUnblockGuildMember: unblockGuildMember,
      rotatingInviteLink,
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

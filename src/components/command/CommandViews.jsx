import React, {
  useEffect,
  useId,
  useMemo,
  useState
} from "react";
import {
  AlertTriangle,
  Banknote,
  CalendarDays,
  Check,
  Copy,
  Eye,
  FileText,
  Flag,
  Globe2,
  Handshake,
  ImagePlus,
  Info,
  LayoutDashboard,
  Lock,
  Mail,
  MessageSquare,
  Palette,
  RefreshCw,
  Send,
  Shield,
  ShieldAlert,
  SlidersHorizontal,
  Swords,
  Trash2,
  Trophy,
  Upload,
  UserPlus,
  X,
} from "lucide-react";
import {
  isApiConfigured
} from "../../lib/apiClient.js";
import {
  guildOpsApi
} from "../../lib/guildOpsApi.js";
import {
  PUBLIC_CHAT_LIMIT_LABEL,
  formatPublicChatCooldown,
  getPublicChatRateLimitDetails
} from "../../lib/publicChatGuards.js";
import {
  getMemberRelay,
  getMemberRelayPath,
  loadMemberRelayDispatches,
  saveMemberRelayDispatch
} from "../../lib/memberRelay.js";
import {
  can,
  getGuardProps,
  getRoleLabel,
  permissionRoles
} from "../../lib/rbac.js";
import {
  buildMemberInvitePath,
  buildMemberRequestPath,
  createGuildSiteDraft,
  getAvailableDesignOptions,
  getColorOption,
  getDesignOption,
  getThemeOption,
  getTypographyOption,
  loadPublishedSite,
  savePublishedSite,
  slugify
} from "../../lib/guildSiteStore.js";
import {
  GAME_OPTIONS,
  REALM_CODE_MAX_LENGTH,
  getRealmPlaceholderForGame,
  normalizeRealmCodeForGame
} from "../../config/guildOpsConfig.js";
import {
  guildOpsModuleById,
  isGuildOpsModuleEnabled,
  siteSectionMeta
} from "../../config/moduleRegistry.js";
import {
  appendUniqueById,
  normalizeApiChatMessage,
  getTranslatedText,
  formatChatTime,
  getVisibleSiteSections,
  formatEventTitle,
  formatEventWhen,
  formatRelativeEventTime,
  normalizeSosAlert,
  normalizeSosCallKind,
  getSosAckLabel,
  parseRealtimeEvent,
  formatSosTime
} from "../../lib/guildOpsTransforms.js";
import {
  BankMini,
  BankView,
  PublicBankModule
} from "../bank/BankViews.jsx";
import {
  DiplomacyMini,
  DiplomacyView,
  PublicDiplomacyModule
} from "../diplomacy/DiplomacyViews.jsx";
import {
  ForumView
} from "../forum/ForumViews.jsx";
import {
  MembershipRequestsView
} from "../layout/admin/AdminViews.jsx";
import {
  Avatar,
  PanelHeader,
  RolePill,
  TranslationPanel
} from "../shared/Shared.jsx";
import {
  EventComposer
} from "../wars/WarsViews.jsx";

const SITE_BUILDER_HELP = Object.freeze({
  config: "Parametres de base du site de guilde.",
  guildName: "Nom utilise dans l'en-tete, le titre et l'URL.",
  game: "Jeu de la guilde.",
  realm: "Serveur, royaume ou monde de la guilde.",
  tagline: "Phrase courte sous le nom de guilde, lisible des l'arrivee.",
  objective: "Message principal de la page de guilde : coordination, wars, consignes ou organisation.",
  memberInviteUrl: "Lien GuildOps genere automatiquement pour inviter un membre a s'inscrire.",
  objectiveTags: "Badges rapides qui resument le style de guilde.",
  style: "Regle l'apparence de la page de guilde.",
  design: "Change la structure UI sans modifier les fonctions ni le contenu.",
  heroImage: "Image principale affichee dans le hero du site.",
});

const HERO_IMAGE_SOURCE_MAX_BYTES = 6 * 1024 * 1024;
const HERO_IMAGE_TARGET_BYTES = 560 * 1024;
const HERO_IMAGE_DATA_URL_MAX_LENGTH = 760_000;
const HERO_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const HERO_IMAGE_COMPRESSION_STEPS = Object.freeze([
  { maxSize: 1800, quality: 0.82 },
  { maxSize: 1600, quality: 0.76 },
  { maxSize: 1400, quality: 0.72 },
  { maxSize: 1200, quality: 0.68 },
  { maxSize: 1000, quality: 0.64 },
  { maxSize: 880, quality: 0.6 },
]);
const PUBLIC_MEMBER_SPACE_ROUTE = "espace-membre";
const PUBLIC_MEMBER_PROFILE_STORAGE_PREFIX = "guildops:public-member-profile:v1:";
const PUBLIC_MEMBER_AVATAR_SOURCE_MAX_BYTES = 4 * 1024 * 1024;
const PUBLIC_MEMBER_AVATAR_DATA_URL_MAX_LENGTH = 320_000;
const PUBLIC_MEMBER_AVATAR_COMPRESSION_STEPS = Object.freeze([
  { size: 512, quality: 0.82 },
  { size: 384, quality: 0.76 },
  { size: 320, quality: 0.7 },
]);

const PUBLIC_MEMBER_STATUS_LABELS = Object.freeze({
  active: "Actif",
  inactive: "Inactif",
  invited: "Invite",
  online: "En ligne",
  offline: "Hors ligne",
});

const SOS_CALL_OPTIONS = Object.freeze([
  {
    id: "defense",
    label: "Défense",
    actionLabel: "Envoyer appel défense",
    readyLabel: "Défense prête",
    title: "Appel défense",
    icon: ShieldAlert,
  },
  {
    id: "attack",
    label: "Attaque",
    actionLabel: "Envoyer appel attaque",
    readyLabel: "Attaque prête",
    title: "Appel attaque",
    icon: Swords,
  },
]);

function getSosCallConfig(value) {
  const callKind = normalizeSosCallKind(value);
  return SOS_CALL_OPTIONS.find((option) => option.id === callKind) || SOS_CALL_OPTIONS[0];
}

function getSosFallbackMessage(callKind, attackType, targetLabel) {
  if (normalizeSosCallKind(callKind) === "attack") {
    return `${attackType} lancé sur ${targetLabel}. Rejoignez l'attaque maintenant.`;
  }

  return `${attackType} en cours sur ${targetLabel}. Besoin de renforts immédiats.`;
}

const HIDDEN_PUBLIC_MEMBER_STATUSES = new Set(["banned", "left"]);

const COMMAND_ROLE_FALLBACK = Object.freeze({
  admin: {
    title: "Commandement",
    text: "Priorites de guilde, mise en ligne du site et arbitrages sensibles.",
  },
  officier: {
    title: "Operations",
    text: "Wars, events, presences et consignes de terrain.",
  },
  diplomate: {
    title: "Diplomatie",
    text: "Contacts royaume, alliances, NAP et coordination externe.",
  },
  banquier: {
    title: "Ressources",
    text: "Demandes, stocks et suivi des contributions.",
  },
});

const SITE_SECTION_MODULE_IDS = Object.freeze({
  roster: "multi_guilds",
  membership: "membership_requests",
  wars: "wars_events",
  bank: "bank",
  diplomacy: "diplomacy",
  forum: "forum",
  publicChat: "messages",
});

const MODULE_FORCED_SITE_SECTION_IDS = Object.freeze({
  membership: "membership_requests",
  wars: "wars_events",
  bank: "bank",
  diplomacy: "diplomacy",
  forum: "forum",
});

function getPublicVisibleSiteSections(siteDraft = {}, enabledModuleIds = []) {
  const enabledSet = new Set([...(enabledModuleIds || []), ...(siteDraft.enabledModules || [])]);
  const sections = { ...(siteDraft.sections || {}) };

  Object.entries(MODULE_FORCED_SITE_SECTION_IDS).forEach(([sectionKey, moduleId]) => {
    sections[sectionKey] = isGuildOpsModuleEnabled(moduleId, enabledSet);
  });

  return getVisibleSiteSections(sections);
}

function getSiteSectionIcon(sectionKey) {
  return guildOpsModuleById[SITE_SECTION_MODULE_IDS[sectionKey]]?.icon || LayoutDashboard;
}

function getPublicSiteSectionId(sectionKey) {
  return sectionKey === "publicChat" ? "public-chat" : `public-section-${sectionKey}`;
}

const publicSiteSectionRoutes = Object.freeze(
  Object.fromEntries(siteSectionMeta.map((section) => [section.key, slugify(section.navLabel)])),
);

function getPublicSiteSectionRoute(sectionKey) {
  return publicSiteSectionRoutes[sectionKey] || slugify(sectionKey);
}

function getPublicSiteRoutePath(slug, sectionKey = "") {
  const basePath = `/g/${slugify(slug)}`;
  const routeSegment = sectionKey ? getPublicSiteSectionRoute(sectionKey) : "";
  return routeSegment ? `${basePath}/${routeSegment}` : basePath;
}

function getPublicMemberSpacePath(slug) {
  return `/g/${slugify(slug)}/${PUBLIC_MEMBER_SPACE_ROUTE}`;
}

function getPublicSiteSectionFromRoute(routeSegment, visibleSections) {
  if (!routeSegment) return null;
  return visibleSections.find((section) => getPublicSiteSectionRoute(section.key) === routeSegment) || null;
}

const PUBLIC_OBJECTIVE_STATUS_LABELS = Object.freeze({
  open: "Ouvert",
  in_progress: "En cours",
  done: "Terminé",
});

function getHeroImageCssValue(heroImage) {
  const src = heroImage?.src;
  return src ? `url(${JSON.stringify(src)})` : undefined;
}

function getHeroImageStyle(heroImage) {
  const heroImageCssValue = getHeroImageCssValue(heroImage);
  return heroImageCssValue ? { "--site-hero-image": heroImageCssValue } : {};
}

function getMemberInviteHref(slugOrPath) {
  const value = String(slugOrPath || "").trim();
  if (!value) return "";
  return value.startsWith("/join/") ? value : buildMemberInvitePath(value);
}

function getMemberRequestHref(slugOrPath) {
  const value = String(slugOrPath || "").trim();
  if (!value) return "";
  return value.startsWith("/join/") ? value.split("?")[0] : buildMemberRequestPath(value);
}

function getAbsoluteMemberInviteUrl(slugOrPath) {
  const href = getMemberInviteHref(slugOrPath);
  if (!href) return "";
  if (typeof window === "undefined") return href;
  return `${window.location.origin}${href}`;
}

async function copyTextToClipboard(text) {
  if (!text) return false;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback below covers browsers that block the async clipboard API.
  }

  try {
    const previousFocus = document.activeElement;
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.inset = "-9999px auto auto -9999px";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    previousFocus?.focus?.();
    return copied;
  } catch {
    return false;
  }
}

function formatHeroImageSize(size = 0) {
  if (!size) return "Image importée";
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} Mo`;
  return `${Math.max(1, Math.round(size / 1024))} Ko`;
}

function readBlobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")));
    reader.addEventListener("error", () => reject(new Error("Lecture de l'image impossible.")));
    reader.readAsDataURL(blob);
  });
}

function loadLocalImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.addEventListener("load", () => {
      URL.revokeObjectURL(url);
      resolve(image);
    });
    image.addEventListener("error", () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image impossible à charger."));
    });
    image.src = url;
  });
}

function canvasToJpegBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }

        reject(new Error("Compression de l'image impossible."));
      },
      "image/jpeg",
      quality,
    );
  });
}

function drawHeroImage(image, maxSize) {
  const ratio = Math.min(1, maxSize / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
  const width = Math.max(1, Math.round((image.naturalWidth || image.width) * ratio));
  const height = Math.max(1, Math.round((image.naturalHeight || image.height) * ratio));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: false });

  if (!context) throw new Error("Préparation de l'image impossible.");

  canvas.width = width;
  canvas.height = height;
  context.fillStyle = "#061015";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  return canvas;
}

function drawPublicMemberAvatarImage(image, targetSize) {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const cropSize = Math.min(sourceWidth, sourceHeight);
  const sourceX = Math.max(0, Math.round((sourceWidth - cropSize) / 2));
  const sourceY = Math.max(0, Math.round((sourceHeight - cropSize) / 2));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: false });

  if (!context) throw new Error("Préparation de l'image impossible.");

  canvas.width = targetSize;
  canvas.height = targetSize;
  context.fillStyle = "#061015";
  context.fillRect(0, 0, targetSize, targetSize);
  context.drawImage(image, sourceX, sourceY, cropSize, cropSize, 0, 0, targetSize, targetSize);
  return canvas;
}

async function createHeroImageUpload(file) {
  if (!file) return null;

  if (!HERO_IMAGE_TYPES.has(file.type)) {
    throw new Error("Format accepté : JPG, PNG ou WebP.");
  }

  if (file.size > HERO_IMAGE_SOURCE_MAX_BYTES) {
    throw new Error("Image trop lourde : 6 Mo maximum.");
  }

  const image = await loadLocalImage(file);
  let bestBlob = null;

  for (const step of HERO_IMAGE_COMPRESSION_STEPS) {
    const canvas = drawHeroImage(image, step.maxSize);
    const blob = await canvasToJpegBlob(canvas, step.quality);
    bestBlob = blob;

    if (blob.size <= HERO_IMAGE_TARGET_BYTES) break;
  }

  const dataUrl = await readBlobAsDataUrl(bestBlob);

  if (dataUrl.length > HERO_IMAGE_DATA_URL_MAX_LENGTH) {
    throw new Error("Image encore trop lourde après optimisation.");
  }

  return {
    src: dataUrl,
    name: file.name,
    size: bestBlob.size,
  };
}

async function createPublicMemberAvatarUpload(file) {
  if (!file) return null;

  if (!HERO_IMAGE_TYPES.has(file.type)) {
    throw new Error("Format accepté : JPG, PNG ou WebP.");
  }

  if (file.size > PUBLIC_MEMBER_AVATAR_SOURCE_MAX_BYTES) {
    throw new Error("Image trop lourde : 4 Mo maximum.");
  }

  const image = await loadLocalImage(file);
  let bestBlob = null;

  for (const step of PUBLIC_MEMBER_AVATAR_COMPRESSION_STEPS) {
    const canvas = drawPublicMemberAvatarImage(image, step.size);
    const blob = await canvasToJpegBlob(canvas, step.quality);
    bestBlob = blob;

    if (blob.size <= 180 * 1024) break;
  }

  const dataUrl = await readBlobAsDataUrl(bestBlob);

  if (dataUrl.length > PUBLIC_MEMBER_AVATAR_DATA_URL_MAX_LENGTH) {
    throw new Error("Image encore trop lourde après optimisation.");
  }

  return {
    src: dataUrl,
    name: file.name,
    size: bestBlob.size,
  };
}

function normalizePublicMemberProfile(profile = {}) {
  const displayName = String(profile.displayName || profile.nickname || "").trim().slice(0, 32);
  const avatar = profile.avatar?.src
    ? {
        src: String(profile.avatar.src),
        name: String(profile.avatar.name || "Image de profil"),
        size: Number(profile.avatar.size || 0),
      }
    : null;

  return { avatar, displayName };
}

function getPublicMemberProfileStorageKey(slug) {
  return `${PUBLIC_MEMBER_PROFILE_STORAGE_PREFIX}${slugify(slug) || "guild"}`;
}

function loadPublicMemberProfile(slug) {
  if (typeof window === "undefined") return normalizePublicMemberProfile();

  try {
    return normalizePublicMemberProfile(JSON.parse(window.localStorage.getItem(getPublicMemberProfileStorageKey(slug)) || "{}"));
  } catch {
    return normalizePublicMemberProfile();
  }
}

function savePublicMemberProfile(slug, profile) {
  const normalized = normalizePublicMemberProfile(profile);

  if (typeof window !== "undefined") {
    window.localStorage.setItem(getPublicMemberProfileStorageKey(slug), JSON.stringify(normalized));
  }

  return normalized;
}

function getPublicMemberProfileInitials(name) {
  const words = String(name || "Membre").trim().split(/\s+/).filter(Boolean);
  return (words[0]?.[0] || "M") + (words[1]?.[0] || "");
}

function getPublicWarsData(siteDraft = {}, fallbackSummary = {}) {
  const snapshot = siteDraft.publicEvents || {};
  const snapshotEvents = Array.isArray(snapshot.events) ? snapshot.events : [];
  const fallbackEvents = Array.isArray(fallbackSummary.events) ? fallbackSummary.events : [];
  const nextEvent = fallbackSummary.nextEvent || fallbackEvents[0] || snapshot.nextEvent || snapshotEvents[0] || null;
  const weeklyObjectives =
    fallbackSummary.weeklyObjectives ||
    snapshot.weeklyObjectives || {
      total: 0,
      done: 0,
      completionRate: 0,
      objectives: [],
    };

  return {
    nextEvent,
    events: dedupePublicEvents([nextEvent, ...fallbackEvents, ...snapshotEvents]),
    weeklyObjectives: {
      ...weeklyObjectives,
      objectives: Array.isArray(weeklyObjectives.objectives) ? weeklyObjectives.objectives : [],
    },
  };
}

function dedupePublicEvents(events = []) {
  const seen = new Set();

  return events.filter((event) => {
    if (!event) return false;
    const key = event.id || `${formatEventTitle(event)}:${event.startsAt || event.time || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatPublicEventStatus(event) {
  if (event?.startsAt) return formatRelativeEventTime(event);
  if (event?.status === "live") return "En cours";
  if (event?.status === "ended") return "Terminé";
  return "À planifier";
}

function formatPublicEventRealm(event, siteDraft) {
  return event?.realm || siteDraft.realm || "Royaume à confirmer";
}

function getPublicForumData(publicForum = {}) {
  const categories = Array.isArray(publicForum.categories) ? publicForum.categories : [];
  const threads = Array.isArray(publicForum.threads) ? publicForum.threads : [];
  const latestThreads = Array.isArray(publicForum.latestThreads) && publicForum.latestThreads.length
    ? publicForum.latestThreads
    : threads;
  const locked = publicForum.locked || {};

  return {
    configured: Boolean(publicForum.configured || categories.length || threads.length),
    categories,
    latestThreads,
    locked: {
      privateCategoryCount: Number(locked.privateCategoryCount || locked.private_category_count || 0),
      privateThreadCount: Number(locked.privateThreadCount || locked.private_thread_count || 0),
      note: locked.note || "Les espaces membres, officiers et admins restent verrouilles.",
    },
  };
}

function navigatePublicSite(event, path, onNavigatePublicRoute) {
  const button = event.button ?? event.nativeEvent?.button ?? 0;

  if (
    event.defaultPrevented ||
    button !== 0 ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey
  ) {
    return;
  }

  event.preventDefault();
  navigatePublicSitePath(path, onNavigatePublicRoute);
}

function navigatePublicSitePath(path, onNavigatePublicRoute) {
  if (onNavigatePublicRoute) {
    onNavigatePublicRoute(path);
    return;
  }

  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function getPublicMemberName(member = {}) {
  return String(member.name || member.nickname || member.displayName || member.memberName || "").trim();
}

function normalizePublicIdentity(value) {
  return String(value || "").trim().toLowerCase();
}

function getPublicMemberIdentityValues(member = {}) {
  return [
    member.id,
    member.publicId,
    member.userId,
    member.user_id,
    member.accountId,
    member.account_id,
    member.user?.id,
  ]
    .filter(Boolean)
    .map((value) => String(value));
}

function isActivePublicMemberStatus(value) {
  const status = normalizePublicIdentity(value);
  return !["banned", "blocked", "refused", "rejected", "inactive"].includes(status);
}

function isCurrentUserListedAsPublicMember(currentUser = {}, members = []) {
  const userId = String(currentUser.id || currentUser.userId || "").trim();
  const localUserId = userId ? `local-${userId}` : "";
  const userEmail = normalizePublicIdentity(currentUser.email);
  const userDisplayName = normalizePublicIdentity(currentUser.displayName || currentUser.nickname);

  if (!userId && !userEmail && !userDisplayName) return false;

  return members.some((member) => {
    if (!isActivePublicMemberStatus(member.status)) return false;

    const memberIds = getPublicMemberIdentityValues(member);
    if (userId && memberIds.some((id) => id === userId || id === localUserId)) return true;

    const memberEmail = normalizePublicIdentity(member.email || member.user?.email);
    if (userEmail && memberEmail === userEmail) return true;

    const memberName = normalizePublicIdentity(getPublicMemberName(member));
    return Boolean(userDisplayName && memberName && memberName === userDisplayName);
  });
}

function isCurrentUserInPublicGuild(currentUser = {}, guilds = [], publicSlug = "", siteDraft = {}) {
  if (!currentUser.id && !currentUser.email && !currentUser.displayName) return false;

  const normalizedPublicSlug = slugify(publicSlug || siteDraft.slug || siteDraft.publicSlug || siteDraft.guildName);
  if (!normalizedPublicSlug) return false;

  return guilds.some((guild) => {
    const status = normalizePublicIdentity(guild.status || guild.membershipStatus);
    if (["banned", "blocked", "refused", "rejected"].includes(status)) return false;

    const guildSlugs = [
      guild.slug,
      guild.publicSlug,
      guild.public_slug,
      guild.guildSlug,
      guild.guild_slug,
      guild.siteSlug,
      guild.site_slug,
      guild.name,
    ]
      .filter(Boolean)
      .map((value) => slugify(value));

    return guildSlugs.includes(normalizedPublicSlug);
  });
}

function isCurrentPublicGuildMember({ currentUser = {}, guilds = [], members = [], publicSlug = "", siteDraft = {} } = {}) {
  return (
    isCurrentUserListedAsPublicMember(currentUser, members) ||
    isCurrentUserInPublicGuild(currentUser, guilds, publicSlug, siteDraft)
  );
}

function getPublicMemberRoles(member = {}) {
  const roleValues = [
    member.role,
    ...(Array.isArray(member.roleCodes) ? member.roleCodes : []),
    ...(Array.isArray(member.role_codes) ? member.role_codes : []),
    ...(Array.isArray(member.roles) ? member.roles : []),
  ];

  return roleValues.filter(Boolean);
}

function getPublicMemberStatusLabel(member = {}) {
  const status = String(member.status || member.presence || "").trim();
  if (!status) return "";

  return PUBLIC_MEMBER_STATUS_LABELS[status.toLowerCase()] || status;
}

function getPublicMemberPowerLabel(member = {}) {
  const rawPower = member.power || member.powerScore || member.power_score;
  if (rawPower === undefined || rawPower === null || rawPower === "") return "";

  const numericPower = Number(rawPower);
  if (!Number.isFinite(numericPower)) return String(rawPower);
  if (numericPower >= 1_000_000_000) return `${(numericPower / 1_000_000_000).toFixed(1)}B`;
  if (numericPower >= 1_000_000) return `${(numericPower / 1_000_000).toFixed(1)}M`;
  if (numericPower >= 1_000) return `${Math.round(numericPower / 1_000)}K`;

  return String(numericPower);
}

function isPublicMemberVisible(member = {}) {
  const status = String(member.status || "").trim().toLowerCase();

  return (
    member.visible !== false &&
    member.isVisible !== false &&
    member.public !== false &&
    member.showOnPublicSite !== false &&
    !HIDDEN_PUBLIC_MEMBER_STATUSES.has(status)
  );
}

function normalizePublicTeamMembers(members = []) {
  const seen = new Set();

  return members
    .filter(isPublicMemberVisible)
    .map((member, index) => {
      const name = getPublicMemberName(member);
      if (!name) return null;

      const roles = getPublicMemberRoles(member);
      const role = roles[0] || "Membre";
      const id = String(member.publicId || member.id || member.nickname || name || index);
      const normalizedKey = id.toLowerCase();

      if (seen.has(normalizedKey)) return null;
      seen.add(normalizedKey);

      return {
        id,
        language: String(member.language || "").trim(),
        name,
        powerLabel: getPublicMemberPowerLabel(member),
        role,
        roleLabel: getRoleLabel(role),
        statusLabel: getPublicMemberStatusLabel(member),
      };
    })
    .filter(Boolean);
}

function getUniqueSorted(values = []) {
  return [...new Set(values.filter(Boolean))].sort((first, second) => first.localeCompare(second, "fr"));
}

export function PublicGuildRoute({
  acknowledgeSos,
  createEvent,
  creatingEvent = false,
  currentUser,
  enabledModuleIds,
  eventCreateError = "",
  events = [],
  fallbackSite,
  memberGuilds = [],
  members = [],
  moduleManagementProps = {},
  onBackToBuilder,
  onNavigatePublicRoute,
  publicDiplomacy,
  publicForum,
  routeSegment = "",
  sendSos,
  setSosForm,
  slug,
  sosAlerts,
  sosError,
  sosForm,
  sosRealtimeStatus,
  unreadMessages = 0,
  warSummary,
}) {
  const fallbackSiteSlug = slugify(fallbackSite?.slug || fallbackSite?.publicSlug || fallbackSite?.guildName || "");
  const fallbackMembers = !isApiConfigured() && fallbackSiteSlug === slug ? members : [];
  const fallbackPublicDiplomacy = !isApiConfigured() && fallbackSiteSlug === slug ? publicDiplomacy : null;
  const fallbackPublicForum = !isApiConfigured() && fallbackSiteSlug === slug ? publicForum : null;
  const [state, setState] = useState(() => {
    const localSite = loadPublishedSite(slug);
    return {
      error: "",
      site: localSite || (fallbackSite?.slug === slug ? fallbackSite : null),
      status: localSite || fallbackSite?.slug === slug ? "ready" : "loading",
    };
  });

  useEffect(() => {
    const controller = new AbortController();
    const localSite = loadPublishedSite(slug);

    if (localSite) {
      setState({ error: "", site: localSite, status: "ready" });
    } else if (!isApiConfigured()) {
      setState({ error: "", site: null, status: "missing" });
    } else {
      setState((current) => ({ ...current, status: "loading" }));
    }

    if (isApiConfigured()) {
      guildOpsApi
        .getPublicGuild(slug, { signal: controller.signal })
        .then((payload) => {
          const sitePayload = payload?.site || payload?.guild || payload;
          const publicMembers = payload?.members || sitePayload?.members || [];
          const publishedSite = savePublishedSite({ ...sitePayload, members: publicMembers });
          setState({ error: "", site: publishedSite, status: "ready" });
        })
        .catch((error) => {
          if (controller.signal.aborted) return;
          setState({
            error: error?.message || "Site de guilde introuvable.",
            site: localSite,
            status: localSite ? "ready" : "missing",
          });
        });
    }

    return () => controller.abort();
  }, [slug]);

  if (state.status === "loading") {
    return (
      <main className="public-site-shell public-empty">
        <Shield size={40} />
        <h1>Chargement de la guilde...</h1>
      </main>
    );
  }

  if (!state.site) {
    return (
      <main className="public-site-shell public-empty">
        <ShieldAlert size={42} />
        <h1>Site de guilde introuvable</h1>
        <p>{state.error || "Publie d'abord le site pour créer cette page de guilde."}</p>
        <div className="public-missing-actions" aria-label="Accès disponibles">
          <button className="is-primary" type="button" onClick={onBackToBuilder}>
            <LayoutDashboard size={17} aria-hidden="true" />
            Accès builder
          </button>
          <button
            className="is-secondary"
            type="button"
            onClick={() => navigatePublicSitePath("/guildes", onNavigatePublicRoute)}
          >
            <Globe2 size={17} aria-hidden="true" />
            Accès galerie
          </button>
        </div>
      </main>
    );
  }

  return (
    <PublicGuildSite
      acknowledgeSos={acknowledgeSos}
      createEvent={createEvent}
      creatingEvent={creatingEvent}
      currentUser={currentUser}
      enabledModuleIds={enabledModuleIds}
      eventCreateError={eventCreateError}
      events={events}
      fallbackMembers={fallbackMembers}
      fallbackPublicDiplomacy={fallbackPublicDiplomacy}
      fallbackPublicForum={fallbackPublicForum}
      memberGuilds={memberGuilds}
      moduleManagementProps={moduleManagementProps}
      onNavigatePublicRoute={onNavigatePublicRoute}
      onBackToBuilder={onBackToBuilder}
      routeSegment={routeSegment}
      sendSos={sendSos}
      setSosForm={setSosForm}
      site={state.site}
      slug={slug}
      sosAlerts={sosAlerts}
      sosError={sosError}
      sosForm={sosForm}
      sosRealtimeStatus={sosRealtimeStatus}
      unreadMessages={unreadMessages}
      warSummary={warSummary}
    />
  );
}

export function PublicGuildSite({
  acknowledgeSos,
  createEvent,
  creatingEvent = false,
  currentUser,
  enabledModuleIds = [],
  eventCreateError = "",
  events = [],
  fallbackMembers = [],
  fallbackPublicDiplomacy,
  fallbackPublicForum,
  memberGuilds = [],
  moduleManagementProps = {},
  onBackToBuilder,
  onNavigatePublicRoute,
  routeSegment = "",
  sendSos,
  setSosForm,
  site,
  slug,
  sosAlerts = [],
  sosError = "",
  sosForm = {},
  sosRealtimeStatus = "API requise",
  unreadMessages = 0,
  warSummary,
}) {
  const siteDraft = createGuildSiteDraft({}, site);
  const color = getColorOption(siteDraft.colors);
  const theme = getThemeOption(siteDraft.theme);
  const design = getDesignOption(siteDraft.design);
  const typography = getTypographyOption(siteDraft.typography);
  const publicSlug = slugify(slug || siteDraft.slug || siteDraft.guildName);
  const publicEnabledModuleIds = [...new Set([...(enabledModuleIds || []), ...(siteDraft.enabledModules || [])])];
  const visibleSections = getPublicVisibleSiteSections(siteDraft, publicEnabledModuleIds);
  const visibleContentSections = visibleSections.filter((section) => section.key !== "publicChat");
  const showPublicSosPanel = isGuildOpsModuleEnabled("sos_attack", publicEnabledModuleIds);
  const sosPath = getPublicSiteRoutePath(publicSlug, "sos");
  const isSosRoute = routeSegment === "sos";
  const isMemberSpaceRoute = routeSegment === PUBLIC_MEMBER_SPACE_ROUTE;
  const activeSection = isMemberSpaceRoute || isSosRoute ? null : getPublicSiteSectionFromRoute(routeSegment, visibleSections);
  const homePath = getPublicSiteRoutePath(publicSlug);
  const galleryPath = "/guildes";
  const chatPath = getPublicSiteRoutePath(publicSlug, "publicChat");
  const memberSpacePath = getPublicMemberSpacePath(publicSlug);
  const appMessagesPath = "/app/messages";
  const memberRequestUrl = getMemberRequestHref(publicSlug);
  const rawPublicMembers = Array.isArray(site?.members) && site.members.length ? site.members : fallbackMembers;
  const publicMembers = useMemo(() => normalizePublicTeamMembers(rawPublicMembers), [rawPublicMembers]);
  const isCurrentMember = isCurrentPublicGuildMember({
    currentUser,
    guilds: memberGuilds,
    members: rawPublicMembers,
    publicSlug,
    siteDraft,
  });
  const canUsePublicSos = showPublicSosPanel && isCurrentMember;
  const unreadMessageCount = Math.max(0, Number(unreadMessages) || 0);
  const publicDiplomacy = site?.publicDiplomacy || site?.public_diplomacy || fallbackPublicDiplomacy;
  const publicForum = site?.publicForum || site?.public_forum || siteDraft.publicForum || fallbackPublicForum;
  const pageStyle = {
    "--site-accent": color.accent,
    "--site-highlight": color.highlight,
    "--site-contrast": color.contrast,
    "--site-font": typography.fontFamily,
    ...getHeroImageStyle(siteDraft.heroImage),
  };

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [publicSlug, routeSegment]);

  return (
    <main className={`public-site-shell theme-${theme.overlay} design-${design.tone} ${routeSegment ? "is-route" : "is-home"}`} style={pageStyle}>
      <header className="public-site-nav">
        <div className="preview-logo">{siteDraft.guildName.slice(0, 1).toUpperCase() || "G"}</div>
        <strong>
          {siteDraft.guildName}
          <small>
            {siteDraft.game} · {siteDraft.realm}
          </small>
        </strong>
        <nav>
          <a
            aria-current={!routeSegment ? "page" : undefined}
            className={!routeSegment ? "is-active" : ""}
            href={homePath}
            onClick={(event) => navigatePublicSite(event, homePath, onNavigatePublicRoute)}
          >
            Accueil
          </a>
          {visibleContentSections.map((section) => {
            const sectionPath = getPublicSiteRoutePath(publicSlug, section.key);
            const isActive = activeSection?.key === section.key;
            const SectionIcon = getSiteSectionIcon(section.key);

            return (
            <a
              aria-current={isActive ? "page" : undefined}
              className={isActive ? "is-active" : ""}
              href={sectionPath}
              key={section.key}
              onClick={(event) => navigatePublicSite(event, sectionPath, onNavigatePublicRoute)}
            >
              <SectionIcon size={15} aria-hidden="true" />
              {section.navLabel}
            </a>
            );
          })}
        </nav>
        <div className="public-site-actions">
          {canUsePublicSos ? (
            <a
              className="public-site-sos-action"
              href={sosPath}
              onClick={(event) => navigatePublicSite(event, sosPath, onNavigatePublicRoute)}
            >
              <AlertTriangle size={16} aria-hidden="true" />
              SOS
            </a>
          ) : null}
          {isCurrentMember ? (
            <a
              aria-label={`Messagerie membre, ${unreadMessageCount} message${unreadMessageCount > 1 ? "s" : ""} non lu${unreadMessageCount > 1 ? "s" : ""}`}
              className="public-site-message-action"
              href={appMessagesPath}
              onClick={(event) => navigatePublicSite(event, appMessagesPath, onNavigatePublicRoute)}
            >
              <Mail size={16} aria-hidden="true" />
              <span className="public-site-message-label">Messagerie</span>
              {unreadMessageCount ? <i>{unreadMessageCount}</i> : null}
            </a>
          ) : null}
          <a
            className="public-site-gallery-action"
            href={galleryPath}
            onClick={(event) => navigatePublicSite(event, galleryPath, onNavigatePublicRoute)}
          >
            <Globe2 size={16} aria-hidden="true" />
            Galerie
          </a>
          {!isCurrentMember ? (
            <a
              className="public-site-invite-action"
              href={memberRequestUrl}
              onClick={(event) => navigatePublicSite(event, memberRequestUrl, onNavigatePublicRoute)}
            >
              Devenir membre
            </a>
          ) : null}
          <a href={memberSpacePath} onClick={(event) => navigatePublicSite(event, memberSpacePath, onNavigatePublicRoute)}>
            Espace membre
          </a>
        </div>
      </header>
      {!routeSegment ? (
        <PublicSiteHome
          acknowledgeSos={acknowledgeSos}
          appMessagesPath={appMessagesPath}
          currentUser={currentUser}
          isCurrentMember={isCurrentMember}
          members={publicMembers}
          moduleManagementProps={moduleManagementProps}
          onNavigatePublicRoute={onNavigatePublicRoute}
          publicSlug={publicSlug}
          sendSos={sendSos}
          setSosForm={setSosForm}
          showPublicSosPanel={canUsePublicSos}
          siteDraft={siteDraft}
          sosAlerts={sosAlerts}
          sosError={sosError}
          sosForm={sosForm}
          sosRealtimeStatus={sosRealtimeStatus}
          theme={theme}
          unreadMessages={unreadMessageCount}
          visibleSections={visibleContentSections}
        />
      ) : isMemberSpaceRoute ? (
        <PublicMemberSpaceModule
          homePath={homePath}
          onNavigatePublicRoute={onNavigatePublicRoute}
          publicSlug={publicSlug}
          siteDraft={siteDraft}
        />
      ) : isSosRoute && canUsePublicSos ? (
        <PublicSosModule
          acknowledgeSos={acknowledgeSos}
          currentUser={currentUser}
          homePath={homePath}
          onNavigatePublicRoute={onNavigatePublicRoute}
          sendSos={sendSos}
          setSosForm={setSosForm}
          showBackLink
          sosAlerts={sosAlerts}
          sosError={sosError}
          sosForm={sosForm}
          sosRealtimeStatus={sosRealtimeStatus}
        />
      ) : activeSection ? (
        <PublicSiteModuleRoute
          activeSection={activeSection}
          createEvent={createEvent}
          creatingEvent={creatingEvent}
          currentUser={currentUser}
          eventCreateError={eventCreateError}
          events={events}
          homePath={homePath}
          isCurrentMember={isCurrentMember}
          members={publicMembers}
          onNavigatePublicRoute={onNavigatePublicRoute}
          publicDiplomacy={publicDiplomacy}
          publicForum={publicForum}
          publicSlug={publicSlug}
          siteDraft={siteDraft}
          warSummary={warSummary}
        />
      ) : (
        <PublicSiteMissingModule homePath={homePath} onNavigatePublicRoute={onNavigatePublicRoute} />
      )}
    </main>
  );
}

function PublicSiteHome({
  acknowledgeSos,
  appMessagesPath = "/app/messages",
  currentUser,
  isCurrentMember = false,
  members = [],
  onNavigatePublicRoute,
  publicSlug,
  sendSos,
  setSosForm,
  showPublicSosPanel = false,
  siteDraft,
  sosAlerts = [],
  sosError = "",
  sosForm = {},
  sosRealtimeStatus = "API requise",
  theme,
  unreadMessages = 0,
  visibleSections
}) {
  const memberSpacePath = getPublicMemberSpacePath(publicSlug);
  const teamPath = getPublicSiteRoutePath(publicSlug, "roster");
  const memberRequestUrl = getMemberRequestHref(publicSlug);
  const publicWarSummary = getPublicWarsData(siteDraft);
  const TeamIcon = getSiteSectionIcon("roster");

  return (
    <>
      <section className="public-site-hero" id="public-home" tabIndex={-1}>
        <div className="hero-copy">
          <span className="theme-kicker">{theme.label}</span>
          <h1>{siteDraft.guildName}</h1>
          <h2>{siteDraft.tagline}</h2>
          <p>{siteDraft.objective}</p>
          <em>
            {siteDraft.game} · {siteDraft.realm} · {siteDraft.objectiveTag}
          </em>
          <div className="preview-actions">
            {isCurrentMember ? (
              <a
                className="public-site-message-action public-site-hero-message-action"
                href={appMessagesPath}
                onClick={(event) => navigatePublicSite(event, appMessagesPath, onNavigatePublicRoute)}
              >
                Messagerie
                <Mail size={17} />
                {unreadMessages ? <i>{unreadMessages}</i> : null}
              </a>
            ) : (
              <a href={memberRequestUrl} onClick={(event) => navigatePublicSite(event, memberRequestUrl, onNavigatePublicRoute)}>
                Devenir membre
                <UserPlus size={17} />
              </a>
            )}
            {siteDraft.sections.roster ? (
              <a href={teamPath} onClick={(event) => navigatePublicSite(event, teamPath, onNavigatePublicRoute)}>
                Voir l'équipe
                <TeamIcon size={17} />
              </a>
            ) : null}
            {siteDraft.sections.publicChat ? (
              <a href={memberSpacePath} onClick={(event) => navigatePublicSite(event, memberSpacePath, onNavigatePublicRoute)}>
                Espace membre
                <MessageSquare size={17} />
              </a>
            ) : null}
          </div>
        </div>
      </section>
      {showPublicSosPanel ? (
        <PublicSosModule
          acknowledgeSos={acknowledgeSos}
          currentUser={currentUser}
          sendSos={sendSos}
          setSosForm={setSosForm}
          sosAlerts={sosAlerts}
          sosError={sosError}
          sosForm={sosForm}
          sosRealtimeStatus={sosRealtimeStatus}
        />
      ) : null}
      <section className="preview-content-grid public-content-grid">
        {visibleSections.map((section) => (
          <PreviewSectionCard
            key={section.key}
            members={members}
            onNavigatePublicRoute={onNavigatePublicRoute}
            publicSlug={publicSlug}
            section={section}
            sectionId={section.key === "publicChat" ? "" : getPublicSiteSectionId(section.key)}
            siteDraft={siteDraft}
            warSummary={publicWarSummary}
          />
        ))}
      </section>
    </>
  );
}

function PublicSosModule({
  acknowledgeSos,
  currentUser,
  homePath = "",
  onNavigatePublicRoute,
  sendSos,
  setSosForm,
  showBackLink = false,
  sosAlerts = [],
  sosError = "",
  sosForm = {},
  sosRealtimeStatus = "API requise",
}) {
  return (
    <section className={`public-sos-page ${showBackLink ? "is-route" : "is-home"}`} id="public-sos" tabIndex={-1}>
      {showBackLink ? (
        <div className="public-sos-toolbar">
          <a href={homePath} onClick={(event) => navigatePublicSite(event, homePath, onNavigatePublicRoute)}>
            Retour accueil
          </a>
        </div>
      ) : null}
      <SosPanel
        acknowledgeSos={acknowledgeSos}
        currentUser={currentUser}
        sosAlerts={sosAlerts}
        sosError={sosError}
        sosForm={sosForm}
        sosRealtimeStatus={sosRealtimeStatus}
        setSosForm={setSosForm}
        sendSos={sendSos}
      />
    </section>
  );
}

function PublicSiteModuleRoute({
  activeSection,
  createEvent,
  creatingEvent = false,
  currentUser,
  eventCreateError = "",
  events = [],
  homePath,
  isCurrentMember = false,
  members = [],
  moduleManagementProps = {},
  onNavigatePublicRoute,
  publicDiplomacy,
  publicForum,
  publicSlug,
  siteDraft,
  warSummary,
}) {
  const chatPath = getPublicSiteRoutePath(publicSlug, "publicChat");
  const memberSpacePath = getPublicMemberSpacePath(publicSlug);

  if (activeSection.key === "roster") {
    return (
      <PublicTeamPage
        chatPath={chatPath}
        homePath={homePath}
        memberSpacePath={memberSpacePath}
        members={members}
        onNavigatePublicRoute={onNavigatePublicRoute}
        siteDraft={siteDraft}
      />
    );
  }

  if (activeSection.key === "wars") {
    return (
      <PublicWarsModule
        createEvent={createEvent}
        creatingEvent={creatingEvent}
        currentUser={currentUser}
        eventCreateError={eventCreateError}
        events={events}
        isCurrentMember={isCurrentMember}
        onNavigatePublicRoute={onNavigatePublicRoute}
        publicSlug={publicSlug}
        siteDraft={siteDraft}
        warSummary={warSummary}
      />
    );
  }

  if (activeSection.key === "membership") {
    return (
      <PublicMembershipModule
        currentUser={currentUser}
        homePath={homePath}
        isCurrentMember={isCurrentMember}
        membershipProps={moduleManagementProps.membership}
        onNavigatePublicRoute={onNavigatePublicRoute}
        publicSlug={publicSlug}
        siteDraft={siteDraft}
      />
    );
  }

  if (activeSection.key === "bank") {
    return (
      <PublicBankRoute
        bankProps={moduleManagementProps.bank}
        currentUser={currentUser}
        isCurrentMember={isCurrentMember}
        onNavigatePublicRoute={onNavigatePublicRoute}
        publicSlug={publicSlug}
        siteDraft={siteDraft}
      />
    );
  }

  if (activeSection.key === "diplomacy") {
    return (
      <PublicDiplomacyRoute
        currentUser={currentUser}
        diplomacyProps={moduleManagementProps.diplomacy}
        isCurrentMember={isCurrentMember}
        onNavigatePublicRoute={onNavigatePublicRoute}
        publicDiplomacy={publicDiplomacy}
        publicSlug={publicSlug}
        siteDraft={siteDraft}
      />
    );
  }

  if (activeSection.key === "forum") {
    return (
      <PublicForumRoute
        currentUser={currentUser}
        forumProps={moduleManagementProps.forum}
        homePath={homePath}
        isCurrentMember={isCurrentMember}
        memberSpacePath={memberSpacePath}
        onNavigatePublicRoute={onNavigatePublicRoute}
        publicForum={publicForum}
        publicSlug={publicSlug}
        siteDraft={siteDraft}
      />
    );
  }

  if (activeSection.key === "publicChat") {
    return (
      <PublicChatModule
        homePath={homePath}
        onNavigatePublicRoute={onNavigatePublicRoute}
        siteDraft={siteDraft}
      />
    );
  }

  return (
    <section className="preview-content-grid public-content-grid public-module-grid">
      <PreviewSectionCard
        section={activeSection}
        sectionId={getPublicSiteSectionId(activeSection.key)}
        siteDraft={siteDraft}
      />
    </section>
  );
}

function PublicWarsModule({
  createEvent,
  creatingEvent = false,
  currentUser,
  eventCreateError = "",
  events = [],
  isCurrentMember = false,
  onNavigatePublicRoute,
  publicSlug,
  siteDraft,
  warSummary,
}) {
  const canManageEvents = isCurrentMember && can(currentUser, "manage_events");
  const wars = getPublicWarsData(siteDraft, { ...(warSummary || {}), events });
  const nextEvent = wars.nextEvent;
  const upcomingEvents = wars.events;
  const weeklyObjectives = wars.weeklyObjectives;
  const objectiveTotal = Number(weeklyObjectives.total || weeklyObjectives.objectives.length || 0);
  const objectiveDone = Number(weeklyObjectives.done || 0);
  const objectiveProgress = Math.round((weeklyObjectives.completionRate || (objectiveTotal ? objectiveDone / objectiveTotal : 0)) * 100);
  const hasPublicData = Boolean(nextEvent || upcomingEvents.length || objectiveTotal);
  const memberSpacePath = getPublicMemberSpacePath(publicSlug);
  const managerPanel = canManageEvents ? (
    <div className="public-wars-manager">
      <EventComposer
        creating={creatingEvent}
        currentUser={currentUser}
        error={eventCreateError}
        onCreate={createEvent}
      />
    </div>
  ) : null;

  if (!hasPublicData) {
    return (
      <section className="public-wars-page" id={getPublicSiteSectionId("wars")} tabIndex={-1}>
        {managerPanel}
        <article className="public-empty public-route-empty public-wars-empty">
          <CalendarDays size={42} />
          <h1>Aucun war annoncé</h1>
          <p>Cette guilde n'a pas encore publié d'event ou d'objectif hebdo.</p>
          {siteDraft.sections.publicChat ? (
            <a href={memberSpacePath} onClick={(event) => navigatePublicSite(event, memberSpacePath, onNavigatePublicRoute)}>
              Espace membre
            </a>
          ) : null}
        </article>
      </section>
    );
  }

  return (
    <section className="public-wars-page" id={getPublicSiteSectionId("wars")} tabIndex={-1}>
      {managerPanel}
      <article className="public-wars-feature">
        <header>
          <div>
            <strong>Wars & events</strong>
            <h1>Prochain événement important</h1>
          </div>
          <em>{nextEvent ? formatPublicEventStatus(nextEvent) : "À planifier"}</em>
        </header>
        {nextEvent ? (
          <div className="next-war public-wars-next">
            <Swords size={34} />
            <span>
              {formatEventTitle(nextEvent) || "Event"}
              <small>{formatEventWhen(nextEvent) || nextEvent.time || "Horaire à confirmer"}</small>
            </span>
            <dl>
              <div>
                <dt>Statut</dt>
                <dd>{formatPublicEventStatus(nextEvent)}</dd>
              </div>
              <div>
                <dt>Royaume</dt>
                <dd>{formatPublicEventRealm(nextEvent, siteDraft)}</dd>
              </div>
            </dl>
          </div>
        ) : (
          <p className="preview-card-text">Horaires à confirmer.</p>
        )}
        {siteDraft.sections.publicChat ? (
          <div className="preview-actions">
            <a href={memberSpacePath} onClick={(event) => navigatePublicSite(event, memberSpacePath, onNavigatePublicRoute)}>
              Espace membre
              <MessageSquare size={17} />
            </a>
          </div>
        ) : null}
      </article>

      <div className="public-wars-layout">
        <article className="public-wars-panel">
          <header>
            <strong>Prochains events</strong>
            <em>{upcomingEvents.length ? `${upcomingEvents.length} à venir` : "Aucun"}</em>
          </header>
          {upcomingEvents.length ? (
            <div className="public-event-list">
              {upcomingEvents.map((event) => (
                <div className="public-event-row" key={event.id || `${formatEventTitle(event)}-${event.startsAt || event.time}`}>
                  <CalendarDays size={20} />
                  <span>
                    <strong>{formatEventTitle(event) || "Event"}</strong>
                    <small>{formatEventWhen(event) || event.time || "Horaire à confirmer"}</small>
                  </span>
                  <em>{formatPublicEventStatus(event)}</em>
                  <small>{formatPublicEventRealm(event, siteDraft)}</small>
                </div>
              ))}
            </div>
          ) : (
            <p className="preview-card-text">Aucun event n'est planifié pour le moment.</p>
          )}
        </article>

        <article className="public-wars-panel">
          <header>
            <strong>Objectifs hebdo</strong>
            <em>{objectiveTotal ? `${objectiveDone}/${objectiveTotal}` : "Non publié"}</em>
          </header>
          {objectiveTotal ? (
            <>
              <div className="weekly-goal public-weekly-goal">
                <Trophy size={22} />
                <span>
                  Progression
                  <small>{objectiveProgress}% complété</small>
                </span>
                <i style={{ "--goal-progress": `${objectiveProgress}%` }} />
              </div>
              {weeklyObjectives.objectives.length ? (
                <div className="public-objective-list">
                  {weeklyObjectives.objectives.map((objective) => (
                    <p key={objective.id || objective.title}>
                      <strong>{objective.title}</strong>
                      <small>
                        {PUBLIC_OBJECTIVE_STATUS_LABELS[objective.status] || objective.status || "Ouvert"}
                        {objective.eventTitle ? ` · ${objective.eventTitle}` : ""}
                      </small>
                    </p>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <p className="preview-card-text">Aucun objectif hebdo pour le moment.</p>
          )}
        </article>
      </div>
    </section>
  );
}

function PublicModuleManager({ children, icon: Icon = Shield, meta, title }) {
  return (
    <section className="public-module-manager">
      <header className="public-module-manager-header">
        <span>
          <Icon size={18} aria-hidden="true" />
          <strong>{title}</strong>
        </span>
        {meta ? <em>{meta}</em> : null}
      </header>
      {children}
    </section>
  );
}

function PublicMembershipModule({
  currentUser,
  homePath,
  isCurrentMember = false,
  membershipProps = {},
  onNavigatePublicRoute,
  publicSlug,
  siteDraft,
}) {
  const canManageMembership = isCurrentMember && can(currentUser, "approve_members");
  const memberRequestUrl = getMemberRequestHref(publicSlug || siteDraft.slug || siteDraft.guildName);
  const memberSpacePath = getPublicMemberSpacePath(publicSlug || siteDraft.slug || siteDraft.guildName);
  const membershipManager = canManageMembership ? (
    <PublicModuleManager icon={UserPlus} title="Gestion des adhésions" meta="Membres autorisés">
      <MembershipRequestsView
        {...membershipProps}
        currentUser={currentUser}
        selectedGuild={membershipProps.selectedGuild || { name: siteDraft.guildName, game: siteDraft.game, realm: siteDraft.realm }}
        siteDraft={siteDraft}
      />
    </PublicModuleManager>
  ) : null;

  return (
    <section className="public-membership-page" id={getPublicSiteSectionId("membership")} tabIndex={-1}>
      {membershipManager}
      <div className="public-membership-hero">
        <span className="theme-kicker">Adhésions</span>
        <h1>Accès membres</h1>
        <p>
          {siteDraft.guildName} centralise ici les demandes d'accès et les liens utiles. Les validations restent réservées
          aux membres autorisés.
        </p>
        <div className="public-membership-actions">
          <a href={homePath} onClick={(event) => navigatePublicSite(event, homePath, onNavigatePublicRoute)}>
            Retour accueil
          </a>
          {isCurrentMember ? (
            <a href={memberSpacePath} onClick={(event) => navigatePublicSite(event, memberSpacePath, onNavigatePublicRoute)}>
              Espace membre
            </a>
          ) : (
            <a href={memberRequestUrl} onClick={(event) => navigatePublicSite(event, memberRequestUrl, onNavigatePublicRoute)}>
              Devenir membre
            </a>
          )}
        </div>
      </div>
      <div className="public-membership-result">
        <article>
          <UserPlus size={24} aria-hidden="true" />
          <span>
            <strong>{isCurrentMember ? "Accès membre actif" : "Demande d'accès"}</strong>
            <small>
              {isCurrentMember
                ? "Votre espace membre reste disponible depuis ce site."
                : "Les nouveaux joueurs passent par une demande avant activation."}
            </small>
          </span>
        </article>
        <article>
          <Shield size={24} aria-hidden="true" />
          <span>
            <strong>Validation contrôlée</strong>
            <small>Les demandes, refus et blocages ne sont visibles que par les rôles autorisés.</small>
          </span>
        </article>
      </div>
    </section>
  );
}

function PublicBankRoute({ bankProps = {}, currentUser, isCurrentMember = false, onNavigatePublicRoute, publicSlug, siteDraft }) {
  const canManageBank = isCurrentMember && can(currentUser, "manage_bank");
  const safeBankProps = {
    addBankMovement: () => {},
    bankCommand: "!banque",
    bankError: "",
    bankMovements: [],
    bankRequests: [],
    bankStock: [],
    createBankRequest: () => {},
    setBankCommand: () => {},
    updateBankRequestStatus: () => {},
    ...bankProps,
    currentUser,
  };

  return (
    <>
      {canManageBank ? (
        <PublicModuleManager icon={Banknote} title="Gestion banque" meta="Membres autorisés">
          <BankView {...safeBankProps} />
        </PublicModuleManager>
      ) : null}
      <PublicBankModule onNavigatePublicRoute={onNavigatePublicRoute} publicSlug={publicSlug} siteDraft={siteDraft} />
    </>
  );
}

function PublicDiplomacyRoute({
  currentUser,
  diplomacyProps = {},
  isCurrentMember = false,
  onNavigatePublicRoute,
  publicDiplomacy,
  publicSlug,
  siteDraft,
}) {
  const canManageDiplomacy = isCurrentMember && can(currentUser, "manage_diplomacy");
  const safeDiplomacyProps = {
    diplomacyAudit: [],
    diplomacyCoordinates: [],
    diplomacyError: "",
    diplomacyNapAgreements: [],
    diplomacyRelations: [],
    saveDiplomacyCoordinate: () => {},
    saveDiplomacyRelation: () => {},
    saveNapAgreement: () => {},
    ...diplomacyProps,
    currentUser,
  };

  return (
    <>
      {canManageDiplomacy ? (
        <PublicModuleManager icon={Handshake} title="Gestion diplomatie" meta="Membres autorisés">
          <DiplomacyView {...safeDiplomacyProps} />
        </PublicModuleManager>
      ) : null}
      <PublicDiplomacyModule
        onNavigatePublicRoute={onNavigatePublicRoute}
        publicDiplomacy={publicDiplomacy}
        publicSlug={publicSlug}
        siteDraft={siteDraft}
      />
    </>
  );
}

function PublicForumRoute({
  currentUser,
  forumProps = {},
  homePath,
  isCurrentMember = false,
  memberSpacePath,
  onNavigatePublicRoute,
  publicForum,
  publicSlug,
  siteDraft,
}) {
  const canManageForum = isCurrentMember && (forumProps.forumCanManage || can(currentUser, "moderate_forum"));
  const safeForumProps = {
    activeForumCategoryId: "",
    activeForumThread: null,
    forumCategories: [],
    forumCategoryDraft: { description: "", name: "", visibility: "members" },
    forumCounters: {},
    forumEditingPostId: "",
    forumError: "",
    forumLoading: false,
    forumPostPagination: {},
    forumPosts: [],
    forumReplyDraft: "",
    forumRoles: [],
    forumThreadDraft: { body: "", categoryId: "", title: "" },
    forumThreadPagination: {},
    forumThreads: [],
    onCreateForumThread: () => {},
    onDeleteForumPost: () => {},
    onEditForumPost: () => {},
    onSaveForumCategory: () => {},
    onSaveForumCategoryPermissions: () => {},
    onSelectForumCategory: () => {},
    onSelectForumThread: () => {},
    onSendForumReply: () => {},
    onUpdateForumThreadFlags: () => {},
    setForumCategoryDraft: () => {},
    setForumReplyDraft: () => {},
    setForumThreadDraft: () => {},
    ...forumProps,
    forumCanManage: canManageForum,
  };

  return (
    <>
      {canManageForum ? (
        <PublicModuleManager icon={MessageSquare} title="Gestion forum" meta="Membres autorisés">
          <ForumView {...safeForumProps} />
        </PublicModuleManager>
      ) : null}
      <PublicForumModule
        homePath={homePath}
        memberSpacePath={memberSpacePath}
        onNavigatePublicRoute={onNavigatePublicRoute}
        publicForum={publicForum}
        publicSlug={publicSlug}
        siteDraft={siteDraft}
      />
    </>
  );
}

function PublicChatModule({ homePath, onNavigatePublicRoute, siteDraft }) {
  return (
    <section className="public-chat-page" tabIndex={-1}>
      <div className="public-chat-hero">
        <div>
          <span className="theme-kicker">Chat invités</span>
          <h1>Chat invités</h1>
          <p>
            {siteDraft.guildName} · {siteDraft.game} · {siteDraft.realm}
          </p>
        </div>
        <div className="public-chat-actions">
          <a href={homePath} onClick={(event) => navigatePublicSite(event, homePath, onNavigatePublicRoute)}>
            Retour accueil
          </a>
        </div>
      </div>
      <PublicSiteGuestChat siteDraft={siteDraft} />
    </section>
  );
}

function PublicTeamPage({ homePath, memberSpacePath, members = [], onNavigatePublicRoute, siteDraft }) {
  const publicSlug = slugify(siteDraft.slug || siteDraft.publicSlug || siteDraft.guildName);
  const [memberQuery, setMemberQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [memberMessage, setMemberMessage] = useState("");
  const [dispatches, setDispatches] = useState(() => loadMemberRelayDispatches(publicSlug));
  const roleOptions = useMemo(() => getUniqueSorted(members.map((member) => member.roleLabel)), [members]);
  const statusOptions = useMemo(() => getUniqueSorted(members.map((member) => member.statusLabel)), [members]);
  const normalizedMemberQuery = memberQuery.trim().toLowerCase();
  const filteredMembers = useMemo(
    () =>
      members.filter(
        (member) => {
          const searchable = [member.name, member.roleLabel, member.statusLabel, member.language].filter(Boolean).join(" ").toLowerCase();

          return (
            (roleFilter === "all" || member.roleLabel === roleFilter) &&
            (statusFilter === "all" || member.statusLabel === statusFilter) &&
            (!normalizedMemberQuery || searchable.includes(normalizedMemberQuery))
          );
        },
      ),
    [members, normalizedMemberQuery, roleFilter, statusFilter],
  );
  const selectedMember = useMemo(
    () => filteredMembers.find((member) => member.id === selectedMemberId) || filteredMembers[0] || null,
    [filteredMembers, selectedMemberId],
  );
  const hasMembers = members.length > 0;
  const hasFilters = hasMembers && (members.length > 1 || roleOptions.length > 1 || statusOptions.length > 1);
  const latestDispatch = selectedMember ? dispatches.find((dispatch) => dispatch.memberId === selectedMember.id) : null;

  useEffect(() => {
    setDispatches(loadMemberRelayDispatches(publicSlug));
  }, [publicSlug]);

  useEffect(() => {
    if (normalizedMemberQuery && filteredMembers.length === 1 && selectedMemberId !== filteredMembers[0].id) {
      setSelectedMemberId(filteredMembers[0].id);
    }
  }, [filteredMembers, normalizedMemberQuery, selectedMemberId]);

  function resetFilters() {
    setMemberQuery("");
    setRoleFilter("all");
    setStatusFilter("all");
  }

  function selectMember(memberId) {
    setSelectedMemberId(memberId);
  }

  function sendMemberDispatch(kind) {
    if (!selectedMember) return;

    const message = memberMessage.trim() || (kind === "alert" ? `Alerte tactique pour ${selectedMember.name}.` : `Message direct pour ${selectedMember.name}.`);
    const relay = getMemberRelay(selectedMember, publicSlug);
    const relayMember = { ...selectedMember, relayId: relay.relayId };
    const dispatch = saveMemberRelayDispatch(publicSlug, {
      kind,
      memberId: selectedMember.id,
      memberName: selectedMember.name,
      memberRole: selectedMember.roleLabel,
      relayId: relay.relayId,
      relayPath: getMemberRelayPath(publicSlug, relayMember),
      message,
      status: "sent",
    });

    setSelectedMemberId(selectedMember.id);
    setMemberMessage("");
    setDispatches((current) => [dispatch, ...current.filter((item) => item.id !== dispatch.id)].slice(0, 30));
  }

  return (
    <section className="public-team-page">
      <div className="public-team-hero">
        <div className="public-team-copy">
          <span className="theme-kicker">Equipe</span>
          <h1>{siteDraft.guildName}</h1>
          <p>
            {siteDraft.game} · {siteDraft.realm}
          </p>
        </div>
        <dl className="public-team-stats">
          <div>
            <dt>Membres</dt>
            <dd>{hasMembers ? members.length : "Etat-major"}</dd>
          </div>
          <div>
            <dt>Roles</dt>
            <dd>{hasMembers ? roleOptions.length || 1 : permissionRoles.length - 1}</dd>
          </div>
        </dl>
        <div className="public-team-actions">
          <a href={homePath} onClick={(event) => navigatePublicSite(event, homePath, onNavigatePublicRoute)}>
            Retour accueil
          </a>
          {siteDraft.sections.publicChat ? (
            <a href={memberSpacePath} onClick={(event) => navigatePublicSite(event, memberSpacePath, onNavigatePublicRoute)}>
              Espace membre
            </a>
          ) : null}
        </div>
      </div>

      {hasFilters ? (
        <div className="public-team-filters" aria-label="Filtres equipe">
          <label className="public-member-search">
            <span>Rechercher</span>
            <input
              type="search"
              value={memberQuery}
              onChange={(event) => setMemberQuery(event.target.value)}
              placeholder="Pseudo, role, statut..."
            />
          </label>
          {roleOptions.length > 1 ? (
            <label>
              <span>Role</span>
              <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
                <option value="all">Tous les roles</option>
                {roleOptions.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {statusOptions.length > 1 ? (
            <label>
              <span>Statut</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">Tous les statuts</option>
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}

      {hasMembers && selectedMember ? (
        <section className="public-member-dispatch" aria-label="Contact membre">
          <header>
            <span className="theme-kicker">Contact direct</span>
            <strong>{selectedMember.name}</strong>
            <small>{[selectedMember.roleLabel, selectedMember.statusLabel].filter(Boolean).join(" · ")}</small>
          </header>
          <textarea
            aria-label={`Message pour ${selectedMember.name}`}
            value={memberMessage}
            onChange={(event) => setMemberMessage(event.target.value)}
            placeholder="Message rapide..."
          />
          <div className="public-member-dispatch-actions">
            <button type="button" className="is-message" onClick={() => sendMemberDispatch("message")}>
              <Send size={16} />
              Message
            </button>
            <button type="button" className="is-alert" onClick={() => sendMemberDispatch("alert")}>
              <AlertTriangle size={16} />
              Alerte
            </button>
          </div>
          {latestDispatch ? (
            <p className={`public-member-dispatch-status is-${latestDispatch.kind}`}>
              {latestDispatch.kind === "alert" ? "Alerte" : "Message"} · {latestDispatch.memberName} · {formatSosTime(latestDispatch.createdAt)}
            </p>
          ) : null}
        </section>
      ) : null}

      {hasMembers ? (
        filteredMembers.length ? (
          <div className="public-team-grid">
            {filteredMembers.map((member) => (
              <button
                className={`public-member-card public-member-contact-card${selectedMember?.id === member.id ? " is-selected" : ""}`}
                key={member.id}
                type="button"
                onClick={() => selectMember(member.id)}
                aria-pressed={selectedMember?.id === member.id}
              >
                <Avatar name={member.name} />
                <span>
                  <strong>{member.name}</strong>
                  <RolePill role={member.role} />
                </span>
                <dl>
                  {member.statusLabel ? (
                    <div>
                      <dt>Statut</dt>
                      <dd>{member.statusLabel}</dd>
                    </div>
                  ) : null}
                  {member.powerLabel ? (
                    <div>
                      <dt>Puissance</dt>
                      <dd>{member.powerLabel}</dd>
                    </div>
                  ) : null}
                  {member.language ? (
                    <div>
                      <dt>Langue</dt>
                      <dd>{member.language}</dd>
                    </div>
                  ) : null}
                </dl>
              </button>
            ))}
          </div>
        ) : (
          <div className="public-team-empty">
            <ShieldAlert size={26} />
            <strong>Aucun membre ne correspond aux filtres.</strong>
            <button type="button" onClick={resetFilters}>
              Réinitialiser
            </button>
          </div>
        )
      ) : (
        <PublicTeamFallback siteDraft={siteDraft} />
      )}
    </section>
  );
}

function PublicTeamFallback({ siteDraft }) {
  const commandRoles = permissionRoles.filter((role) => role.code !== "membre");

  return (
    <div className="public-command-fallback">
      <header>
        <span className="theme-kicker">Organisation</span>
        <h2>Etat-major {siteDraft.guildName}</h2>
        <p>Aucun roster n'est encore publie. La page affiche les roles de commandement attendus.</p>
      </header>
      <div className="public-team-grid">
        {commandRoles.map((role) => {
          const details = COMMAND_ROLE_FALLBACK[role.code] || {
            title: role.role,
            text: "Role operationnel de guilde.",
          };

          return (
            <article className="public-member-card public-command-card" key={role.code}>
              <Avatar name={role.role} />
              <span>
                <strong>{details.title}</strong>
                <RolePill role={role.role} />
              </span>
              <p>{details.text}</p>
              <small>{role.modules.slice(0, 3).join(" · ")}</small>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function PublicForumModule({ homePath, memberSpacePath, onNavigatePublicRoute, publicForum, publicSlug, siteDraft }) {
  const forum = getPublicForumData(publicForum);
  const latestThreads = forum.latestThreads.slice(0, 6);
  const publicThreadCount = latestThreads.length;
  const publicCategoryCount = forum.categories.length;
  const hasPublicContent = publicCategoryCount > 0 || publicThreadCount > 0;
  const privateCount = forum.locked.privateCategoryCount + forum.locked.privateThreadCount;
  const ctaPath = memberSpacePath || getPublicMemberSpacePath(publicSlug);
  const ctaLabel = "Espace membre";

  return (
    <section className="public-forum-page" id={getPublicSiteSectionId("forum")} tabIndex={-1}>
      <div className="public-forum-hero">
        <span className="theme-kicker">Forum</span>
        <h1>Briefings et annonces</h1>
        <p>
          {siteDraft.guildName} partage ici ses briefings et annonces. Les espaces membres, officiers et admins restent
          verrouillés.
        </p>
        <div className="public-forum-actions">
          <a href={homePath} onClick={(event) => navigatePublicSite(event, homePath, onNavigatePublicRoute)}>
            Retour accueil
          </a>
          <a href={ctaPath} onClick={(event) => navigatePublicSite(event, ctaPath, onNavigatePublicRoute)}>
            {ctaLabel}
          </a>
        </div>
        <dl className="public-forum-stats">
          <div>
            <dt>Catégories</dt>
            <dd>{publicCategoryCount}</dd>
          </div>
          <div>
            <dt>Sujets</dt>
            <dd>{publicThreadCount}</dd>
          </div>
          <div>
            <dt>Espaces verrouillés</dt>
            <dd>{privateCount || "Verrouillé"}</dd>
          </div>
        </dl>
      </div>

      {hasPublicContent ? (
        <div className="public-forum-layout">
          <section className="public-forum-panel">
            <header>
              <strong>Catégories</strong>
              <em>{publicCategoryCount ? `${publicCategoryCount} ouverte${publicCategoryCount > 1 ? "s" : ""}` : "Annonce"}</em>
            </header>
            {forum.categories.length ? (
              <div className="public-forum-categories">
                {forum.categories.map((category) => (
                  <article key={category.id}>
                    <MessageSquare size={20} />
                    <span>
                      <strong>{category.name}</strong>
                      <small>{category.description || "Annonce"}</small>
                    </span>
                    <dl>
                      <div>
                        <dt>Sujets</dt>
                        <dd>{category.threadCount}</dd>
                      </div>
                      <div>
                        <dt>Posts</dt>
                        <dd>{category.postCount}</dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
            ) : (
              <p className="preview-card-text">Aucune catégorie dédiée pour le moment.</p>
            )}
          </section>

          <section className="public-forum-panel public-forum-latest">
            <header>
              <strong>Derniers sujets</strong>
              <em>Consultation</em>
            </header>
            {latestThreads.length ? (
              <div className="public-forum-thread-list">
                {latestThreads.map((thread) => (
                  <article key={thread.id}>
                    {thread.locked ? <Lock size={20} /> : thread.pinned ? <Flag size={20} /> : <FileText size={20} />}
                    <span>
                      <strong>{thread.title}</strong>
                      <small>
                        {thread.categoryName} · {thread.authorName} · {formatChatTime({ createdAt: thread.lastPostAt || thread.createdAt }) || "Publié"}
                      </small>
                      <p>{thread.preview || "Sujet sans extrait."}</p>
                    </span>
                    <em>{thread.pinned ? "Annonce" : thread.locked ? "Verrouillé" : `${thread.replyCount} réponses`}</em>
                  </article>
                ))}
              </div>
            ) : (
              <p className="preview-card-text">Aucun sujet n'a encore été publié.</p>
            )}
          </section>
        </div>
      ) : (
        <section className="public-forum-empty">
          <MessageSquare size={34} />
          <strong>Aucune annonce</strong>
          <p>Aucun sujet n'est ouvert pour le moment.</p>
          <a href={ctaPath} onClick={(event) => navigatePublicSite(event, ctaPath, onNavigatePublicRoute)}>
            {ctaLabel}
          </a>
        </section>
      )}

      <aside className="public-forum-locked">
        <Lock size={22} />
        <span>
          <strong>Contenu privé verrouillé</strong>
          <small>
            {privateCount
              ? `${privateCount} espace${privateCount > 1 ? "s" : ""} ou sujet${privateCount > 1 ? "s" : ""} restent réservés aux membres.`
              : forum.locked.note}
          </small>
        </span>
      </aside>
    </section>
  );
}

function PublicSiteMissingModule({ homePath, onNavigatePublicRoute }) {
  return (
    <section className="public-empty public-route-empty">
      <ShieldAlert size={42} />
      <h1>Module introuvable</h1>
      <p>Ce module n'existe pas ou n'est pas activé pour cette guilde.</p>
      <a href={homePath} onClick={(event) => navigatePublicSite(event, homePath, onNavigatePublicRoute)}>
        Retour à l'accueil
      </a>
    </section>
  );
}

function PublicMemberSpaceModule({ homePath, onNavigatePublicRoute, publicSlug, siteDraft }) {
  const [profileForm, setProfileForm] = useState(() => loadPublicMemberProfile(publicSlug));
  const [savedProfile, setSavedProfile] = useState(() => loadPublicMemberProfile(publicSlug));
  const [profileStatus, setProfileStatus] = useState("");
  const [profileError, setProfileError] = useState("");
  const previewName = profileForm.displayName || "Membre";
  const avatarStyle = profileForm.avatar?.src
    ? { "--public-member-avatar": `url(${JSON.stringify(profileForm.avatar.src)})` }
    : undefined;

  useEffect(() => {
    const storedProfile = loadPublicMemberProfile(publicSlug);
    setProfileForm(storedProfile);
    setSavedProfile(storedProfile);
    setProfileStatus("");
    setProfileError("");
  }, [publicSlug]);

  function updateDisplayName(value) {
    setProfileForm((current) => ({ ...current, displayName: value.slice(0, 32) }));
    setProfileStatus("");
  }

  async function importProfileImage(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setProfileError("");
    setProfileStatus("");

    try {
      const avatar = await createPublicMemberAvatarUpload(file);
      setProfileForm((current) => ({ ...current, avatar }));
    } catch (error) {
      setProfileError(error?.message || "Image impossible à importer.");
    }
  }

  function removeProfileImage() {
    setProfileForm((current) => ({ ...current, avatar: null }));
    setProfileStatus("");
    setProfileError("");
  }

  function saveProfile(event) {
    event.preventDefault();

    try {
      const nextProfile = savePublicMemberProfile(publicSlug, profileForm);
      setProfileForm(nextProfile);
      setSavedProfile(nextProfile);
      setProfileStatus("Profil enregistré.");
      setProfileError("");
    } catch {
      setProfileError("Enregistrement impossible dans ce navigateur.");
      setProfileStatus("");
    }
  }

  return (
    <section className="public-member-space-page" tabIndex={-1}>
      <div className="public-member-space-hero">
        <div>
          <span className="theme-kicker">Membre</span>
          <h1>Espace membre</h1>
          <p>
            {siteDraft.guildName} · {siteDraft.game} · {siteDraft.realm}
          </p>
        </div>
        <div className="public-member-space-actions">
          <a href={homePath} onClick={(event) => navigatePublicSite(event, homePath, onNavigatePublicRoute)}>
            Retour accueil
          </a>
        </div>
      </div>

      <div className="public-member-space-layout">
        <form className="public-member-profile-panel" onSubmit={saveProfile}>
          <header className="public-member-profile-header">
            <span className={`public-member-avatar-preview ${profileForm.avatar?.src ? "has-image" : ""}`} style={avatarStyle}>
              {profileForm.avatar?.src ? null : getPublicMemberProfileInitials(previewName)}
            </span>
            <span>
              <strong>{previewName}</strong>
              <small>{profileForm.avatar?.name || "Image de profil"}</small>
            </span>
          </header>

          <label className="public-member-profile-field">
            <span>Pseudo</span>
            <input
              autoComplete="nickname"
              maxLength={32}
              value={profileForm.displayName}
              onChange={(event) => updateDisplayName(event.target.value)}
              placeholder="Pseudo membre"
            />
          </label>

          <div className="public-member-image-actions">
            <label className="public-member-image-button">
              <Upload size={16} aria-hidden="true" />
              Image de profil
              <input accept="image/jpeg,image/png,image/webp" type="file" onChange={importProfileImage} />
            </label>
            {profileForm.avatar ? (
              <button type="button" onClick={removeProfileImage}>
                <Trash2 size={16} aria-hidden="true" />
                Retirer
              </button>
            ) : null}
          </div>

          <button className="public-member-save-button" type="submit">
            <Check size={16} aria-hidden="true" />
            Enregistrer
          </button>

          {profileStatus ? <p className="form-note public-member-profile-status">{profileStatus}</p> : null}
          {profileError ? <p className="form-note public-member-profile-error" aria-live="polite">{profileError}</p> : null}
        </form>

        {siteDraft.sections.publicChat ? (
          <div className="public-member-chat-panel">
            <PublicSiteGuestChat memberProfile={savedProfile} siteDraft={siteDraft} />
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function PublicSiteGuestChat({ memberProfile, siteDraft }) {
  const [messages, setMessages] = useState([]);
  const [guestName, setGuestName] = useState(() => memberProfile?.displayName || "");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const slug = siteDraft.slug || slugify(siteDraft.guildName);
  const chatAvatarStyle = memberProfile?.avatar?.src
    ? { "--public-member-avatar": `url(${JSON.stringify(memberProfile.avatar.src)})` }
    : undefined;

  useEffect(() => {
    setGuestName(memberProfile?.displayName || "");
  }, [memberProfile?.displayName]);

  useEffect(() => {
    if (!isApiConfigured() || !slug) return undefined;

    const controller = new AbortController();
    guildOpsApi
      .listPublicChat(slug, { targetLanguage: "fr", limit: 25 }, { signal: controller.signal })
      .then((payload) => {
        setMessages((payload?.messages || []).map(normalizeApiChatMessage));
        setError("");
      })
      .catch((requestError) => {
        if (controller.signal.aborted) return;
        setError(requestError?.message || "Chat indisponible.");
      });

    return () => controller.abort();
  }, [slug]);

  useEffect(() => {
    if (!isApiConfigured() || !slug) return undefined;

    let stream;

    try {
      stream = guildOpsApi.openPublicChatStream(slug);
      stream.addEventListener("public_message", (event) => {
        const payload = parseRealtimeEvent(event);
        if (payload?.message) {
          setMessages((current) => appendUniqueById(current, [normalizeApiChatMessage(payload.message)]));
        }
      });
      stream.addEventListener("public_moderation", (event) => {
        const payload = parseRealtimeEvent(event);
        if (payload?.messageId) {
          setMessages((current) =>
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
  }, [slug]);

  useEffect(() => {
    if (!cooldownUntil) {
      setCooldownRemaining(0);
      return undefined;
    }

    function updateCooldown() {
      const remaining = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
      setCooldownRemaining(remaining);

      if (remaining === 0) {
        setCooldownUntil(0);
      }
    }

    updateCooldown();
    const interval = window.setInterval(updateCooldown, 1000);

    return () => window.clearInterval(interval);
  }, [cooldownUntil]);

  async function sendPublicMessage() {
    const body = draft.trim();
    if (!body) return;

    if (cooldownRemaining > 0) {
      setError(formatPublicChatCooldown(cooldownRemaining));
      return;
    }

    const optimisticMessage = {
      id: `public-local-${Date.now()}`,
      author: guestName.trim() || "Invite",
      source: "AUTO",
      target: "FR",
      text: body,
      translated: body,
      translationStatus: "original",
      createdAt: new Date().toISOString(),
      public: true,
    };

    setDraft("");
    setError("");
    setMessages((current) => appendUniqueById(current, [optimisticMessage]));

    if (!isApiConfigured() || !slug) return;

    try {
      const payload = await guildOpsApi.sendPublicChat(slug, {
        body,
        guestName: guestName.trim() || "Invite",
        sourceLanguage: "auto",
        targetLanguage: "fr",
      });
      const apiMessage = payload?.message ? normalizeApiChatMessage(payload.message) : null;
      if (apiMessage) {
        setMessages((current) => {
          const replaced = current.map((message) => (message.id === optimisticMessage.id ? apiMessage : message));
          return appendUniqueById(replaced, [apiMessage]);
        });
      }
      setError(payload?.moderation?.status === "flagged" ? "Message envoye en moderation." : "");
    } catch (requestError) {
      const rateLimit = getPublicChatRateLimitDetails(requestError);

      if (rateLimit) {
        setMessages((current) => current.filter((message) => message.id !== optimisticMessage.id));
        setDraft(body);
        setCooldownUntil(Date.now() + rateLimit.retryAfterSeconds * 1000);
        setError(formatPublicChatCooldown(rateLimit.retryAfterSeconds));
        return;
      }

      setError(requestError?.message || "Envoi impossible.");
    }
  }

  const chatButtonDisabled = cooldownRemaining > 0;
  const recentMessages = messages.slice(-8);

  return (
    <section className="public-chat-panel" id="public-chat" tabIndex={-1}>
      <PanelHeader
        icon={MessageSquare}
        title="Chat invite"
        meta={cooldownRemaining > 0 ? `Pause ${cooldownRemaining}s` : isApiConfigured() ? PUBLIC_CHAT_LIMIT_LABEL : "API requise"}
      />
      <div className="chat-feed public-chat-feed">
        {recentMessages.length ? (
          recentMessages.map((message) => (
            <p key={message.id} className={message.moderationStatus && message.moderationStatus !== "visible" ? "is-muted" : ""}>
              <time>{formatChatTime(message)}</time>
              <strong>{message.author}</strong>
              <span>{getTranslatedText(message)}</span>
              {message.moderationStatus && message.moderationStatus !== "visible" ? (
                <small className="translation-meta">En moderation</small>
              ) : null}
            </p>
          ))
        ) : (
          <p className="public-chat-empty">Aucun message pour le moment.</p>
        )}
      </div>
      <div className={`public-chat-form ${memberProfile?.avatar?.src ? "has-profile-avatar" : ""}`}>
        {memberProfile?.avatar?.src ? (
          <span className="public-chat-profile-avatar" style={chatAvatarStyle} aria-hidden="true" />
        ) : null}
        <input value={guestName} placeholder="Pseudo" onChange={(event) => setGuestName(event.target.value)} />
        <label className="chat-input">
          <input
            value={draft}
            placeholder="Ecrire au clan..."
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") sendPublicMessage();
            }}
          />
          <button type="button" onClick={sendPublicMessage} disabled={chatButtonDisabled} aria-label="Envoyer">
            <Send size={15} />
          </button>
        </label>
      </div>
      {isApiConfigured() ? (
        <p className="form-note public-chat-policy">Limite {PUBLIC_CHAT_LIMIT_LABEL}. Certains messages passent en moderation.</p>
      ) : null}
      {error ? <p className="form-note" aria-live="polite">{error}</p> : null}
    </section>
  );
}

export function CommandCenter(props) {
  const siteDraft = props.siteDraft || createGuildSiteDraft(props.selectedGuild);
  const enabledModuleIds = props.enabledModuleIds;
  const [linkCopied, setLinkCopied] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const showOperationsDock = ["wars_events", "bank", "diplomacy", "forum"].some((moduleId) =>
    isGuildOpsModuleEnabled(moduleId, enabledModuleIds),
  );

  function updateSiteDraft(patch) {
    if (!can(props.currentUser, "manage_site")) return;
    props.setSiteDraft((current) => {
      const next = {
        ...current,
        ...patch,
      };

      if (patch.game !== undefined || patch.realm !== undefined) {
        next.realm = normalizeRealmCodeForGame(patch.realm ?? next.realm, next.game);
      }

      if (patch.guildName !== undefined) {
        next.slug = slugify(patch.guildName);
      }

      return next;
    });
  }

  async function copyPublicSiteLink() {
    if (!props.publicSiteUrl) return;

    setLinkCopied(await copyTextToClipboard(props.publicSiteUrl));
  }

  return (
    <div className="builder-layout">
      <BuilderConfigPanel
        currentUser={props.currentUser}
        onDraftChange={updateSiteDraft}
        onRotateInviteLink={props.onRotateInviteLink}
        rotatingInviteLink={props.rotatingInviteLink}
        siteDraft={siteDraft}
      />
      <section className="preview-stage">
        <SiteLaunchChecklist
          linkCopied={linkCopied}
          onCopyLink={copyPublicSiteLink}
          onOpenPreview={() => setPreviewOpen(true)}
          onOpenPublicSite={props.onOpenPublicSite}
          onPublishSite={props.publishGuildSite}
          publishingSite={props.publishingSite}
          publicSiteUrl={props.publicSiteUrl}
          siteDraft={siteDraft}
          sitePublished={props.sitePublished}
        />
        {showOperationsDock ? (
          <QuickOpsDock
            onCheckIn={props.checkIn}
            onNavigate={props.onNavigate}
            currentUser={props.currentUser}
            enabledModuleIds={enabledModuleIds}
            warSummary={props.warSummary}
          />
        ) : null}
      </section>
      <StyleSectionsPanel
        currentUser={props.currentUser}
        onDraftChange={updateSiteDraft}
        purchasedDesignIds={props.purchasedDesignIds}
        siteDraft={siteDraft}
      />
      {previewOpen ? (
        <PreviewPopup
          members={props.members}
          onClose={() => setPreviewOpen(false)}
          onNavigate={props.onNavigate}
          siteDraft={siteDraft}
          unreadMessages={props.unreadMessageCount}
          warSummary={props.warSummary}
        />
      ) : null}
    </div>
  );
}

export function SiteLaunchChecklist({
  linkCopied,
  onCopyLink,
  onOpenPreview,
  onOpenPublicSite,
  onPublishSite,
  publishingSite,
  publicSiteUrl,
  siteDraft,
  sitePublished,
}) {
  const profileComplete = Boolean(siteDraft.guildName?.trim() && siteDraft.game?.trim() && siteDraft.realm?.trim());
  const pagePersonalized = Boolean(siteDraft.tagline?.trim() && siteDraft.objective?.trim());
  const inviteUrl = getAbsoluteMemberInviteUrl(siteDraft.memberInviteUrl || siteDraft.slug || siteDraft.guildName);
  const steps = [
    {
      id: "profile",
      label: "Compléter le profil",
      text: "Nom, jeu, royaume et promesse de guilde.",
      done: profileComplete,
    },
    {
      id: "page",
      label: "Personnaliser la page",
      text: "Texte, thème et sections.",
      done: pagePersonalized,
    },
    {
      id: "invite",
      label: "Lien membre prêt",
      text: inviteUrl,
      done: Boolean(inviteUrl),
    },
    {
      id: "publish",
      label: "Publier le site",
      text: "Rendre la page accessible avec une URL partageable.",
      done: sitePublished,
      action: onPublishSite,
      actionLabel: publishingSite ? "Mise en ligne..." : sitePublished ? "Mettre à jour" : "Publier",
      disabled: publishingSite,
    },
    {
      id: "share",
      label: "Copier ou ouvrir le lien",
      text: publicSiteUrl,
      done: Boolean(sitePublished && linkCopied),
      action: onCopyLink,
      actionLabel: linkCopied ? "Lien copié" : "Copier",
      secondaryAction: onOpenPublicSite,
      secondaryLabel: "Ouvrir",
      disabled: !publicSiteUrl,
      secondaryDisabled: !sitePublished,
    },
  ];

  return (
    <section className="site-launch-checklist">
      <header>
        <span>
          <strong>Publier le site de guilde</strong>
          <small>Le premier objectif est un lien propre à partager.</small>
        </span>
        <div className="site-launch-header-actions">
          <button className="site-preview-button" type="button" onClick={onOpenPreview}>
            <Eye size={16} />
            Aperçu
          </button>
          <em>{steps.filter((step) => step.done).length}/{steps.length}</em>
        </div>
      </header>
      <div className="site-launch-list">
        {steps.map((step) => (
          <article className={step.done ? "is-done" : ""} key={step.id}>
            <Check size={17} />
            <span>
              <strong>{step.label}</strong>
              <small>{step.text}</small>
            </span>
            {step.action || step.secondaryAction ? (
              <div className="site-launch-actions">
                {step.action ? (
                  <button type="button" onClick={step.action} disabled={step.disabled}>
                    {step.actionLabel}
                  </button>
                ) : null}
                {step.secondaryAction ? (
                  <button type="button" className="ghost-mini" onClick={step.secondaryAction} disabled={step.secondaryDisabled}>
                    {step.secondaryLabel}
                  </button>
                ) : null}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

export function BuilderConfigPanel({ currentUser, onDraftChange, onRotateInviteLink, rotatingInviteLink = false, siteDraft }) {
  const tags = ["Operations", "Communauté", "Compétitif", "Casual"];
  const siteGuard = getGuardProps(currentUser, "manage_site");
  const canRotateInvite = can(currentUser, "approve_members") || can(currentUser, "manage_site");
  const realmPrefix = normalizeRealmCodeForGame("", siteDraft.game);
  const [inviteCopied, setInviteCopied] = useState(false);
  const inviteUrl = getAbsoluteMemberInviteUrl(siteDraft.memberInviteUrl || siteDraft.slug || siteDraft.guildName);

  async function copyInviteLink() {
    if (!inviteUrl) return;

    if (await copyTextToClipboard(inviteUrl)) {
      setInviteCopied(true);
      window.setTimeout(() => setInviteCopied(false), 1400);
    } else {
      setInviteCopied(false);
    }
  }

  return (
    <aside className="builder-panel config-panel">
      <PanelEyebrow icon={LayoutDashboard} label="Configuration du site" help={SITE_BUILDER_HELP.config} />
      <label className="builder-field">
        <span className="builder-field-head">
          <HelpLabel label="Nom de guilde" help={SITE_BUILDER_HELP.guildName} />
          <small>{siteDraft.guildName.length}/32</small>
        </span>
        <input
          value={siteDraft.guildName}
          maxLength={32}
          onChange={(event) => onDraftChange({ guildName: event.target.value })}
          {...siteGuard}
        />
      </label>
      <label className="builder-field">
        <HelpLabel label="Jeu" help={SITE_BUILDER_HELP.game} />
        <select value={siteDraft.game} onChange={(event) => onDraftChange({ game: event.target.value })} {...siteGuard}>
          {GAME_OPTIONS.map((game) => (
            <option key={game}>{game}</option>
          ))}
        </select>
      </label>
      <label className="builder-field">
        <span className="builder-field-head">
          <HelpLabel label="Royaume" help={SITE_BUILDER_HELP.realm} />
          <small>{siteDraft.realm.length}/{REALM_CODE_MAX_LENGTH}</small>
        </span>
        <input
          value={siteDraft.realm}
          maxLength={REALM_CODE_MAX_LENGTH}
          placeholder={getRealmPlaceholderForGame(siteDraft.game)}
          aria-description={`Le préfixe ${realmPrefix} est imposé par le jeu choisi.`}
          onChange={(event) => onDraftChange({ realm: event.target.value })}
          {...siteGuard}
        />
      </label>
      <label className="builder-field">
        <span className="builder-field-head">
          <HelpLabel label="Tagline" help={SITE_BUILDER_HELP.tagline} />
          <small>{siteDraft.tagline.length}/60</small>
        </span>
        <input
          value={siteDraft.tagline}
          maxLength={60}
          onChange={(event) => onDraftChange({ tagline: event.target.value })}
          {...siteGuard}
        />
      </label>
      <label className="builder-field builder-field-wide">
        <span className="builder-field-head">
          <HelpLabel label="Objectif" help={SITE_BUILDER_HELP.objective} />
          <small>{siteDraft.objective.length}/140</small>
        </span>
        <textarea
          value={siteDraft.objective}
          maxLength={140}
          onChange={(event) => onDraftChange({ objective: event.target.value })}
          {...siteGuard}
        />
      </label>
      <div className="builder-field builder-field-wide invite-link-field">
        <span className="builder-field-head">
          <HelpLabel label="Lien d'invitation" help={SITE_BUILDER_HELP.memberInviteUrl} />
          <small>Généré</small>
        </span>
        <div className="generated-invite-row">
          <input
            aria-label="Lien GuildOps pour devenir membre"
            readOnly
            value={inviteUrl}
            onFocus={(event) => event.target.select()}
          />
          <button type="button" onClick={copyInviteLink} aria-label="Copier le lien d'invitation">
            {inviteCopied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
            {inviteCopied ? "Copié" : "Copier"}
          </button>
          <button
            type="button"
            onClick={onRotateInviteLink}
            disabled={!canRotateInvite || rotatingInviteLink}
            title={
              canRotateInvite
                ? "Générer un nouveau lien et désactiver l'ancien"
                : "Permission Adhésions ou Site requise"
            }
            aria-label="Renouveler le lien d'invitation"
          >
            <RefreshCw size={15} aria-hidden="true" />
            {rotatingInviteLink ? "Renouvellement..." : "Renouveler"}
          </button>
        </div>
      </div>
      <HelpLabel className="builder-help-heading" label="Objectifs rapides" help={SITE_BUILDER_HELP.objectiveTags} />
      <div className="tag-grid" aria-label="Objectifs rapides">
        {tags.map((tag) => (
          <button
            key={tag}
            className={siteDraft.objectiveTag === tag ? "is-active" : ""}
            type="button"
            title={`${tag} - ${SITE_BUILDER_HELP.objectiveTags}`}
            onClick={() => onDraftChange({ objectiveTag: tag })}
            {...siteGuard}
          >
            {tag}
          </button>
        ))}
      </div>
    </aside>
  );
}

export function GuildSitePreview({ members = [], siteDraft, onNavigate, unreadMessages = 0, warSummary }) {
  const color = getColorOption(siteDraft.colors);
  const theme = getThemeOption(siteDraft.theme);
  const design = getDesignOption(siteDraft.design);
  const typography = getTypographyOption(siteDraft.typography);
  const visibleSections = getPublicVisibleSiteSections(siteDraft, siteDraft.enabledModules);
  const hasWarsSection = visibleSections.some((section) => section.key === "wars");
  const memberRequestUrl = getMemberRequestHref(siteDraft.slug || siteDraft.guildName);
  const WarsIcon = getSiteSectionIcon("wars");
  const previewStyle = {
    "--site-accent": color.accent,
    "--site-highlight": color.highlight,
    "--site-contrast": color.contrast,
    "--site-font": typography.fontFamily,
    ...getHeroImageStyle(siteDraft.heroImage),
  };

  return (
    <section className={`site-preview theme-${theme.overlay} design-${design.tone}`} style={previewStyle}>
      <div className="preview-browser-bar">
        <div className="preview-logo">{siteDraft.guildName.slice(0, 1).toUpperCase() || "G"}</div>
        <strong>
          {siteDraft.guildName || "Guilde"}
          <small>
            {siteDraft.game} · {siteDraft.realm}
          </small>
        </strong>
        <nav>
          <span>Accueil</span>
          {visibleSections.slice(0, 4).map((section) => {
            const SectionIcon = getSiteSectionIcon(section.key);

            return (
              <span key={section.key}>
                <SectionIcon size={14} aria-hidden="true" />
                {section.navLabel}
              </span>
            );
          })}
        </nav>
        <span className="preview-header-actions">
          <button className="preview-message-action" type="button" onClick={() => onNavigate?.("messages")}>
            <Mail size={14} aria-hidden="true" />
            Messagerie
            <span>{Number(unreadMessages) || 0}</span>
          </button>
          <span className="preview-gallery-action">
            <Globe2 size={14} aria-hidden="true" />
            Galerie
          </span>
          <button type="button" onClick={() => onNavigate?.("member")}>
            Espace membre
          </button>
        </span>
      </div>
      <div className="site-hero-preview">
        <div className="hero-copy">
          <span className="theme-kicker">{theme.label}</span>
          <h1>{siteDraft.guildName || "Guilde"}</h1>
          <h2>{siteDraft.tagline}</h2>
          <p>{siteDraft.objective}</p>
          <em>
            {siteDraft.game} · {siteDraft.realm} · {siteDraft.objectiveTag}
          </em>
          <div className="preview-actions">
            <a href={memberRequestUrl}>
              Devenir membre
              <UserPlus size={17} />
            </a>
            {hasWarsSection ? (
              <button type="button" onClick={() => onNavigate?.("wars")}>
                Voir les wars
                <WarsIcon size={17} />
              </button>
            ) : null}
          </div>
        </div>
      </div>
      <div className="preview-content-grid">
        {visibleSections.map((section) => (
          <PreviewSectionCard
            key={section.key}
            members={members}
            onNavigate={onNavigate}
            section={section}
            siteDraft={siteDraft}
            warSummary={warSummary}
          />
        ))}
      </div>
    </section>
  );
}

export function PreviewSectionCard({
  members = [],
  onNavigate,
  onNavigatePublicRoute,
  publicSlug = "",
  section,
  sectionId = "",
  siteDraft,
  warSummary,
}) {
  const articleProps = sectionId ? { id: sectionId, tabIndex: -1 } : {};
  const publicSectionPath = publicSlug ? getPublicSiteRoutePath(publicSlug, section.key) : "";
  const SectionIcon = getSiteSectionIcon(section.key);

  switch (section.key) {
    case "wars":
      {
        const publicWars = getPublicWarsData(siteDraft, warSummary);
        const nextEvent = publicWars.nextEvent;

        return (
          <article {...articleProps}>
            <header>
              <span className="preview-section-title">
                <SectionIcon size={20} aria-hidden="true" />
                <strong>Prochain war</strong>
              </span>
              <em>{nextEvent ? formatPublicEventStatus(nextEvent) : "Aucune date"}</em>
            </header>
            {nextEvent ? (
              <div className="next-war">
                <Swords size={26} />
                <span>
                  {formatEventTitle(nextEvent) || "Guerre d'alliance"}
                  <small>{formatEventWhen(nextEvent) || nextEvent.time || `${formatPublicEventRealm(nextEvent, siteDraft)} · horaire à confirmer`}</small>
                </span>
              </div>
            ) : (
              <p className="preview-card-text">Aucun event annoncé pour le moment.</p>
            )}
          </article>
        );
      }
    case "membership":
      return (
        <article {...articleProps}>
          <header>
            <span className="preview-section-title">
              <SectionIcon size={20} aria-hidden="true" />
              <strong>Adhésions</strong>
            </span>
            <em>Accès</em>
          </header>
          <p className="preview-card-text">Demande d'accès côté site, validation réservée aux membres autorisés.</p>
        </article>
      );
    case "bank":
      return (
        <article {...articleProps}>
          <header>
            <span className="preview-section-title">
              <SectionIcon size={20} aria-hidden="true" />
              <strong>Banque de guilde</strong>
            </span>
            <em>R4</em>
          </header>
          <p className="preview-card-text">Fonctionnement banque, ressources agregees et demandes masquees si besoin.</p>
        </article>
      );
    case "diplomacy":
      return (
        <article {...articleProps}>
          <header>
            <span className="preview-section-title">
              <SectionIcon size={20} aria-hidden="true" />
              <strong>Diplomatie</strong>
            </span>
            <em>NAP</em>
          </header>
          <p className="preview-card-text">Alliés, ennemis et coordonnées du royaume.</p>
        </article>
      );
    case "forum":
      return (
        <article {...articleProps}>
          <header>
            <span className="preview-section-title">
              <SectionIcon size={20} aria-hidden="true" />
              <strong>Forum</strong>
            </span>
            {publicSectionPath ? (
              <a href={publicSectionPath} onClick={(event) => navigatePublicSite(event, publicSectionPath, onNavigatePublicRoute)}>
                Ouvrir
              </a>
            ) : (
              <em>Officiers</em>
            )}
          </header>
          <p className="preview-card-text">Annonces et contenu privé verrouillé.</p>
        </article>
      );
    case "publicChat":
      return (
        <article {...articleProps}>
          <header>
            <span className="preview-section-title">
              <SectionIcon size={20} aria-hidden="true" />
              <strong>Chat invités</strong>
            </span>
            {publicSectionPath ? (
              <a href={publicSectionPath} onClick={(event) => navigatePublicSite(event, publicSectionPath, onNavigatePublicRoute)}>
                Ouvrir
              </a>
            ) : (
              <em>Live</em>
            )}
          </header>
          <p className="preview-card-text">Questions rapides sans entrer dans l'espace prive.</p>
        </article>
      );
    default:
      return null;
  }
}

export function PreviewPopup({ members = [], onClose, onNavigate, siteDraft, unreadMessages = 0, warSummary }) {
  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === "Escape") onClose?.();
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="preview-popup-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-label="Aperçu du site"
        aria-modal="true"
        className="preview-popup"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="preview-popup-header">
          <span>
            <Eye size={18} />
            <strong>Aperçu</strong>
          </span>
          <button type="button" onClick={onClose} aria-label="Fermer l'aperçu">
            <X size={18} />
          </button>
        </header>
        <div className="preview-popup-body">
          <GuildSitePreview
            members={members}
            siteDraft={siteDraft}
            onNavigate={onNavigate}
            unreadMessages={unreadMessages}
            warSummary={warSummary}
          />
        </div>
      </section>
    </div>
  );
}

export function QuickOpsDock({ enabledModuleIds, onCheckIn, onNavigate, warSummary }) {
  const weekly = warSummary?.weeklyObjectives;
  const weeklyDone = Number(weekly?.done ?? 2);
  const weeklyTotal = Math.max(Number(weekly?.total ?? 3), 1);
  const weeklyProgress = Math.min(100, Math.round((weeklyDone / weeklyTotal) * 100));
  const disabledModuleProps = (moduleId) => {
    if (isGuildOpsModuleEnabled(moduleId, enabledModuleIds)) return {};
    const module = guildOpsModuleById[moduleId];
    return {
      disabled: true,
      "aria-disabled": true,
      title: `${module?.label || "Module"} non active pour cette guilde.`,
    };
  };
  return (
    <section className="quick-ops-dock">
      <strong>Accès rapides</strong>
      <button
        type="button"
        {...disabledModuleProps("wars_events")}
        onClick={() => {
          onCheckIn?.("Confirme");
          onNavigate?.("wars");
        }}
      >
        <Check size={20} />
        Check-in
      </button>
      <button type="button" onClick={() => onNavigate?.("bank")} {...disabledModuleProps("bank")}>
        <Banknote size={20} />
        Banque
      </button>
      <button type="button" onClick={() => onNavigate?.("diplomacy")} {...disabledModuleProps("diplomacy")}>
        <Handshake size={20} />
        Diplomatie
      </button>
      <button type="button" onClick={() => onNavigate?.("forum")} {...disabledModuleProps("forum")}>
        <MessageSquare size={20} />
        Forum
      </button>
      <div className="weekly-goal">
        <Trophy size={22} />
        <span>
          Objectif hebdo
          <small>
            {weeklyDone}/{weeklyTotal} objectifs · {warSummary?.attendanceRate?.expected ?? 0} attendus
          </small>
        </span>
        <i style={{ "--goal-progress": `${weeklyProgress}%` }} />
      </div>
    </section>
  );
}

export function StyleSectionsPanel({ currentUser, onDraftChange, purchasedDesignIds = [], siteDraft }) {
  const imageInputId = useId();
  const [heroImageError, setHeroImageError] = useState("");
  const siteGuard = getGuardProps(currentUser, "manage_site");
  const canEditSite = can(currentUser, "manage_site");
  const heroImage = siteDraft.heroImage;
  const heroImagePreviewStyle = getHeroImageStyle(heroImage);
  const purchasedDesignKey = purchasedDesignIds.join("|");
  const designOptions = useMemo(() => getAvailableDesignOptions(purchasedDesignIds), [purchasedDesignKey]);

  async function importHeroImage(event) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    setHeroImageError("");

    try {
      const nextHeroImage = await createHeroImageUpload(file);
      onDraftChange({ heroImage: nextHeroImage });
    } catch (error) {
      setHeroImageError(error?.message || "Image impossible à importer.");
    }
  }

  function removeHeroImage() {
    setHeroImageError("");
    onDraftChange({ heroImage: null });
  }

  return (
    <aside className="builder-panel style-panel">
      <PanelEyebrow icon={Palette} label="Style" help={SITE_BUILDER_HELP.style} />
      <HelpLabel className="builder-help-heading" label="Design UI" help={SITE_BUILDER_HELP.design} />
      <div className="design-card-grid" aria-label="Designs UI">
        {designOptions.map((design) => (
          <button
            key={design.id}
            className={`design-card design-${design.tone} ${siteDraft.design === design.id ? "is-active" : ""}`}
            type="button"
            title={`${design.label} - ${design.description}`}
            onClick={() => onDraftChange({ design: design.id })}
            aria-pressed={siteDraft.design === design.id}
            {...siteGuard}
          >
            <span className="design-thumb" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span>
              <strong>{design.label}</strong>
              <small>{design.description}</small>
            </span>
            {siteDraft.design === design.id ? <Check size={17} /> : null}
          </button>
        ))}
      </div>
      <HelpLabel className="builder-help-heading" label="Image hero" help={SITE_BUILDER_HELP.heroImage} />
      <div className={`hero-image-import ${heroImage ? "has-image" : ""}`}>
        <span className="hero-image-thumb" style={heroImagePreviewStyle}>
          {heroImage ? null : <ImagePlus size={24} />}
        </span>
        <span className="hero-image-copy">
          <strong>{heroImage?.name || "Image personnalisée"}</strong>
          <small>{heroImage ? formatHeroImageSize(heroImage.size) : "Fond par défaut"}</small>
        </span>
        <span className="hero-image-actions">
          <label
            className={`hero-image-button ${canEditSite ? "" : "is-disabled"}`.trim()}
            htmlFor={canEditSite ? imageInputId : undefined}
            aria-disabled={!canEditSite}
            title={canEditSite ? "Importer une image" : siteGuard.title}
          >
            <Upload size={16} />
            {heroImage ? "Remplacer" : "Importer"}
          </label>
          {heroImage ? (
            <button type="button" onClick={removeHeroImage} {...siteGuard}>
              <Trash2 size={16} />
              Retirer
            </button>
          ) : null}
        </span>
        <input
          id={imageInputId}
          className="hero-image-input"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={importHeroImage}
          disabled={!canEditSite}
        />
      </div>
      {heroImageError ? <p className="hero-image-error">{heroImageError}</p> : null}
    </aside>
  );
}

export function HelpLabel({ className = "", help, label }) {
  if (!help) return <span>{label}</span>;

  return (
    <span className={`help-label ${className}`.trim()}>
      <span className="help-label-text">{label}</span>
      <span className="help-tooltip-anchor" tabIndex={0} aria-label={`${label} : ${help}`}>
        <Info size={14} aria-hidden="true" />
        <span className="help-tooltip" role="tooltip">{help}</span>
      </span>
    </span>
  );
}

export function PanelEyebrow({ help, icon: Icon, label }) {
  return (
    <div className="panel-eyebrow">
      <Icon size={18} />
      {help ? <HelpLabel label={label} help={help} /> : <span>{label}</span>}
    </div>
  );
}

export function RightRail(props) {
  return (
    <aside className="right-rail">
      <SosPanel
        acknowledgeSos={props.acknowledgeSos}
        currentUser={props.currentUser}
        sosAlerts={props.sosAlerts}
        sosError={props.sosError}
        sosForm={props.sosForm}
        sosRealtimeStatus={props.sosRealtimeStatus}
        setSosForm={props.setSosForm}
        sendSos={props.sendSos}
      />
      <TranslationPanel
        translateOn={props.translateOn}
        setTranslateOn={props.setTranslateOn}
        targetLanguage={props.targetLanguage}
        setTargetLanguage={props.setTargetLanguage}
      />
      <DiplomacyMini diplomacyRelations={props.diplomacyRelations} />
      <BankMini
        bankError={props.bankError}
        currentUser={props.currentUser}
        bankRequests={props.bankRequests}
        bankStock={props.bankStock}
        bankMovements={props.bankMovements}
        updateBankRequestStatus={props.updateBankRequestStatus}
      />
      <PermissionsMini />
    </aside>
  );
}

export function SosPanel({
  acknowledgeSos,
  currentUser,
  sosAlerts = [],
  sosError = "",
  sosForm = {},
  sosRealtimeStatus = "API requise",
  setSosForm,
  sendSos,
}) {
  const sosFieldsId = useId();
  const [showSosFields, setShowSosFields] = useState(false);
  const normalizedAlerts = sosAlerts.map(normalizeSosAlert);
  const activeAlerts = normalizedAlerts.filter((alert) => alert.status === "active").slice(0, 3);
  const latestAlert = activeAlerts[0] || normalizedAlerts[0];
  const callKind = normalizeSosCallKind(sosForm.callKind);
  const callConfig = getSosCallConfig(callKind);
  const CallIcon = callConfig.icon;
  const attackType = String(sosForm.type || "Rallye").trim() || "Rallye";
  const targetLabel = String(sosForm.target || "Cible non precisee").trim();
  const coordinateLabel = [sosForm.x ? `X ${sosForm.x}` : "", sosForm.y ? `Y ${sosForm.y}` : ""].filter(Boolean).join(" · ");
  const detailsPreview = String(sosForm.details || "").trim() || getSosFallbackMessage(callKind, attackType, targetLabel);
  const updateCallKind = (nextCallKind) => {
    setSosForm((current) => ({ ...current, callKind: nextCallKind }));
  };

  return (
    <section className={`panel alert-panel sos-call-${callKind}`}>
      <PanelHeader icon={CallIcon} title={callConfig.title} meta={`${activeAlerts.length} actif · ${sosRealtimeStatus}`} />
      <div className="sos-call-toggle" role="group" aria-label="Type d'appel">
        {SOS_CALL_OPTIONS.map((option) => {
          const OptionIcon = option.icon;
          return (
            <button
              className={`sos-call-button is-${option.id}${option.id === callKind ? " is-active" : ""}`}
              key={option.id}
              type="button"
              onClick={() => updateCallKind(option.id)}
              aria-pressed={option.id === callKind}
            >
              <OptionIcon size={16} />
              {option.label}
            </button>
          );
        })}
      </div>
      <div className="sos-fast-card">
        <span>{callConfig.readyLabel}</span>
        <strong>
          {callConfig.label} · {attackType} · {targetLabel}
        </strong>
        <small>{coordinateLabel || "Coordonnees non precisees"}</small>
        <p>{detailsPreview}</p>
      </div>
      <div className="sos-fast-actions">
        <button className="danger-action sos-send-now" type="button" onClick={sendSos}>
          <CallIcon size={18} />
          {callConfig.actionLabel}
        </button>
        <button
          className="ghost-action sos-edit-toggle"
          type="button"
          onClick={() => setShowSosFields((current) => !current)}
          aria-expanded={showSosFields}
          aria-controls={sosFieldsId}
        >
          <SlidersHorizontal size={15} />
          Modifier
        </button>
      </div>
      <div className="sos-edit-panel" id={sosFieldsId} hidden={!showSosFields}>
        <label className="form-row">
          <span>Cible attaquee</span>
          <input
            value={sosForm.target || ""}
            onChange={(event) => setSosForm((current) => ({ ...current, target: event.target.value }))}
          />
        </label>
        <div className="coordinate-grid">
          <label className="form-row">
            <span>X</span>
            <input
              inputMode="numeric"
              value={sosForm.x || ""}
              onChange={(event) => setSosForm((current) => ({ ...current, x: event.target.value }))}
            />
          </label>
          <label className="form-row">
            <span>Y</span>
            <input
              inputMode="numeric"
              value={sosForm.y || ""}
              onChange={(event) => setSosForm((current) => ({ ...current, y: event.target.value }))}
            />
          </label>
        </div>
        <label className="form-row">
          <span>Signal tactique</span>
          <select
            value={sosForm.type || "Rallye"}
            onChange={(event) => setSosForm((current) => ({ ...current, type: event.target.value }))}
          >
            <option>Rallye</option>
            <option>Ravage</option>
            <option>Solo</option>
            <option>Scout</option>
          </select>
        </label>
        <label className="form-row">
          <span>Details</span>
          <textarea
            value={sosForm.details || ""}
            onChange={(event) => setSosForm((current) => ({ ...current, details: event.target.value }))}
          />
        </label>
      </div>
      {sosError ? <p className="sync-warning">{sosError}</p> : null}
      <div className="sos-alert-list">
        {activeAlerts.length ? (
          activeAlerts.map((alert) => {
            const alertCallConfig = getSosCallConfig(alert.callKind);
            const alertCallKind = normalizeSosCallKind(alert.callKind);
            return (
              <article className={`sos-alert-card sos-call-${alertCallKind}`} key={alert.id}>
                <header>
                  <span>
                    <strong>
                      {alertCallConfig.label} · {alert.attackType}
                    </strong>
                    <small>{formatSosTime(alert.createdAt)} · {alert.createdByName || alert.by}</small>
                  </span>
                  <em>{alert.targetLabel}</em>
                </header>
                <p>
                  X:{alert.targetX ?? "?"} Y:{alert.targetY ?? "?"} · {alert.details}
                </p>
                <div className="sos-ack-summary" aria-label="Reponses SOS">
                  <span>Vu {alert.acknowledgementSummary.seen}</span>
                  <span>En route {alert.acknowledgementSummary.joining}</span>
                  <span>Impossible {alert.acknowledgementSummary.cannotJoin}</span>
                </div>
                <div className="sos-ack-actions">
                  {["seen", "joining", "cannot_join"].map((response) => (
                    <button
                      key={response}
                      type="button"
                      className={alert.myAcknowledgement?.response === response ? "is-active" : ""}
                      onClick={() => acknowledgeSos?.(alert.id, response)}
                      aria-pressed={alert.myAcknowledgement?.response === response}
                    >
                      {getSosAckLabel(response)}
                    </button>
                  ))}
                </div>
              </article>
            );
          })
        ) : (
          <p className="rail-note">Aucun SOS actif pour le moment.</p>
        )}
      </div>
      <p className="rail-note">Dernier appel envoye par {latestAlert?.by || latestAlert?.createdByName || "personne"}</p>
    </section>
  );
}

export function PermissionsMini() {
  return (
    <section className="panel mini-panel">
      <PanelHeader icon={Shield} title="Permissions par role" meta="Voir tous les roles" />
      <div className="permission-list">
        {permissionRoles.slice(0, 5).map((role) => (
          <div key={role.role} className="permission-row">
            <RolePill role={role.role} />
            <span>
              {role.modules.length ? (
                role.modules.slice(0, 4).map((module) => (
                  <em key={module}>{module}</em>
                ))
              ) : (
                <em>Accès membre</em>
              )}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

// Shared because these helpers are consumed across multiple GuildOps domains:
// guild identity/merge labels, public routing/slugs, pagination, ID de-duplication,
// language/search normalization, API UUID/guild guards, realtime parsing, coordinates,
// chat timestamps, and generic collection/API-payload utilities.
import {
  siteSectionMeta
} from "../../config/moduleRegistry.js";
import {
  slugify
} from "../guildSiteStore.js";

export function getGuildKey(guild) {
  if (!guild) return "";
  return guild.id || `${guild.name || "guild"}:${guild.realm || guild.server || "world"}`;
}

export function getGuildLabel(guild) {
  if (!guild) return "Guilde";
  return [guild.name, guild.game, guild.realm || guild.server].filter(Boolean).join(" · ");
}

export function getMergeDecisionLabel(decision) {
  const labels = {
    merge: "Fusionner",
    keep_both: "Garder",
    ignore: "Ignorer",
  };

  return labels[decision] || decision;
}

export function createLocalPagination(total = 0, page = 1, limit = 20) {
  const safeTotal = Math.max(0, Number(total || 0));
  const safeLimit = Math.max(1, Number(limit || 20));
  const safePage = Math.max(1, Number(page || 1));

  return {
    page: safePage,
    limit: safeLimit,
    total: safeTotal,
    totalPages: Math.max(1, Math.ceil(safeTotal / safeLimit)),
    hasNextPage: safePage * safeLimit < safeTotal,
    hasPreviousPage: safePage > 1,
  };
}

export function appendUniqueById(current = [], additions = []) {
  const seen = new Set(current.map((item) => item.id));
  const uniqueAdditions = additions.filter((item) => item?.id && !seen.has(item.id));
  return [...current, ...uniqueAdditions];
}

export function prependUniqueById(current = [], additions = []) {
  const seen = new Set(current.map((item) => item.id));
  const uniqueAdditions = additions.filter((item) => item?.id && !seen.has(item.id));
  return [...uniqueAdditions, ...current];
}

export function getPublicGuildSlug(guild = {}, siteDraft = {}) {
  return slugify(guild.publicSlug || guild.public_slug || guild.slug || siteDraft.slug || siteDraft.guildName || guild.name);
}

export function normalizeLanguageChoice(value) {
  const normalized = String(value || "FR").trim().split(" ")[0].replace("_", "-").toUpperCase();
  if (normalized === "AUTO") return "AUTO";
  return /^[A-Z]{2,3}(?:-[A-Z]{2})?$/.test(normalized) ? normalized : "FR";
}

export function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function getVisibleSiteSections(sections = {}) {
  return siteSectionMeta.filter((section) => Boolean(sections[section.key]));
}

export function getEnabledSiteSections(sections = {}) {
  return getVisibleSiteSections(sections);
}

export function getPublicRouteSlug(pathname) {
  const match = /^\/g\/([^/?#]+)/.exec(pathname);
  return match ? slugify(decodeURIComponent(match[1])) : "";
}

export function getPublicRouteSegment(pathname) {
  const match = /^\/g\/[^/?#]+(?:\/([^?#]+))?/.exec(pathname);
  if (!match?.[1]) return "";

  const segment = decodeURIComponent(match[1])
    .split("/")
    .filter(Boolean)
    .join("-");

  return slugify(segment);
}

export function getApiGuildId(guild) {
  const guildId = guild?.id || guild?.guildId;
  return isUuid(guildId) ? guildId : "";
}

export function isUuid(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function parseRealtimeEvent(event) {
  try {
    return JSON.parse(event?.data || "{}");
  } catch {
    return {};
  }
}

export function parseCoordinate(value) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function formatChatTime(message = {}) {
  if (!message.createdAt) return "";
  const date = new Date(message.createdAt);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(date);
}

export function upsertById(list = [], item = {}) {
  if (!item.id) return list;
  return [item, ...list.filter((entry) => entry.id !== item.id)];
}

export function cleanApiPayload(payload) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
}

export function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

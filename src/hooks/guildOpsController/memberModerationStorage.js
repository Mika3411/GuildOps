import {
  slugify
} from "../../lib/guildSiteStore.js";

const MEMBERSHIP_REQUESTS_STORAGE_KEY = "guildops:membership-requests:v1";
const MEMBER_BLOCKS_STORAGE_KEY = "guildops:member-blocks:v1";

export function loadMembershipRequests() {
  if (typeof window === "undefined" || !window.localStorage) return [];

  try {
    const requests = JSON.parse(window.localStorage.getItem(MEMBERSHIP_REQUESTS_STORAGE_KEY) || "[]");
    return Array.isArray(requests) ? requests.map(normalizeMembershipRequest).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function saveMembershipRequests(requests = []) {
  const normalizedRequests = requests.map(normalizeMembershipRequest).filter(Boolean);

  if (typeof window !== "undefined" && window.localStorage) {
    window.localStorage.setItem(MEMBERSHIP_REQUESTS_STORAGE_KEY, JSON.stringify(normalizedRequests));
  }

  return normalizedRequests;
}

export function normalizeMembershipRequest(request = {}) {
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

export function loadMemberBlocks() {
  if (typeof window === "undefined" || !window.localStorage) return [];

  try {
    const blocks = JSON.parse(window.localStorage.getItem(MEMBER_BLOCKS_STORAGE_KEY) || "[]");
    return Array.isArray(blocks) ? blocks.map(normalizeMemberBlock).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function saveMemberBlocks(blocks = []) {
  const normalizedBlocks = blocks.map(normalizeMemberBlock).filter(Boolean);

  if (typeof window !== "undefined" && window.localStorage) {
    window.localStorage.setItem(MEMBER_BLOCKS_STORAGE_KEY, JSON.stringify(normalizedBlocks));
  }

  return normalizedBlocks;
}

export function normalizeMemberBlock(block = {}) {
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

export function isBlockedForGuild(blocks = [], { guildId = "", guildSlug = "", nickname = "", userId = "" } = {}) {
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

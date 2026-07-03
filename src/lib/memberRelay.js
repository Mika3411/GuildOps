const MEMBER_RELAY_STORAGE_PREFIX = "guildops:member-relay:v1:";
const MEMBER_RELAY_TOKEN_LENGTH = 28;

function canUseStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function sanitizeRelayPart(value, fallback = "member") {
  const normalized = String(value || fallback)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || fallback;
}

function randomToken(length = MEMBER_RELAY_TOKEN_LENGTH) {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-";
  const bytes = new Uint8Array(length);

  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * alphabet.length);
    }
  }

  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function getRelayStoreKey(guildSlug) {
  return `${MEMBER_RELAY_STORAGE_PREFIX}${sanitizeRelayPart(guildSlug, "guild")}`;
}

function readRelayStore(guildSlug) {
  if (!canUseStorage()) return {};

  try {
    const stored = JSON.parse(window.localStorage.getItem(getRelayStoreKey(guildSlug)) || "{}");
    return stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
  } catch {
    return {};
  }
}

function writeRelayStore(guildSlug, store) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(getRelayStoreKey(guildSlug), JSON.stringify(store));
}

export function getMemberRelay(member = {}, guildSlug = "") {
  const memberKey = sanitizeRelayPart(member.id || member.name || member.nickname, "member");
  const store = readRelayStore(guildSlug);
  const existing = store[memberKey];

  if (existing?.relayId && existing?.token) {
    return existing;
  }

  const relay = {
    relayId: `${sanitizeRelayPart(guildSlug, "guild")}-${memberKey}-${randomToken(10)}`,
    token: randomToken(),
    createdAt: new Date().toISOString(),
  };

  writeRelayStore(guildSlug, {
    ...store,
    [memberKey]: relay,
  });

  return relay;
}

export function attachMemberRelays(members = [], guildSlug = "") {
  return members.map((member) => {
    const relay = getMemberRelay(member, guildSlug);

    return {
      ...member,
      relayId: relay.relayId,
      relayToken: relay.token,
    };
  });
}

export function getMemberRelayPath(guildSlug = "", member = {}) {
  return `/g/${sanitizeRelayPart(guildSlug, "guild")}/m/${encodeURIComponent(member.relayId || getMemberRelay(member, guildSlug).relayId)}`;
}

export function loadMemberRelayDispatches(guildSlug = "") {
  if (!canUseStorage()) return [];

  try {
    const stored = JSON.parse(window.localStorage.getItem(`${getRelayStoreKey(guildSlug)}:dispatches`) || "[]");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

export function saveMemberRelayDispatch(guildSlug = "", dispatch = {}) {
  const nextDispatch = {
    id: dispatch.id || `relay-dispatch-${Date.now()}`,
    createdAt: dispatch.createdAt || new Date().toISOString(),
    ...dispatch,
  };

  if (!canUseStorage()) return nextDispatch;

  const current = loadMemberRelayDispatches(guildSlug);
  window.localStorage.setItem(`${getRelayStoreKey(guildSlug)}:dispatches`, JSON.stringify([nextDispatch, ...current].slice(0, 30)));
  return nextDispatch;
}

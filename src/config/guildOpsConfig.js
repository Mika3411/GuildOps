import {
  getGuildOpsMobileNavItems,
  getGuildOpsNavItems,
} from "./moduleRegistry.js";

export * from "./moduleRegistry.js";

export const navItems = getGuildOpsNavItems();

export const mobileNav = getGuildOpsMobileNavItems();

export const GAME_OPTIONS = ["Whiteout Survival", "Rise of Kingdoms", "Evony", "State of Survival", "Lords Mobile"];

export const REALM_CODE_MAX_LENGTH = 18;

export const GAME_REALM_PREFIXES = Object.freeze({
  "Whiteout Survival": "S",
  "Rise of Kingdoms": "K",
  Evony: "S",
  "State of Survival": "S",
  "Lords Mobile": "K",
});

const KNOWN_REALM_PREFIXES = new Set(Object.values(GAME_REALM_PREFIXES));

export const LANGUAGE_OPTIONS = ["FR", "EN", "ES", "FR/EN"];

export const PLAY_STYLE_OPTIONS = ["Guerre organisee", "Diplomatie", "NAP strict", "Farm + war", "Casual organise", "KvK intense"];

export const bankRequestStatusLabels = {
  pending: "En attente",
  approved: "Approuvee",
  refused: "Refusee",
  fulfilled: "Livree",
  cancelled: "Annulee",
};

export const checkinStatuses = ["Confirme", "Peut-etre", "Absent"];

export const eventStatusKeys = ["allianceWar", "fortress", "heroStage", "bearHunt"];

export const eventColors = ["red", "blue", "violet", "green", "cyan"];

export function getGameRealmPrefix(gameName) {
  return GAME_REALM_PREFIXES[gameName] || "S";
}

export function getRealmPlaceholderForGame(gameName) {
  return `${getGameRealmPrefix(gameName)}1287`;
}

export function normalizeRealmCodeForGame(value, gameName, maxLength = REALM_CODE_MAX_LENGTH) {
  const prefix = getGameRealmPrefix(gameName);
  const normalizedValue = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9-]/g, "");

  if (!normalizedValue) return prefix;

  const suffix = normalizedValue.startsWith(prefix)
    ? normalizedValue.slice(prefix.length)
    : getRealmSuffixWithoutForeignPrefix(normalizedValue);

  return `${prefix}${suffix}`.slice(0, maxLength);
}

function getRealmSuffixWithoutForeignPrefix(value) {
  const firstCharacter = value[0];
  const hasKnownForeignPrefix = /^[A-Z]$/.test(firstCharacter) && KNOWN_REALM_PREFIXES.has(firstCharacter);
  const hasLegacyLetterPrefix = /^[A-Z][0-9]/.test(value);

  return hasKnownForeignPrefix || hasLegacyLetterPrefix ? value.slice(1) : value;
}

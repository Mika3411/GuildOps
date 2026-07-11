const PUSH_OPT_IN_STORAGE_KEY = "guildops.pendingPushOptInEmail";

export function rememberPendingPushOptIn(email) {
  const normalizedEmail = normalizePushOptInEmail(email);
  if (!normalizedEmail || typeof window === "undefined") return;

  window.localStorage.setItem(PUSH_OPT_IN_STORAGE_KEY, normalizedEmail);
}

export function hasPendingPushOptIn(email) {
  const normalizedEmail = normalizePushOptInEmail(email);
  if (!normalizedEmail || typeof window === "undefined") return false;

  return window.localStorage.getItem(PUSH_OPT_IN_STORAGE_KEY) === normalizedEmail;
}

export function clearPendingPushOptIn(email) {
  if (!hasPendingPushOptIn(email)) return;
  window.localStorage.removeItem(PUSH_OPT_IN_STORAGE_KEY);
}

function normalizePushOptInEmail(email) {
  return String(email || "").trim().toLowerCase();
}

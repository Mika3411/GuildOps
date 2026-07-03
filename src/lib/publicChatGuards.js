export const PUBLIC_CHAT_LIMIT_LABEL = "3 msg / 30 s";

export function getPublicChatRateLimitDetails(error) {
  if (!error || error.status !== 429) return null;

  const details = error.payload?.error?.details || {};
  const retryAfterSeconds = Math.max(1, Number(details.retryAfterSeconds || 1));

  return {
    label: details.label || PUBLIC_CHAT_LIMIT_LABEL,
    retryAfterSeconds,
  };
}

export function formatPublicChatCooldown(seconds) {
  const safeSeconds = Math.max(1, Math.ceil(Number(seconds) || 1));
  return `Limite du chat atteinte. Reessaie dans ${safeSeconds} s.`;
}

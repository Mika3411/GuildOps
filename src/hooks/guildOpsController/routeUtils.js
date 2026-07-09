import {
  getMemberInviteToken,
  slugify
} from "../../lib/guildSiteStore.js";

export function getInviteRouteSlug(pathname) {
  const match = /^\/join\/([^/?#]+)/.exec(pathname);
  return match ? slugify(decodeURIComponent(match[1])) : "";
}

export function isActiveInviteLink() {
  return Boolean(getActiveInviteToken());
}

export function getActiveInviteToken() {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  return getMemberInviteToken(`${window.location.pathname}?invite=${params.get("invite") || ""}`);
}

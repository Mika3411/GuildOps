export const RBAC_PERMISSIONS = Object.freeze([
  "manage_site",
  "approve_members",
  "manage_events",
  "send_sos",
  "manage_diplomacy",
  "manage_bank",
  "moderate_forum",
  "manage_members",
  "manage_roles",
  "admin_all",
]);

export const RBAC_ROLE_DEFINITIONS = Object.freeze({
  membre: {
    code: "membre",
    label: "Membre",
    permissions: ["send_sos"],
  },
  officier: {
    code: "officier",
    label: "Officier",
    permissions: ["approve_members", "manage_events", "send_sos", "moderate_forum", "manage_members"],
  },
  diplomate: {
    code: "diplomate",
    label: "Diplomate",
    permissions: ["send_sos", "manage_diplomacy"],
  },
  banquier: {
    code: "banquier",
    label: "Banquier",
    permissions: ["send_sos", "manage_bank"],
  },
  admin: {
    code: "admin",
    label: "Admin",
    permissions: RBAC_PERMISSIONS,
  },
});

const ROLE_ALIASES = Object.freeze({
  leader: "admin",
  owner: "admin",
  "r4 - general": "officier",
  "r4 - strategiste": "officier",
  "r3 - officier": "officier",
  general: "officier",
  strategiste: "officier",
});

export function isKnownPermission(permission) {
  return RBAC_PERMISSIONS.includes(permission);
}

export function normalizeRoleCode(role) {
  const roleValue = typeof role === "string" ? role : role?.code || role?.role || role?.name || "";
  const normalized = roleValue.trim().toLowerCase();
  return ROLE_ALIASES[normalized] || normalized;
}

export function getSubjectRoles(subject) {
  if (!subject) return [];
  if (Array.isArray(subject)) return subject;
  if (Array.isArray(subject.roles)) return subject.roles;
  if (Array.isArray(subject.roleCodes)) return subject.roleCodes;
  if (Array.isArray(subject.membership?.roles)) return subject.membership.roles;
  if (Array.isArray(subject.guildMember?.roles)) return subject.guildMember.roles;
  if (subject.role) return [subject.role];
  if (subject.code) return [subject.code];
  return [];
}

export function getPermissionsForRoles(roles) {
  return new Set(
    roles
      .map(normalizeRoleCode)
      .flatMap((roleCode) => RBAC_ROLE_DEFINITIONS[roleCode]?.permissions || []),
  );
}

export function hasPermission(subject, permission) {
  if (!isKnownPermission(permission)) return false;
  const directPermissions = new Set(subject?.permissions || subject?.permissionKeys || []);
  if (directPermissions.has("admin_all") || directPermissions.has(permission)) return true;

  const rolePermissions = getPermissionsForRoles(getSubjectRoles(subject));
  return rolePermissions.has("admin_all") || rolePermissions.has(permission);
}

export const RBAC_PERMISSIONS = Object.freeze([
  "manage_site",
  "approve_members",
  "manage_events",
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
    color: "muted",
    permissions: [],
  },
  officier: {
    code: "officier",
    label: "Officier",
    color: "blue",
    permissions: ["approve_members", "manage_events", "moderate_forum", "manage_members"],
  },
  diplomate: {
    code: "diplomate",
    label: "Diplomate",
    color: "violet",
    permissions: ["manage_diplomacy"],
  },
  banquier: {
    code: "banquier",
    label: "Banquier",
    color: "amber",
    permissions: ["manage_bank"],
  },
  admin: {
    code: "admin",
    label: "Admin",
    color: "green",
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

const PERMISSION_LABELS = Object.freeze({
  manage_site: "Site",
  approve_members: "Adhésions",
  manage_events: "Events",
  manage_diplomacy: "Diplomatie",
  manage_bank: "Banque",
  moderate_forum: "Forum",
  manage_members: "Membres",
  manage_roles: "Roles",
  admin_all: "Admin global",
});

export const permissionRoles = Object.freeze(
  Object.values(RBAC_ROLE_DEFINITIONS).map((role) => ({
    role: role.label,
    code: role.code,
    modules: role.permissions.map((permission) => PERMISSION_LABELS[permission] || permission),
    permissions: role.permissions,
    color: role.color,
  })),
);

export function normalizeRoleCode(role) {
  const roleValue = typeof role === "string" ? role : role?.code || role?.role || role?.name || "";
  const normalized = roleValue.trim().toLowerCase();
  return ROLE_ALIASES[normalized] || normalized;
}

export function getRoleLabel(role) {
  const roleCode = normalizeRoleCode(role);
  return RBAC_ROLE_DEFINITIONS[roleCode]?.label || String(role || "Membre");
}

export function getRoleColor(role) {
  const roleCode = normalizeRoleCode(role);
  return RBAC_ROLE_DEFINITIONS[roleCode]?.color || "muted";
}

export function getPermissionLabel(permission) {
  return PERMISSION_LABELS[permission] || permission;
}

export function getSubjectRoles(subject) {
  if (!subject) return [];
  if (Array.isArray(subject)) return subject;
  if (Array.isArray(subject.roles)) return subject.roles;
  if (Array.isArray(subject.roleCodes)) return subject.roleCodes;
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

export function can(subject, permission) {
  if (!RBAC_PERMISSIONS.includes(permission)) return false;
  const permissions = getPermissionsForRoles(getSubjectRoles(subject));
  return permissions.has("admin_all") || permissions.has(permission);
}

export function cannot(subject, permission) {
  return !can(subject, permission);
}

export function getPermissionState(subject, permission) {
  const allowed = can(subject, permission);

  return {
    allowed,
    disabled: !allowed,
    hidden: !allowed,
    permission,
    reason: allowed ? "" : `Reserve aux roles avec ${getPermissionLabel(permission)}.`,
  };
}

export function getGuardProps(subject, permission, { mode = "disable" } = {}) {
  const state = getPermissionState(subject, permission);
  if (state.allowed) return {};
  if (mode === "hide") return { hidden: true, "aria-hidden": true };

  return {
    disabled: true,
    "aria-disabled": true,
    title: state.reason,
  };
}

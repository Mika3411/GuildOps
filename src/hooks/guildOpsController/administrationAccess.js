import {
  getAdministrationModules
} from "../../config/moduleRegistry.js";
import {
  can
} from "../../lib/rbac.js";

function getInitialAdministrationModuleIds(member) {
  const hasGlobalAdministration = can(member, "admin_all");

  return getAdministrationModules()
    .filter((module) => {
      if (hasGlobalAdministration) return true;
      return module.permissionKeys.some((permission) => can(member, permission));
    })
    .map((module) => module.id);
}

export function createAdministrationAccess(members = []) {
  return Object.fromEntries(
    members.map((member) => [member.id, getInitialAdministrationModuleIds(member)]),
  );
}

export function normalizeAdministrationAccess(members = [], currentAccess = {}) {
  const validModuleIds = new Set(getAdministrationModules().map((module) => module.id));

  return Object.fromEntries(
    members.map((member) => {
      const storedModuleIds = Array.isArray(currentAccess[member.id])
        ? currentAccess[member.id].filter((moduleId) => validModuleIds.has(moduleId))
        : getInitialAdministrationModuleIds(member);

      return [member.id, [...new Set(storedModuleIds)]];
    }),
  );
}

export function sortAdministrationModuleIds(moduleIds = []) {
  const order = new Map(getAdministrationModules().map((module, index) => [module.id, index]));
  return [...new Set(moduleIds)]
    .filter((moduleId) => order.has(moduleId))
    .sort((left, right) => order.get(left) - order.get(right));
}

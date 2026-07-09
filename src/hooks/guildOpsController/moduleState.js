import {
  getDefaultEnabledModuleIds,
  getGuildOpsModule,
  guildOpsModules
} from "../../config/moduleRegistry.js";

export function collectModuleActivationIds(moduleId, result = new Set()) {
  const module = getGuildOpsModule(moduleId);
  if (!module || result.has(module.id)) return result;

  module.dependencies.forEach((dependencyId) => collectModuleActivationIds(dependencyId, result));
  result.add(module.id);
  return result;
}

export function collectModuleDisableIds(moduleId, enabledModuleIds, result = new Set()) {
  if (result.has(moduleId)) return result;

  result.add(moduleId);
  const enabledSet = new Set(enabledModuleIds);
  guildOpsModules.forEach((module) => {
    if (enabledSet.has(module.id) && module.dependencies.includes(moduleId)) {
      collectModuleDisableIds(module.id, enabledModuleIds, result);
    }
  });

  return result;
}

export function normalizeEnabledModuleIds(moduleIds) {
  const defaults = getDefaultEnabledModuleIds();
  if (!Array.isArray(moduleIds)) return defaults;

  const next = new Set(defaults);
  moduleIds.forEach((moduleId) => {
    if (getGuildOpsModule(moduleId)) {
      next.add(moduleId);
    }
  });

  return guildOpsModules.filter((module) => next.has(module.id)).map((module) => module.id);
}

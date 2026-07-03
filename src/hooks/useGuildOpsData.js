import {
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";
import {
  guildOpsMockData
} from "../data/guildOpsMockData.js";
import {
  isApiConfigured
} from "../lib/apiClient.js";
import {
  guildOpsApi
} from "../lib/guildOpsApi.js";
import {
  defaultSiteSections,
  getDefaultEnabledModuleIds,
  guildOpsModuleById
} from "../config/moduleRegistry.js";

export const arrayKeys = [
  "guilds",
  "events",
  "members",
  "diplomacyRows",
  "napAgreements",
  "coordinates",
  "diplomacyAuditLog",
  "bankRequests",
  "bankResources",
  "bankMovements",
  "bankHistory",
  "duplicateSuggestions",
  "permissionRoles",
  "forumThreads",
  "publicChat",
  "internalMessages",
  "sosAlerts",
];

export function createEmptyGuildOpsData() {
  return {
    authUser: null,
    enabledModules: getDefaultEnabledModuleIds(),
    guilds: [],
    events: [],
    members: [],
    diplomacyRows: [],
    napAgreements: [],
    coordinates: [],
    diplomacyAuditLog: [],
    bankRequests: [],
    bankResources: [],
    bankMovements: [],
    bankHistory: [],
    duplicateSuggestions: [],
    permissionRoles: [],
    forumThreads: [],
    publicChat: [],
    internalMessages: [],
    sosAlerts: [],
    sosForm: {
      target: "",
      x: "",
      y: "",
      type: "Rallye",
      details: "",
    },
    eventSummary: null,
    site: {
      published: false,
      url: "",
      name: "",
      guildName: "",
      game: "",
      realm: "",
      tagline: "",
      goal: "",
      objective: "",
      objectiveTag: "Operations",
      theme: "camp-nord",
      colors: {
        id: "cyan",
        accent: "#45d8f0",
        highlight: "#c8ff08",
        contrast: "#061015",
      },
      typography: {
        id: "inter",
        label: "Inter",
        fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif",
      },
      sections: defaultSiteSections,
      published: false,
    },
  };
}

export function useGuildOpsData({ enabled = true, reloadKey = 0 } = {}) {
  const apiEnabled = isApiConfigured();
  const [state, setState] = useState(() => ({
    data: apiEnabled ? createEmptyGuildOpsData() : guildOpsMockData,
    error: null,
    source: apiEnabled ? "api" : "mock",
    status: apiEnabled ? "idle" : "mock",
  }));

  const reload = useCallback(
    async ({ signal } = {}) => {
      if (!apiEnabled || !enabled) return null;

      setState((current) => ({ ...current, error: null, status: current.status === "ready" ? "refreshing" : "loading" }));

      try {
        const payload = await guildOpsApi.getMvpBootstrap({ signal });
        if (signal?.aborted) return null;
        setState({
          data: normalizeGuildOpsData(payload),
          error: null,
          source: "api",
          status: "ready",
        });
        return payload;
      } catch (error) {
        if (signal?.aborted) return null;
        setState({
          data: createEmptyGuildOpsData(),
          error,
          source: "api",
          status: "error",
        });
        return null;
      }
    },
    [apiEnabled, enabled],
  );

  useEffect(() => {
    if (!apiEnabled || !enabled) {
      if (apiEnabled) {
        setState({
          data: createEmptyGuildOpsData(),
          error: null,
          source: "api",
          status: "idle",
        });
      }
      return undefined;
    }

    const controller = new AbortController();
    void reload({ signal: controller.signal });

    return () => controller.abort();
  }, [apiEnabled, enabled, reload, reloadKey]);

  return useMemo(
    () => ({
      ...state,
      isFallback: !apiEnabled && state.source === "mock",
      isLoading: apiEnabled && ["idle", "loading"].includes(state.status),
      isRefreshing: apiEnabled && state.status === "refreshing",
      reload,
    }),
    [apiEnabled, reload, state],
  );
}

export function normalizeGuildOpsData(payload) {
  const raw = payload?.data || payload || {};
  const base = isApiConfigured() ? createEmptyGuildOpsData() : guildOpsMockData;
  const normalized = {
    ...base,
    ...raw,
    authUser: {
      ...(base.authUser || {}),
      ...(raw.authUser || raw.user || {}),
    },
    site: {
      ...base.site,
      ...(raw.site || raw.guildSite || {}),
    },
    sosForm: {
      ...base.sosForm,
      ...(raw.sosForm || {}),
    },
    enabledModules: normalizeEnabledModules(raw.enabledModules, base.enabledModules),
  };

  arrayKeys.forEach((key) => {
    normalized[key] = Array.isArray(raw[key]) ? raw[key] : base[key];
  });

  return normalized;
}

function normalizeEnabledModules(moduleIds, fallback = getDefaultEnabledModuleIds()) {
  if (!Array.isArray(moduleIds)) return fallback;

  const validModuleIds = moduleIds.filter((moduleId) => guildOpsModuleById[moduleId]);
  if (!validModuleIds.length) return fallback;

  return [...new Set([...getDefaultEnabledModuleIds(), ...validModuleIds])];
}

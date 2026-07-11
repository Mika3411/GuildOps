import {
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";
import {
  ApiError,
  clearCsrfToken,
  isApiConfigured,
  rememberCsrfToken
} from "../lib/apiClient.js";
import {
  guildOpsApi
} from "../lib/guildOpsApi.js";

export function useAuthSession() {
  const apiEnabled = isApiConfigured();
  const [state, setState] = useState(() => ({
    context: null,
    error: "",
    guilds: [],
    organizations: [],
    status: apiEnabled ? "loading" : "unconfigured",
    user: null,
  }));

  const applyPayload = useCallback((payload) => {
    rememberCsrfToken(payload?.csrfToken);
    setState({
      context: payload?.context || null,
      error: "",
      guilds: Array.isArray(payload?.guilds) ? payload.guilds : [],
      organizations: Array.isArray(payload?.organizations) ? payload.organizations : [],
      status: "authenticated",
      user: normalizeAuthUser(payload?.user),
    });
  }, []);

  const loadMe = useCallback(
    async ({ signal } = {}) => {
      if (!apiEnabled) return null;

      setState((current) => ({ ...current, status: current.user ? "refreshing" : "loading" }));

      try {
        const payload = await guildOpsApi.getMe({ signal });
        if (!signal?.aborted) applyPayload(payload);
        return payload;
      } catch (error) {
        if (signal?.aborted) return null;

        if (error instanceof ApiError && error.status === 401) {
          clearCsrfToken();
          setState({
            context: null,
            error: "",
            guilds: [],
            organizations: [],
            status: "unauthenticated",
            user: null,
          });
          return null;
        }

        setState((current) => ({
          ...current,
          error: error?.message || "Session indisponible.",
          status: current.user ? "authenticated" : "error",
        }));
        return null;
      }
    },
    [apiEnabled, applyPayload],
  );

  useEffect(() => {
    if (!apiEnabled) return undefined;

    const controller = new AbortController();
    void loadMe({ signal: controller.signal });
    return () => controller.abort();
  }, [apiEnabled, loadMe]);

  const login = useCallback(
    async (body) => {
      const payload = await guildOpsApi.login(body);
      applyPayload(payload);
      return payload;
    },
    [applyPayload],
  );

  const register = useCallback(
    async (body) => {
      const payload = await guildOpsApi.register(body);
      if (payload?.csrfToken && payload?.user) {
        applyPayload(payload);
      }
      return payload;
    },
    [applyPayload],
  );

  const resendVerification = useCallback(async (body) => guildOpsApi.resendVerification(body), []);

  const verifyEmail = useCallback(
    async (body) => {
      const payload = await guildOpsApi.verifyEmail(body);
      applyPayload(payload);
      return payload;
    },
    [applyPayload],
  );

  const logout = useCallback(async () => {
    try {
      await guildOpsApi.logout();
    } finally {
      clearCsrfToken();
      setState({
        context: null,
        error: "",
        guilds: [],
        organizations: [],
        status: "unauthenticated",
        user: null,
      });
    }
  }, []);

  const updateContext = useCallback(
    async (body) => {
      const payload = await guildOpsApi.updateActiveContext(body);
      applyPayload(payload);
      return payload;
    },
    [applyPayload],
  );

  const updateMe = useCallback(
    async (body) => {
      const payload = await guildOpsApi.updateMe(body);
      applyPayload(payload);
      return payload;
    },
    [applyPayload],
  );

  const changePassword = useCallback(async (body) => guildOpsApi.changePassword(body), []);

  const leavePublicGuild = useCallback(
    async (slug) => {
      const payload = await guildOpsApi.leavePublicGuild(slug);
      applyPayload(payload);
      return payload;
    },
    [applyPayload],
  );

  return useMemo(
    () => ({
      ...state,
      isApiEnabled: apiEnabled,
      isAuthenticated: apiEnabled && (state.status === "authenticated" || state.status === "refreshing"),
      isLoading: apiEnabled && state.status === "loading",
      requiresAuth: apiEnabled && state.status === "unauthenticated",
      changePassword,
      leavePublicGuild,
      login,
      logout,
      register,
      resendVerification,
      reload: loadMe,
      updateContext,
      updateMe,
      verifyEmail,
    }),
    [
      apiEnabled,
      changePassword,
      leavePublicGuild,
      loadMe,
      login,
      logout,
      register,
      resendVerification,
      state,
      updateContext,
      updateMe,
      verifyEmail,
    ],
  );
}

function normalizeAuthUser(user) {
  if (!user) return null;

  return {
    ...user,
    displayName: user.displayName || user.email || "GuildOps",
    initials: user.initials || getInitials(user.displayName || user.email || "GO"),
    preferredLanguage: user.preferredLanguage || "fr",
    role: user.role || user.roles?.[0] || "membre",
    roles: Array.isArray(user.roles) && user.roles.length ? user.roles : [user.role || "membre"],
  };
}

function getInitials(value) {
  return String(value)
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

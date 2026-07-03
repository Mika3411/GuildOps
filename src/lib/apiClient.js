const DEFAULT_API_PREFIX = "/api/v1";
const DEFAULT_TIMEOUT_MS = 8000;

export class ApiError extends Error {
  constructor(message, { status, payload } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

export const apiConfig = {
  baseUrl: trimTrailingSlash(import.meta.env.VITE_API_URL || ""),
  prefix: DEFAULT_API_PREFIX,
  realtimeMode: import.meta.env.VITE_REALTIME_MODE || "sse",
};

export function isApiConfigured() {
  return Boolean(apiConfig.baseUrl);
}

export async function apiRequest(path, options = {}) {
  const {
    body,
    headers,
    method = body === undefined ? "GET" : "POST",
    query,
    signal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();

  if (signal) {
    signal.addEventListener("abort", onAbort, { once: true });
  }

  try {
    const csrfToken = readCookie("guildops_csrf");
    const response = await fetch(buildUrl(path, query), {
      method,
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...getAuthHeaders(),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(isUnsafeMethod(method) && csrfToken ? { "x-csrf-token": csrfToken } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    const payload = await readPayload(response);

    if (!response.ok) {
      const apiError = payload?.error || {};
      throw new ApiError(apiError.message || payload?.message || `API request failed with ${response.status}`, {
        status: response.status,
        payload,
      });
    }

    return payload;
  } finally {
    window.clearTimeout(timeout);
    if (signal) {
      signal.removeEventListener("abort", onAbort);
    }
  }
}

export function buildUrl(path, query) {
  const normalizedPath = normalizeApiPath(path);
  const url = apiConfig.baseUrl
    ? new URL(normalizedPath, `${apiConfig.baseUrl}/`)
    : new URL(normalizedPath, window.location.origin);

  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    url.searchParams.set(key, String(value));
  });

  return url.toString();
}

function normalizeApiPath(path) {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return cleanPath.startsWith(apiConfig.prefix) ? cleanPath : `${apiConfig.prefix}${cleanPath}`;
}

async function readPayload(response) {
  if (response.status === 204) return null;

  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function getAuthHeaders() {
  const token = import.meta.env.VITE_API_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function isUnsafeMethod(method) {
  return !["GET", "HEAD", "OPTIONS"].includes(String(method || "GET").toUpperCase());
}

function readCookie(name) {
  if (typeof document === "undefined") return "";

  const prefix = `${encodeURIComponent(name)}=`;
  return document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length) || "";
}

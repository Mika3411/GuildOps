import type { CookieOptions, Response } from "express";
import { env } from "../config/env.js";
import type { SessionSecretPair } from "./sessions.js";

const cookiePath = "/";

export function setAuthCookies(res: Response, session: SessionSecretPair): void {
  const maxAge = session.expiresAt.getTime() - Date.now();
  const baseOptions = getBaseCookieOptions(maxAge);

  res.cookie(env.SESSION_COOKIE_NAME, session.sessionToken, {
    ...baseOptions,
    httpOnly: true
  });
  res.cookie(env.CSRF_COOKIE_NAME, session.csrfToken, {
    ...baseOptions,
    httpOnly: false
  });
}

export function clearAuthCookies(res: Response): void {
  const options = getBaseCookieOptions(0);

  res.clearCookie(env.SESSION_COOKIE_NAME, {
    ...options,
    httpOnly: true
  });
  res.clearCookie(env.CSRF_COOKIE_NAME, {
    ...options,
    httpOnly: false
  });
}

function getBaseCookieOptions(maxAge: number): CookieOptions {
  return {
    domain: env.COOKIE_DOMAIN || undefined,
    maxAge: Math.max(maxAge, 0),
    path: cookiePath,
    sameSite: env.isProduction ? "none" : "lax",
    secure: env.isProduction
  };
}

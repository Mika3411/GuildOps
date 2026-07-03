import { timingSafeEqual } from "node:crypto";
import type { RequestHandler, Request } from "express";
import { env } from "../config/env.js";
import { ForbiddenError } from "../http/errors.js";
import { hashCsrfToken } from "./sessions.js";

const csrfExemptPaths = new Set([
  "/api/v1/auth/login",
  "/api/v1/auth/register",
  "/api/v1/auth/resend-verification",
  "/api/v1/auth/verify-email"
]);
const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

export const csrfProtection: RequestHandler = (req, _res, next) => {
  try {
    if (!needsCsrfCheck(req)) {
      next();
      return;
    }

    const sessionToken = getCookie(req, env.SESSION_COOKIE_NAME);

    if (!sessionToken) {
      next();
      return;
    }

    assertCsrfPair(req);
    next();
  } catch (error) {
    next(error);
  }
};

export function assertRequestCsrf(req: Request, expectedCsrfHash: string | null | undefined): void {
  if (!needsCsrfCheck(req)) {
    return;
  }

  const headerToken = assertCsrfPair(req);

  if (!expectedCsrfHash || !safeEqual(hashCsrfToken(headerToken), expectedCsrfHash)) {
    throw new ForbiddenError("CSRF token is invalid");
  }
}

export function needsCsrfCheck(req: Request): boolean {
  return !safeMethods.has(req.method.toUpperCase()) && !csrfExemptPaths.has(req.path);
}

function assertCsrfPair(req: Request): string {
  const cookieToken = getCookie(req, env.CSRF_COOKIE_NAME);
  const headerToken = req.get(env.CSRF_HEADER_NAME) ?? req.get("x-csrf-token");

  if (!cookieToken || !headerToken || !safeEqual(cookieToken, headerToken)) {
    throw new ForbiddenError("CSRF token is missing or invalid");
  }

  return headerToken;
}

function getCookie(req: Request, name: string): string | undefined {
  const value = (req.cookies as Record<string, string | undefined> | undefined)?.[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

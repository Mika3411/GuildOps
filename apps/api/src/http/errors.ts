import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { env } from "../config/env.js";

type ErrorDetails = unknown;

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: ErrorDetails;
  readonly expose: boolean;

  constructor(status: number, code: string, message: string, details?: ErrorDetails, expose = true) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.expose = expose;
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Invalid request", details?: ErrorDetails) {
    super(400, "BAD_REQUEST", message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required", details?: ErrorDetails) {
    super(401, "UNAUTHORIZED", message, details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden", details?: ErrorDetails) {
    super(403, "FORBIDDEN", message, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found", details?: ErrorDetails) {
    super(404, "NOT_FOUND", message, details);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Resource conflict", details?: ErrorDetails) {
    super(409, "CONFLICT", message, details);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = "Too many requests", details?: ErrorDetails) {
    super(429, "RATE_LIMITED", message, details);
  }
}

export class ConfigurationError extends AppError {
  constructor(message = "Server configuration error", details?: ErrorDetails) {
    super(500, "CONFIGURATION_ERROR", message, details, false);
  }
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.originalUrl} not found`));
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const normalized = normalizeError(error);
  const message = normalized.expose || !env.isProduction ? normalized.message : "Internal server error";
  const payload: Record<string, unknown> = {
    error: {
      code: normalized.code,
      message,
      status: normalized.status,
      requestId: res.locals.requestId
    }
  };

  if (normalized.details !== undefined && (normalized.expose || !env.isProduction)) {
    payload.error = {
      ...(payload.error as Record<string, unknown>),
      details: normalized.details
    };
  }

  if (normalized.status >= 500) {
    console.error(error);
  }

  res.status(normalized.status).json(payload);
};

function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof ZodError) {
    return new BadRequestError("Input validation failed", error.flatten());
  }

  if (isRecord(error) && error.type === "entity.parse.failed") {
    return new BadRequestError("Malformed JSON body");
  }

  if (isRecord(error) && typeof error.code === "string") {
    if (error.code === "23505") {
      return new ConflictError("A resource with these unique values already exists", {
        constraint: error.constraint
      });
    }

    if (error.code === "23503") {
      return new BadRequestError("Referenced resource does not exist", {
        constraint: error.constraint
      });
    }

    if (error.code === "22P02") {
      return new BadRequestError("Invalid input syntax");
    }
  }

  const message = error instanceof Error ? error.message : "Unexpected server error";
  return new AppError(500, "INTERNAL_SERVER_ERROR", message, undefined, false);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

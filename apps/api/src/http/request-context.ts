import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

export const requestContext: RequestHandler = (req, res, next) => {
  const incomingRequestId = req.get("x-request-id");
  const requestId = incomingRequestId && incomingRequestId.length <= 128 ? incomingRequestId : randomUUID();

  res.locals.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  next();
};

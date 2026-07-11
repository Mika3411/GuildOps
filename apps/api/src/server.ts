import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { isCorsOriginAllowed } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./http/errors.js";
import { requestContext } from "./http/request-context.js";
import { v1Router } from "./routes/v1.js";
import { csrfProtection } from "./security/csrf.js";

export function createApp(): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(requestContext);
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" }
    })
  );
  app.use(
    cors({
      origin: (origin, callback) => {
        callback(null, isCorsOriginAllowed(origin));
      },
      credentials: true
    })
  );
  app.use(cookieParser());
  app.use(csrfProtection);
  app.use(
    compression({
      filter: (req, res) => {
        if (req.headers.accept?.includes("text/event-stream")) return false;
        return compression.filter(req, res);
      }
    })
  );
  app.use(express.json({ limit: "3mb" }));
  app.use(express.urlencoded({ extended: false, limit: "3mb" }));

  morgan.token("request-id", (_req, res) => String(res.getHeader("x-request-id") ?? "-"));
  app.use(morgan(":method :url :status :res[content-length] - :response-time ms :request-id"));

  app.get("/healthz", (_req, res) => {
    res.json({
      ok: true,
      service: "guildops-api",
      uptimeSeconds: Math.round(process.uptime()),
      checkedAt: new Date().toISOString()
    });
  });

  app.use("/api/v1", v1Router);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

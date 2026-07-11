import { Router } from "express";
import { getRuntimeConfigurationStatus } from "../config/env.js";
import { checkDatabase } from "../db/pool.js";
import { asyncHandler } from "../http/async-handler.js";
import { alertsRouter } from "./alerts.routes.js";
import { authRouter } from "./auth.routes.js";
import { bankRouter } from "./bank.routes.js";
import { diplomacyRouter } from "./diplomacy.routes.js";
import { eventsRouter } from "./events.routes.js";
import { forumRouter } from "./forum.routes.js";
import { guildMergesRouter } from "./guild-merges.routes.js";
import { guildsRouter } from "./guilds.routes.js";
import { messagesRouter } from "./messages.routes.js";
import { meRouter } from "./me.routes.js";
import { mvpRouter } from "./mvp.routes.js";
import { notificationsRouter } from "./notifications.routes.js";
import { publicRouter } from "./public.routes.js";

export const v1Router = Router();

v1Router.get("/", (_req, res) => {
  res.json({
    service: "guildops-api",
    version: "v1",
    status: "ok",
    routes: {
      auth: "/api/v1/auth",
      me: "/api/v1/me",
      guilds: "/api/v1/guilds",
      guildMerges: "/api/v1/guilds/:guildId/merge-requests",
      messages: "/api/v1/guilds/:guildId/messages",
      notifications: "/api/v1/guilds/:guildId/notifications",
      forum: "/api/v1/guilds/:guildId/forum",
      diplomacy: "/api/v1/guilds/:guildId/diplomacy",
      mvpBootstrap: "/api/v1/mvp/bootstrap",
      publicDirectory: "/api/v1/directory/guilds",
      publicGuilds: "/api/v1/public/guilds/:slug",
      publicBank: "/api/v1/public/guilds/:slug/bank",
      readiness: "/api/v1/readyz"
    }
  });
});

v1Router.get(
  "/readyz",
  asyncHandler(async (_req, res) => {
    const configuration = getRuntimeConfigurationStatus();

    if (!configuration.ok) {
      res.status(503).json({
        ok: false,
        configuration,
        checkedAt: new Date().toISOString()
      });
      return;
    }

    const database = await checkDatabase();
    res.json({
      ok: true,
      configuration,
      database,
      checkedAt: new Date().toISOString()
    });
  })
);

v1Router.use("/auth", authRouter);
v1Router.use(meRouter);
v1Router.use(mvpRouter);
v1Router.use(publicRouter);
v1Router.use(notificationsRouter);
v1Router.use(messagesRouter);
v1Router.use(guildMergesRouter);
v1Router.use(guildsRouter);
v1Router.use(eventsRouter);
v1Router.use(diplomacyRouter);
v1Router.use(forumRouter);
v1Router.use(alertsRouter);
v1Router.use(bankRouter);

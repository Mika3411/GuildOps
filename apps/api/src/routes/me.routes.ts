import { Router } from "express";
import { z } from "zod";
import { database } from "../db/pool.js";
import { asyncHandler } from "../http/async-handler.js";
import { BadRequestError, UnauthorizedError } from "../http/errors.js";
import { validate } from "../http/validate.js";
import { getAuth, requireAuth } from "../security/auth.js";
import { hashPassword, verifyPassword } from "../security/passwords.js";
import { uuidSchema } from "./helpers.js";
import { buildMePayload, setActiveContext } from "./me.service.js";

export const meRouter = Router();

const contextBodySchema = z
  .object({
    activeOrganizationId: uuidSchema.nullable().optional(),
    activeGuildId: uuidSchema.nullable().optional()
  })
  .strict();

const updateMeBodySchema = z
  .object({
    displayName: z.string().trim().min(2).max(80).optional(),
    preferredLanguage: z.string().trim().min(2).max(12).optional()
  })
  .strict();

const updatePasswordBodySchema = z
  .object({
    currentPassword: z.string().min(1).max(200),
    newPassword: z.string().min(10).max(200)
  })
  .strict();

export const getMeHandler = [
  requireAuth,
  asyncHandler(async (_req, res) => {
    const auth = getAuth(res);
    res.json(await buildMePayload(database, auth.user.id, auth.sessionId));
  })
];

meRouter.get("/me", ...getMeHandler);

meRouter.patch(
  "/me",
  requireAuth,
  validate({ body: updateMeBodySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const body = req.body as z.infer<typeof updateMeBodySchema>;
    const updates: string[] = [];
    const params: unknown[] = [auth.user.id];

    if (body.displayName !== undefined) {
      params.push(body.displayName);
      updates.push(`display_name = $${params.length}`);
    }

    if (body.preferredLanguage !== undefined) {
      params.push(body.preferredLanguage.toLowerCase());
      updates.push(`preferred_language = $${params.length}`);
    }

    if (updates.length) {
      await database.query(`UPDATE users SET ${updates.join(", ")} WHERE id = $1`, params);
    }

    res.json(await buildMePayload(database, auth.user.id, auth.sessionId));
  })
);

meRouter.patch(
  "/me/password",
  requireAuth,
  validate({ body: updatePasswordBodySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const body = req.body as z.infer<typeof updatePasswordBodySchema>;
    const userResult = await database.query<{ password_hash: string }>(
      `
        SELECT password_hash
        FROM users
        WHERE id = $1
          AND disabled_at IS NULL
        LIMIT 1
      `,
      [auth.user.id]
    );
    const user = userResult.rows[0];

    if (!user?.password_hash) {
      throw new BadRequestError("Compte indisponible.");
    }

    if (!(await verifyPassword(body.currentPassword, user.password_hash))) {
      throw new UnauthorizedError("Mot de passe actuel incorrect.");
    }

    await database.query("UPDATE users SET password_hash = $2 WHERE id = $1", [
      auth.user.id,
      await hashPassword(body.newPassword)
    ]);

    res.status(204).send();
  })
);

meRouter.patch(
  "/me/context",
  requireAuth,
  validate({ body: contextBodySchema }),
  asyncHandler(async (req, res) => {
    const auth = getAuth(res);
    const body = req.body as z.infer<typeof contextBodySchema>;

    await setActiveContext(database, {
      sessionId: auth.sessionId,
      userId: auth.user.id,
      activeOrganizationId: body.activeOrganizationId,
      activeGuildId: body.activeGuildId
    });

    res.json(await buildMePayload(database, auth.user.id, auth.sessionId));
  })
);

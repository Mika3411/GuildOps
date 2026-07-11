import assert from "node:assert/strict";
import { test } from "node:test";
import type { QueryResult, QueryResultRow } from "pg";
import type { Queryable } from "../db/pool.js";

process.env.DATABASE_URL ??= "postgres://localhost/guildops_api_contracts_test";
process.env.NODE_ENV = "test";
process.env.SESSION_SECRET ??= "guildops-api-contracts-test-secret";

const { normalizeIncomingBankStatus, normalizeStoredBankStatus } = await import("./bank.routes.js");
const { canSendSos } = await import("./alerts.routes.js");
const { canApproveMembershipRequests } = await import("./guilds.routes.js");
const { canManageEvents } = await import("./events.routes.js");
const {
  isGuildModuleActive,
  listActiveGuildModuleKeys,
  normalizeGuildModuleKeys,
  normalizeGuildModuleRow,
  seedDefaultGuildModules,
  syncGuildModules,
  withDefaultGuildModuleKeys
} = await import("./guild-modules.service.js");
const { buildRegistrationInvitationUrl } = await import("../notifications/email.js");
const { createGuildNotificationsForPermission, createGuildNotificationsForUsers } = await import("../notifications/notifications.js");
const { findPublicChatGuildBySlug, toMessageRecipientResource } = await import("./messages.routes.js");
const { toPublicBankSnapshotResource, toPublicGuildSiteResource } = await import("./public.routes.js");
const { assertRequestCsrf, needsCsrfCheck } = await import("../security/csrf.js");
const { hashCsrfToken } = await import("../security/sessions.js");
const { getRuntimeConfigurationStatus, isCorsOriginAllowed } = await import("../config/env.js");
const { formatAuthRateLimitMessage } = await import("./auth.routes.js");

test("bank request status keeps refused as the stored API status", () => {
  assert.equal(normalizeIncomingBankStatus("refused"), "refused");
  assert.equal(normalizeIncomingBankStatus("rejected"), "refused");
  assert.equal(normalizeStoredBankStatus("rejected"), "refused");
});

test("public guild site DTO exposes the fields consumed by the frontend normalizer", () => {
  const site = toPublicGuildSiteResource({
    id: "site-1",
    guildId: "guild-1",
    name: "Les Veilleurs",
    game: "Whiteout Survival",
    server: "R42",
    publicSlug: "les-veilleurs",
    themeJson: {
      theme: "royal-banner",
      colors: { id: "rose", accent: "#ff2e75" },
      typography: { id: "orbitron" }
    },
    pagesJson: {
      tagline: "Tenir la ligne",
      objective: "Coordonner les R4 actifs",
      memberInviteUrl: "https://discord.gg/les-veilleurs",
      sections: { roster: true, publicChat: false }
    },
    status: "published",
    publishedAt: "2026-07-01T12:00:00.000Z"
  });

  assert.equal(site.guildName, "Les Veilleurs");
  assert.equal(site.realm, "R42");
  assert.equal(site.theme, "royal-banner");
  assert.deepEqual(site.colors, { id: "rose", accent: "#ff2e75" });
  assert.deepEqual(site.typography, { id: "orbitron" });
  assert.deepEqual(site.sections, { roster: true, publicChat: false });
  assert.equal(site.memberInviteUrl, "/join/les-veilleurs");
  assert.equal(site.publicSlug, "les-veilleurs");
  assert.equal(site.published, true);
});

test("public guild site stays consultable when published without module data", () => {
  const site = toPublicGuildSiteResource({
    id: "site-1",
    guildId: "guild-1",
    guildName: "Les Veilleurs",
    game: "Whiteout Survival",
    realm: "R42",
    publicSlug: "les-veilleurs",
    sections: { roster: true, publicChat: false },
    status: "published",
    published: false
  });

  assert.equal(site.published, true);
  assert.deepEqual(site.sections, { roster: true, publicChat: false });
});

test("message recipients expose email and registration invitations point to signup flow", () => {
  const recipient = toMessageRecipientResource({
    id: "user-2",
    display_name: "FrostWarden",
    email: "frostwarden@guildops.app",
    nickname: "Frost",
    preferred_language: "fr",
    role: "Officier",
    status: "active"
  });

  assert.deepEqual(recipient, {
    id: "user-2",
    displayName: "FrostWarden",
    email: "frostwarden@guildops.app",
    nickname: "Frost",
    preferredLanguage: "fr",
    role: "Officier",
    status: "active"
  });

  const invitationUrl = buildRegistrationInvitationUrl({
    email: "new.member@example.com",
  });

  assert.equal(invitationUrl, "http://localhost:5173/auth/register?email=new.member%40example.com");
});

test("public bank snapshot masks requester details and omits internal history by default", () => {
  const bank = toPublicBankSnapshotResource({
    moduleEnabled: true,
    bank: {
      name: "Banque principale",
      settings: {}
    },
    resources: [
      {
        resourceCode: "wood",
        resourceName: "Bois",
        amount: "1200",
        unit: "",
        updatedAt: "2026-07-02T08:00:00.000Z"
      }
    ],
    requests: [
      {
        id: "request-1",
        requester: "R4 Alpha",
        resourceCode: "wood",
        resource: "Bois",
        amount: "300",
        unit: "",
        reason: "Preparation war",
        status: "pending",
        createdAt: "2026-07-02T09:00:00.000Z"
      }
    ]
  });

  assert.equal(bank.resources[0]?.amount, null);
  assert.equal(bank.resources[0]?.amountLabel, "Stock agrege");
  assert.equal(bank.requests[0]?.member, "Membre masque");
  assert.equal(bank.requests[0]?.amount, null);
  assert.equal(bank.requests[0]?.reason, null);
  assert.equal(bank.requestStats.pending, 1);
  assert.equal(Object.hasOwn(bank as Record<string, unknown>, "movements"), false);
  assert.equal(Object.hasOwn(bank as Record<string, unknown>, "commandAlias"), false);
});

test("permission notifications target bank managers and keep actor excluded", async () => {
  const queries: Array<{ text: string; params?: unknown[] }> = [];
  const db = fakeDb([
    {
      id: "notification-1",
      guild_id: "guild-1",
      user_id: "user-bank",
      actor_user_id: "user-requester",
      type: "bank.request.created",
      title: "Nouvelle demande de ressources",
      body: "Bear: 25 Bois",
      data: { url: "/app/bank" },
      read_at: null,
      created_at: "2026-07-11T08:00:00.000Z"
    }
  ], queries);

  const notifications = await createGuildNotificationsForPermission(db, {
    guildId: "guild-1",
    actorUserId: "user-requester",
    permissionKeys: ["manage_bank", "admin_all"],
    type: "bank.request.created",
    title: "Nouvelle demande de ressources",
    body: "Bear: 25 Bois",
    data: { url: "/app/bank" }
  });

  assert.equal(notifications[0]?.userId, "user-bank");
  assert.match(queries[0]?.text ?? "", /p\.key::text = ANY/);
  assert.match(queries[0]?.text ?? "", /user_id <> \$2::uuid/);
  assert.deepEqual(queries[0]?.params?.slice(0, 2), ["guild-1", "user-requester"]);
  assert.deepEqual(queries[0]?.params?.[6], ["manage_bank", "admin_all"]);
});

test("user notifications target explicit guild members and keep actor excluded", async () => {
  const queries: Array<{ text: string; params?: unknown[] }> = [];
  const db = fakeDb([
    {
      id: "notification-1",
      guild_id: "guild-1",
      user_id: "user-recipient",
      actor_user_id: "user-sender",
      type: "message.private.created",
      title: "Nouveau message de FrostWarden",
      body: "FrostWarden: Salut",
      data: { url: "/app/messages", messageId: "message-1" },
      read_at: null,
      created_at: "2026-07-11T08:05:00.000Z"
    }
  ], queries);

  const notifications = await createGuildNotificationsForUsers(db, {
    guildId: "guild-1",
    actorUserId: "user-sender",
    userIds: ["user-recipient", "user-recipient", "user-sender"],
    type: "message.private.created",
    title: "Nouveau message de FrostWarden",
    body: "FrostWarden: Salut",
    data: { url: "/app/messages", messageId: "message-1" }
  });

  assert.equal(notifications[0]?.userId, "user-recipient");
  assert.match(queries[0]?.text ?? "", /gm\.status = 'active'/);
  assert.match(queries[0]?.text ?? "", /gm\.user_id = ANY\(\$7::uuid\[\]\)/);
  assert.match(queries[0]?.text ?? "", /gm\.user_id <> \$2::uuid/);
  assert.deepEqual(queries[0]?.params?.slice(0, 2), ["guild-1", "user-sender"]);
  assert.deepEqual(queries[0]?.params?.[6], ["user-recipient", "user-sender"]);
});

test("manage_events RBAC allows officers through role permissions", async () => {
  const queries: Array<{ text: string; params?: unknown[] }> = [];
  const db = fakeDb([{ allowed: true }], queries);

  const allowed = await canManageEvents(db, "guild-1", "user-1", "member", "user");

  assert.equal(allowed, true);
  assert.match(queries[0]?.text ?? "", /manage_events/);
  assert.deepEqual(queries[0]?.params, ["guild-1", "user-1"]);
});

test("manage_events RBAC allows admins without querying role permissions", async () => {
  const queries: Array<{ text: string; params?: unknown[] }> = [];
  const db = fakeDb([], queries);

  assert.equal(await canManageEvents(db, "guild-1", "user-1", "member", "admin"), true);
  assert.equal(await canManageEvents(db, "guild-1", "user-1", "owner", "user"), true);
  assert.equal(queries.length, 0);
});

test("manage_events RBAC denies ordinary members without permission", async () => {
  const db = fakeDb([]);

  assert.equal(await canManageEvents(db, "guild-1", "user-1", "member", "user"), false);
});

test("send_sos RBAC allows authorized members through role permissions", async () => {
  const queries: Array<{ text: string; params?: unknown[] }> = [];
  const db = fakeDb([{ allowed: true }], queries);

  const allowed = await canSendSos(db, "guild-1", "user-1", "member", "user");

  assert.equal(allowed, true);
  assert.match(queries[0]?.text ?? "", /send_sos/);
  assert.deepEqual(queries[0]?.params, ["guild-1", "user-1"]);
});

test("send_sos RBAC allows admins without querying role permissions", async () => {
  const queries: Array<{ text: string; params?: unknown[] }> = [];
  const db = fakeDb([], queries);

  assert.equal(await canSendSos(db, "guild-1", "user-1", "member", "admin"), true);
  assert.equal(await canSendSos(db, "guild-1", "user-1", "owner", "user"), true);
  assert.equal(queries.length, 0);
});

test("send_sos RBAC denies ordinary members without permission", async () => {
  const db = fakeDb([]);

  assert.equal(await canSendSos(db, "guild-1", "user-1", "member", "user"), false);
});

test("guild module helpers normalize rows and read active module keys", async () => {
  assert.deepEqual(
    normalizeGuildModuleRow({
      guild_id: "guild-1",
      module_key: "bank",
      status: "enabled",
      config_json: { threshold: 10 },
      enabled_at: "2026-07-01T12:00:00.000Z",
      disabled_at: null,
      enabled_by: "user-1"
    }),
    {
      guildId: "guild-1",
      moduleKey: "bank",
      status: "enabled",
      config: { threshold: 10 },
      enabledAt: "2026-07-01T12:00:00.000Z",
      disabledAt: null,
      enabledBy: "user-1"
    }
  );

  assert.equal(
    normalizeGuildModuleRow({
      guild_id: "guild-1",
      module_key: "unknown",
      status: "enabled",
      config_json: null,
      enabled_at: null,
      disabled_at: null,
      enabled_by: null
    }),
    null
  );

  const queries: Array<{ text: string; params?: unknown[] }> = [];
  const db = fakeDb([{ module_key: "site" }, { module_key: "bank" }, { module_key: "unknown" }], queries);

  assert.deepEqual(await listActiveGuildModuleKeys(db, "guild-1"), ["site", "bank"]);
  assert.match(queries[0]?.text ?? "", /status = 'enabled'/);
  assert.deepEqual(queries[0]?.params, ["guild-1"]);
  assert.deepEqual(withDefaultGuildModuleKeys(["bank", "unknown", "messages"]), [
    "site",
    "membership_requests",
    "bank",
    "messages",
    "multi_guilds"
  ]);
  assert.deepEqual(normalizeGuildModuleKeys(["sos_attack", "translation", "unknown"]), [
    "site",
    "membership_requests",
    "sos_attack",
    "messages",
    "translation",
    "multi_guilds"
  ]);

  const activeQueries: Array<{ text: string; params?: unknown[] }> = [];
  assert.equal(await isGuildModuleActive(fakeDb([{ active: true }], activeQueries), "guild-1", "bank"), true);
  assert.deepEqual(activeQueries[0]?.params, ["guild-1", "bank"]);

  const invalidQueries: Array<{ text: string; params?: unknown[] }> = [];
  assert.equal(await isGuildModuleActive(fakeDb([], invalidQueries), "guild-1", "not-a-module"), false);
  assert.equal(invalidQueries.length, 0);

  const seedQueries: Array<{ text: string; params?: unknown[] }> = [];
  await seedDefaultGuildModules(fakeDb([], seedQueries), "guild-1", "user-1");
  assert.match(seedQueries[0]?.text ?? "", /INSERT INTO guild_modules/);
  assert.deepEqual(seedQueries[0]?.params, ["guild-1", "user-1", ["site", "membership_requests", "messages", "multi_guilds"]]);

  const syncQueries: Array<{ text: string; params?: unknown[] }> = [];
  assert.deepEqual(await syncGuildModules(fakeDb([], syncQueries), "guild-1", ["bank"], "user-1"), [
    "site",
    "membership_requests",
    "bank",
    "messages",
    "multi_guilds"
  ]);
  assert.match(syncQueries[0]?.text ?? "", /INSERT INTO guild_modules/);
  assert.deepEqual(syncQueries[0]?.params, [
    "guild-1",
    "user-1",
    ["site", "membership_requests", "bank", "messages", "multi_guilds"],
    ["site", "membership_requests", "wars_events", "sos_attack", "bank", "diplomacy", "forum", "messages", "translation", "multi_guilds"]
  ]);
});

test("approve_members RBAC allows dedicated membership approvers", async () => {
  const queries: Array<{ text: string; params?: unknown[] }> = [];
  const db = fakeDb([{ allowed: true }], queries);

  assert.equal(await canApproveMembershipRequests(db, "guild-1", "user-1", "member", "user"), true);
  assert.match(queries[0]?.text ?? "", /approve_members/);
  assert.deepEqual(queries[0]?.params, ["guild-1", "user-1"]);
});

test("CSRF checks exempt login/register but protect unsafe authenticated requests", () => {
  assert.equal(needsCsrfCheck(fakeRequest("GET", "/api/v1/guilds")), false);
  assert.equal(needsCsrfCheck(fakeRequest("POST", "/api/v1/auth/login")), false);
  assert.equal(needsCsrfCheck(fakeRequest("POST", "/api/v1/auth/register")), false);
  assert.equal(needsCsrfCheck(fakeRequest("POST", "/api/v1/auth/verify-email")), false);
  assert.equal(needsCsrfCheck(fakeRequest("POST", "/api/v1/auth/resend-verification")), false);
  assert.equal(needsCsrfCheck(fakeRequest("POST", "/api/v1/guilds/guild-1/events")), true);

  const token = "csrf-token";
  assert.doesNotThrow(() => assertRequestCsrf(fakeRequest("POST", "/api/v1/guilds/guild-1/events", token, token), hashCsrfToken(token)));
  assert.throws(
    () => assertRequestCsrf(fakeRequest("POST", "/api/v1/guilds/guild-1/events", token, "other-token"), hashCsrfToken(token)),
    /CSRF token is missing or invalid/
  );
});

test("production readiness reports missing auth secrets", () => {
  assert.deepEqual(
    getRuntimeConfigurationStatus({
      DATABASE_URL: "postgres://example.com/guildops",
      isProduction: true,
      PASSWORD_PEPPER: undefined,
      SESSION_SECRET: undefined
    }),
    {
      ok: false,
      missingEnv: ["SESSION_SECRET", "PASSWORD_PEPPER"]
    }
  );

  assert.deepEqual(
    getRuntimeConfigurationStatus({
      DATABASE_URL: "postgres://example.com/guildops",
      isProduction: true,
      PASSWORD_PEPPER: "pepper",
      SESSION_SECRET: "secret"
    }),
    {
      ok: true,
      missingEnv: []
    }
  );
});

test("auth rate limit message uses human readable time", () => {
  assert.equal(
    formatAuthRateLimitMessage({
      action: "register",
      bucket: "email",
      label: "8 inscriptions / 15 min par email",
      limit: 8,
      reason: "quota",
      retryAfterSeconds: 19761,
      windowSeconds: 15 * 60
    }),
    "Trop de tentatives d'inscription. Reessaie dans 5 heures 30 min."
  );
});

test("CORS allows configured origins and optional loopback dev origins", () => {
  assert.equal(
    isCorsOriginAllowed("https://guildops-frontend.onrender.com", {
      configuredOrigins: ["https://guildops-frontend.onrender.com"],
      isProduction: true
    }),
    true
  );
  assert.equal(
    isCorsOriginAllowed("http://127.0.0.1:5176", {
      allowLoopback: true,
      configuredOrigins: ["https://guildops-frontend.onrender.com"],
      isProduction: true
    }),
    true
  );
  assert.equal(
    isCorsOriginAllowed("https://evil.example", {
      allowLoopback: true,
      configuredOrigins: ["https://guildops-frontend.onrender.com"],
      isProduction: true
    }),
    false
  );
});

test("public chat rejects when the publicChat site section is disabled", async () => {
  const queries: Array<{ text: string; params?: unknown[] }> = [];
  const db = fakeDb(
    [{ id: "guild-1", default_language: "fr", public_chat_enabled: false, public_chat_module_enabled: true }],
    queries
  );

  await assert.rejects(
    () => findPublicChatGuildBySlug(db, "les-veilleurs"),
    (error) => hasHttpError(error, 404, /Public chat is disabled/)
  );
  assert.match(queries[0]?.text ?? "", /sections_json->>'publicChat'/);
  assert.deepEqual(queries[0]?.params, ["les-veilleurs"]);
});

function fakeDb(rows: QueryResultRow[], queries: Array<{ text: string; params?: unknown[] }> = []): Queryable {
  return {
    async query<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<QueryResult<T>> {
      queries.push({ text, params });

      return {
        command: "SELECT",
        rowCount: rows.length,
        oid: 0,
        fields: [],
        rows: rows as T[]
      };
    }
  };
}

function fakeRequest(method: string, path: string, csrfCookie?: string, csrfHeader?: string) {
  return {
    method,
    path,
    cookies: csrfCookie ? { guildops_csrf: csrfCookie } : {},
    get(name: string) {
      return ["x-csrf-token", "x-csrf-token".toLowerCase()].includes(name.toLowerCase()) ? csrfHeader : undefined;
    }
  } as never;
}

function hasHttpError(error: unknown, status: number, messagePattern: RegExp): boolean {
  const candidate = error as { message?: string; status?: number };
  assert.equal(candidate.status, status);
  assert.match(candidate.message ?? "", messagePattern);
  return true;
}

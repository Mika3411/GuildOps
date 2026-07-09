import type { Queryable } from "../db/pool.js";

export const GUILD_MODULE_KEYS = [
  "site",
  "membership_requests",
  "wars_events",
  "sos_attack",
  "bank",
  "diplomacy",
  "forum",
  "messages",
  "translation",
  "multi_guilds"
] as const;

export const DEFAULT_VISIBLE_GUILD_MODULE_KEYS = ["site", "membership_requests", "messages", "multi_guilds"] as const;
export const GUILD_MODULE_STATUSES = ["enabled", "disabled"] as const;

export type GuildModuleKey = (typeof GUILD_MODULE_KEYS)[number];
export type GuildModuleStatus = (typeof GUILD_MODULE_STATUSES)[number];

const GUILD_MODULE_DEPENDENCIES: Partial<Record<GuildModuleKey, readonly GuildModuleKey[]>> = {
  membership_requests: ["site"],
  forum: ["multi_guilds"],
  messages: ["site"],
  translation: ["messages"]
};

export type GuildModuleRow = {
  guild_id: string;
  module_key: string;
  status: string;
  config_json: Record<string, unknown> | null;
  enabled_at: string | null;
  disabled_at: string | null;
  enabled_by: string | null;
};

export type GuildModuleResource = {
  guildId: string;
  moduleKey: GuildModuleKey;
  status: GuildModuleStatus;
  config: Record<string, unknown>;
  enabledAt: string | null;
  disabledAt: string | null;
  enabledBy: string | null;
};

const GUILD_MODULE_KEY_SET = new Set<string>(GUILD_MODULE_KEYS);
const GUILD_MODULE_STATUS_SET = new Set<string>(GUILD_MODULE_STATUSES);

export function isGuildModuleKey(value: string): value is GuildModuleKey {
  return GUILD_MODULE_KEY_SET.has(value);
}

export function normalizeGuildModuleKeys(moduleKeys: readonly string[] = []): GuildModuleKey[] {
  const enabledKeys = new Set<GuildModuleKey>(DEFAULT_VISIBLE_GUILD_MODULE_KEYS);

  moduleKeys.forEach((moduleKey) => {
    if (isGuildModuleKey(moduleKey)) {
      collectGuildModuleKeys(moduleKey, enabledKeys);
    }
  });

  return GUILD_MODULE_KEYS.filter((moduleKey) => enabledKeys.has(moduleKey));
}

export function normalizeGuildModuleRow(row: GuildModuleRow): GuildModuleResource | null {
  if (!isGuildModuleKey(row.module_key)) return null;

  return {
    guildId: row.guild_id,
    moduleKey: row.module_key,
    status: normalizeGuildModuleStatus(row.status),
    config: normalizeConfigJson(row.config_json),
    enabledAt: row.enabled_at,
    disabledAt: row.disabled_at,
    enabledBy: row.enabled_by
  };
}

export async function listGuildModules(db: Queryable, guildId: string): Promise<GuildModuleResource[]> {
  const result = await db.query<GuildModuleRow>(
    `
      SELECT
        guild_id::text,
        module_key,
        status,
        COALESCE(config_json, '{}'::jsonb) AS config_json,
        enabled_at::text,
        disabled_at::text,
        enabled_by::text
      FROM guild_modules
      WHERE guild_id = $1
      ORDER BY module_key ASC
    `,
    [guildId]
  );

  return result.rows
    .map(normalizeGuildModuleRow)
    .filter((module): module is GuildModuleResource => Boolean(module));
}

export async function listActiveGuildModuleKeys(db: Queryable, guildId: string): Promise<GuildModuleKey[]> {
  const result = await db.query<{ module_key: string }>(
    `
      SELECT module_key
      FROM guild_modules
      WHERE guild_id = $1
        AND status = 'enabled'
      ORDER BY module_key ASC
    `,
    [guildId]
  );

  return result.rows
    .map((row) => row.module_key)
    .filter((moduleKey): moduleKey is GuildModuleKey => isGuildModuleKey(moduleKey));
}

export function withDefaultGuildModuleKeys(moduleKeys: readonly string[] = []): GuildModuleKey[] {
  return normalizeGuildModuleKeys(moduleKeys);
}

export async function getActiveGuildModuleSet(db: Queryable, guildId: string): Promise<Set<GuildModuleKey>> {
  return new Set(withDefaultGuildModuleKeys(await listActiveGuildModuleKeys(db, guildId)));
}

export async function seedDefaultGuildModules(
  db: Queryable,
  guildId: string,
  enabledByUserId: string | null
): Promise<void> {
  await db.query(
    `
      INSERT INTO guild_modules (
        guild_id,
        module_key,
        status,
        config_json,
        enabled_at,
        disabled_at,
        enabled_by
      )
      SELECT
        $1,
        module_key,
        'enabled',
        '{}'::jsonb,
        now(),
        NULL,
        $2
      FROM unnest($3::text[]) AS default_modules(module_key)
      ON CONFLICT (guild_id, module_key) DO UPDATE
      SET status = 'enabled',
          enabled_at = COALESCE(guild_modules.enabled_at, EXCLUDED.enabled_at, now()),
          disabled_at = NULL,
          enabled_by = COALESCE(guild_modules.enabled_by, EXCLUDED.enabled_by),
          updated_at = now()
    `,
    [guildId, enabledByUserId, [...DEFAULT_VISIBLE_GUILD_MODULE_KEYS]]
  );
}

export async function syncGuildModules(
  db: Queryable,
  guildId: string,
  moduleKeys: readonly string[],
  enabledByUserId: string | null
): Promise<GuildModuleKey[]> {
  const enabledModuleKeys = normalizeGuildModuleKeys(moduleKeys);

  await db.query(
    `
      INSERT INTO guild_modules (
        guild_id,
        module_key,
        status,
        config_json,
        enabled_at,
        disabled_at,
        enabled_by
      )
      SELECT
        $1,
        module_key,
        CASE WHEN module_key = ANY($3::text[]) THEN 'enabled' ELSE 'disabled' END,
        '{}'::jsonb,
        CASE WHEN module_key = ANY($3::text[]) THEN now() ELSE NULL END,
        CASE WHEN module_key = ANY($3::text[]) THEN NULL ELSE now() END,
        CASE WHEN module_key = ANY($3::text[]) THEN $2::uuid ELSE NULL END
      FROM unnest($4::text[]) AS all_modules(module_key)
      ON CONFLICT (guild_id, module_key) DO UPDATE
      SET status = EXCLUDED.status,
          enabled_at = CASE
            WHEN EXCLUDED.status = 'enabled' AND guild_modules.status <> 'enabled' THEN now()
            WHEN EXCLUDED.status = 'enabled' THEN COALESCE(guild_modules.enabled_at, now())
            ELSE guild_modules.enabled_at
          END,
          disabled_at = CASE
            WHEN EXCLUDED.status = 'disabled' AND guild_modules.status <> 'disabled' THEN now()
            WHEN EXCLUDED.status = 'disabled' THEN COALESCE(guild_modules.disabled_at, now())
            ELSE NULL
          END,
          enabled_by = CASE
            WHEN EXCLUDED.status = 'enabled' AND guild_modules.status <> 'enabled' THEN EXCLUDED.enabled_by
            WHEN EXCLUDED.status = 'enabled' THEN COALESCE(guild_modules.enabled_by, EXCLUDED.enabled_by)
            ELSE guild_modules.enabled_by
          END,
          updated_at = now()
    `,
    [guildId, enabledByUserId, enabledModuleKeys, [...GUILD_MODULE_KEYS]]
  );

  return enabledModuleKeys;
}

export async function isGuildModuleActive(
  db: Queryable,
  guildId: string,
  moduleKey: string
): Promise<boolean> {
  if (!isGuildModuleKey(moduleKey)) return false;

  const result = await db.query<{ active: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM guild_modules
        WHERE guild_id = $1
          AND module_key = $2
          AND status = 'enabled'
      ) AS active
    `,
    [guildId, moduleKey]
  );

  return Boolean(result.rows[0]?.active);
}

function normalizeGuildModuleStatus(status: string): GuildModuleStatus {
  return GUILD_MODULE_STATUS_SET.has(status) ? (status as GuildModuleStatus) : "disabled";
}

function normalizeConfigJson(value: Record<string, unknown> | null): Record<string, unknown> {
  if (!value || Array.isArray(value) || typeof value !== "object") return {};
  return value;
}

function collectGuildModuleKeys(moduleKey: GuildModuleKey, enabledKeys: Set<GuildModuleKey>): void {
  if (enabledKeys.has(moduleKey)) return;

  for (const dependency of GUILD_MODULE_DEPENDENCIES[moduleKey] ?? []) {
    collectGuildModuleKeys(dependency, enabledKeys);
  }

  enabledKeys.add(moduleKey);
}

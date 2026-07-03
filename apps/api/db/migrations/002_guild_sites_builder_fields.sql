-- Store GuildOps builder fields directly on guild_sites for create/update publish flows.

BEGIN;

ALTER TABLE guild_sites
  ADD COLUMN IF NOT EXISTS guild_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS game text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS realm text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tagline text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS objective text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS theme text NOT NULL DEFAULT 'camp-nord',
  ADD COLUMN IF NOT EXISTS colors_json jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS typography_json jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sections_json jsonb NOT NULL DEFAULT '{}';

UPDATE guild_sites
SET
  guild_name = COALESCE(NULLIF(guild_name, ''), title),
  tagline = COALESCE(NULLIF(tagline, ''), hero_text, ''),
  objective = COALESCE(NULLIF(objective, ''), hero_text, ''),
  theme = COALESCE(NULLIF(theme, ''), theme_json ->> 'theme', 'camp-nord'),
  colors_json = CASE
    WHEN colors_json <> '{}'::jsonb THEN colors_json
    ELSE COALESCE(theme_json -> 'colors', '{}'::jsonb)
  END,
  typography_json = CASE
    WHEN typography_json <> '{}'::jsonb THEN typography_json
    ELSE COALESCE(theme_json -> 'typography', '{}'::jsonb)
  END,
  sections_json = CASE
    WHEN sections_json <> '{}'::jsonb THEN sections_json
    ELSE COALESCE(pages_json -> 'sections', '{}'::jsonb)
  END;

COMMIT;

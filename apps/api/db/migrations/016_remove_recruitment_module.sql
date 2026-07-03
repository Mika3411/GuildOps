-- Remove the deprecated recruitment module from active GuildOps deployments.

BEGIN;

DELETE FROM translation_jobs
WHERE source_table = 'recruitment_posts';

DELETE FROM translations
WHERE source_table = 'recruitment_posts';

DELETE FROM guild_modules
WHERE module_key = 'recruitment';

DELETE FROM role_permissions rp
USING permissions p
WHERE rp.permission_id = p.id
  AND p.key = 'manage_recruitment';

DELETE FROM roles
WHERE code = 'recruteur';

DELETE FROM permissions
WHERE key = 'manage_recruitment';

DROP TABLE IF EXISTS recruitment_applications CASCADE;
DROP TABLE IF EXISTS recruitment_posts CASCADE;

DO $$
DECLARE
  constraint_name text;
BEGIN
  IF to_regclass('guild_modules') IS NOT NULL THEN
    FOR constraint_name IN
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = 'guild_modules'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%module_key%'
    LOOP
      EXECUTE format('ALTER TABLE guild_modules DROP CONSTRAINT %I', constraint_name);
    END LOOP;

    ALTER TABLE guild_modules
      ADD CONSTRAINT guild_modules_module_key_check
      CHECK (module_key IN (
        'site',
        'wars_events',
        'sos_attack',
        'bank',
        'diplomacy',
        'forum',
        'messages',
        'translation',
        'multi_guilds'
      ));
  END IF;
END $$;

DO $$
DECLARE
  constraint_name text;
BEGIN
  IF to_regclass('translations') IS NOT NULL THEN
    FOR constraint_name IN
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = 'translations'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%source_table%'
    LOOP
      EXECUTE format('ALTER TABLE translations DROP CONSTRAINT %I', constraint_name);
    END LOOP;

    ALTER TABLE translations
      ADD CONSTRAINT translations_source_table_check
      CHECK (source_table IN ('private_messages', 'public_chat_messages', 'forum_posts', 'alerts'));
  END IF;
END $$;

DO $$
DECLARE
  constraint_name text;
BEGIN
  IF to_regclass('translation_jobs') IS NOT NULL THEN
    FOR constraint_name IN
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = 'translation_jobs'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%source_table%'
    LOOP
      EXECUTE format('ALTER TABLE translation_jobs DROP CONSTRAINT %I', constraint_name);
    END LOOP;

    ALTER TABLE translation_jobs
      ADD CONSTRAINT translation_jobs_source_table_check
      CHECK (source_table IN ('private_messages', 'public_chat_messages', 'forum_posts', 'alerts'));
  END IF;
END $$;

COMMIT;

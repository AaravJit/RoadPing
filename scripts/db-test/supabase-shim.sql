-- Minimal stand-in for the parts of a Supabase database the RoadPing
-- migrations and pgTAP tests rely on, for running them against a plain
-- Postgres + PostGIS + pg_cron + pgTAP install without Docker.
-- Not used by `supabase test db`, which runs against the real local stack.

-- Roles are cluster-wide, so tolerate a previous run.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
END
$$;

CREATE SCHEMA auth;
CREATE SCHEMA extensions;

CREATE TABLE auth.users (
  id                 uuid PRIMARY KEY,
  email              text,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- Same resolution order as Supabase's auth.uid().
CREATE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.sub', true), ''),
    (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

GRANT USAGE ON SCHEMA auth, extensions, public TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

-- Supabase's default grants on objects created by postgres in public.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

CREATE PUBLICATION supabase_realtime;

-- Supabase preinstalls pg_cron; migration 001's CREATE EXTENSION IF NOT EXISTS
-- then becomes a no-op.
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Production also has Supabase's "auto enable RLS" event trigger recipe
-- (https://supabase.com/docs/guides/database/postgres/event-triggers),
-- installed outside the migrations. Recreate it here, with the grants it got
-- from the defaults at the time, so migration 011 and its tests run against
-- the same state. Every public table in the migrations already enables RLS,
-- so the trigger changes nothing about them.
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
RETURNS EVENT_TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
          RAISE;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;
GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO PUBLIC, anon, authenticated;

DROP EVENT TRIGGER IF EXISTS ensure_rls;
CREATE EVENT TRIGGER ensure_rls
ON ddl_command_end
WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
EXECUTE FUNCTION public.rls_auto_enable();

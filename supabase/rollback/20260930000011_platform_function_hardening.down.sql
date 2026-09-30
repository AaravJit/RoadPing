-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK for migration 20260930000011_platform_function_hardening.sql
--
-- Not a migration: run by hand only to recover from an outage. Restores the
-- pre-011 grants on rls_auto_enable() and the unpinned search_path on
-- set_updated_at(). Afterwards, delete the 011 row from
-- supabase_migrations.schema_migrations if the CLI should re-apply it later.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO PUBLIC, anon, authenticated;
  END IF;
END
$$;

ALTER FUNCTION public.set_updated_at() RESET search_path;

COMMIT;

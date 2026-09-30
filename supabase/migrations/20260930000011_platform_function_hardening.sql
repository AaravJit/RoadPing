-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 011: close the two Security Advisor findings left after 010.
--
-- 1. public.rls_auto_enable() is the SECURITY DEFINER function behind the
--    ensure_rls event trigger (Supabase's "auto enable RLS" recipe). It was
--    created outside these migrations, before 010 changed the default
--    privileges, so it still has EXECUTE for PUBLIC, anon and authenticated.
--    Postgres does not check EXECUTE when it fires an event trigger, so
--    revoking it does not stop ensure_rls; and a direct call already fails
--    ("trigger functions can only be called as triggers"). Guarded because the
--    function exists only where someone installed the recipe.
--
-- 2. public.set_updated_at() (migration 003) has no pinned search_path. Its
--    body only calls now(), which lives in pg_catalog and is found with an
--    empty search_path.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
  END IF;
END
$$;

ALTER FUNCTION public.set_updated_at() SET search_path = '';

-- pgTAP: migration 011. rls_auto_enable() is not client-executable and the
-- ensure_rls event trigger still enables RLS for DDL run by a role that has
-- no EXECUTE on it; set_updated_at() has a pinned, empty search_path and still
-- works. The rls_auto_enable checks are skipped where the recipe isn't
-- installed (it is not part of the migrations).
BEGIN;
SELECT plan(10);

CREATE FUNCTION pg_temp.has_rls_recipe() RETURNS boolean
LANGUAGE sql AS $$ SELECT to_regprocedure('public.rls_auto_enable()') IS NOT NULL $$;

-- ── rls_auto_enable() privileges ─────────────────────────────────────────────
SELECT CASE WHEN pg_temp.has_rls_recipe() THEN collect_tap(
  ok(NOT has_function_privilege('anon', 'public.rls_auto_enable()', 'EXECUTE'),
     'anon cannot execute rls_auto_enable()'),
  ok(NOT has_function_privilege('authenticated', 'public.rls_auto_enable()', 'EXECUTE'),
     'authenticated cannot execute rls_auto_enable()'),
  ok(NOT EXISTS (
       SELECT 1 FROM pg_proc p, aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
       WHERE p.oid = 'public.rls_auto_enable()'::regprocedure
         AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'),
     'PUBLIC cannot execute rls_auto_enable()'),
  is((SELECT evtenabled::text FROM pg_event_trigger WHERE evtname = 'ensure_rls'), 'O',
     'ensure_rls event trigger is still enabled')
) ELSE skip('rls_auto_enable() not installed', 4) END;

-- ── ensure_rls still fires ───────────────────────────────────────────────────
-- A role with CREATE on public but no EXECUTE on rls_auto_enable(), like the
-- clients after this migration. Postgres does not check EXECUTE when firing.
CREATE ROLE rls_probe NOLOGIN;
GRANT USAGE, CREATE ON SCHEMA public TO rls_probe;

SET LOCAL ROLE rls_probe;
CREATE TABLE public.rls_probe_plain (id int);
CREATE TABLE public.rls_probe_ctas AS SELECT 1 AS id;
RESET ROLE;
CREATE TABLE public.rls_probe_owner (id int);

SELECT CASE WHEN pg_temp.has_rls_recipe() THEN collect_tap(
  ok(NOT has_function_privilege('rls_probe', 'public.rls_auto_enable()', 'EXECUTE'),
     'probe role has no EXECUTE on rls_auto_enable()'),
  ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.rls_probe_plain'::regclass),
     'CREATE TABLE by a role without EXECUTE still gets RLS enabled'),
  ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.rls_probe_ctas'::regclass),
     'CREATE TABLE AS by a role without EXECUTE still gets RLS enabled'),
  ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.rls_probe_owner'::regclass),
     'CREATE TABLE by the migration role still gets RLS enabled')
) ELSE skip('rls_auto_enable() not installed', 4) END;

-- ── set_updated_at() ─────────────────────────────────────────────────────────
SELECT ok(
  (SELECT proconfig @> ARRAY['search_path=""'] FROM pg_proc
   WHERE oid = 'public.set_updated_at()'::regprocedure),
  'set_updated_at() pins an empty search_path');

CREATE TEMP TABLE touch (id int PRIMARY KEY, updated_at timestamptz NOT NULL);
CREATE TRIGGER tr_touch BEFORE UPDATE ON touch
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
INSERT INTO touch VALUES (1, '2000-01-01');
UPDATE touch SET id = 1;
SELECT is((SELECT updated_at FROM touch), now(), 'set_updated_at() still stamps updated_at');

SELECT * FROM finish();
ROLLBACK;

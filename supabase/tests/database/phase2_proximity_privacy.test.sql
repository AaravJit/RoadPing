-- pgTAP: migration 012 privacy-safe proximity (Phase 2).
-- Migration: 20260930000012_privacy_safe_proximity
-- Run with `supabase test db`, or scripts/db-test/run.sh without Docker.
-- Design: docs/PHASE2_PROXIMITY_PRIVACY.md. Concurrency is exercised
-- separately by scripts/db-test/concurrency.sh (needs committed data).
--
-- Everything runs in one transaction, so now() is constant: hold expiry is
-- simulated by moving held_until into the past.
BEGIN;
SELECT plan(88);

-- ── Helpers ─────────────────────────────────────────────────────────────────
-- Positions are expressed in grid rows north of a row centre near 37°N, on
-- one meridian. One row is 250 m of latitude, so k rows ≈ k × 249.6 m
-- (the spheroid's meridian degree at 37°N is a little shorter than the
-- spherical mean the grid uses). Each test re-derives the quantized distance
-- it relies on instead of trusting that arithmetic.

CREATE FUNCTION pg_temp.dlat() RETURNS float8 LANGUAGE sql AS $$ SELECT 250 / 111195.08 $$;
CREATE FUNCTION pg_temp.base_lat() RETURNS float8 LANGUAGE sql AS $$
  SELECT -90 + (floor((37.0 + 90) / pg_temp.dlat()) + 0.5) * pg_temp.dlat()
$$;
CREATE FUNCTION pg_temp.row_lat(k float8) RETURNS float8 LANGUAGE sql AS $$
  SELECT pg_temp.base_lat() + k * pg_temp.dlat()
$$;
CREATE FUNCTION pg_temp.pt(p_lat float8, p_lng float8) RETURNS extensions.geography LANGUAGE sql AS $$
  SELECT extensions.ST_SetSRID(extensions.ST_MakePoint(p_lng, p_lat), 4326)::extensions.geography
$$;
CREATE FUNCTION pg_temp.u(p_n int) RETURNS uuid LANGUAGE sql AS $$
  SELECT ('20000000-0000-0000-0000-' || lpad(p_n::text, 12, '0'))::uuid
$$;

CREATE FUNCTION pg_temp.mk_user(p_n int, p_name text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES (pg_temp.u(p_n), p_name || '@example.test', jsonb_build_object('display_name', p_name));
$$;

CREATE FUNCTION pg_temp.go_live(p_n int, p_row float8, p_range int) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_sid uuid;
BEGIN
  INSERT INTO public.live_sessions (user_id, range_m) VALUES (pg_temp.u(p_n), p_range) RETURNING id INTO v_sid;
  PERFORM public.upsert_location_presence(pg_temp.u(p_n), v_sid, pg_temp.row_lat(p_row), -122.0);
  RETURN v_sid;
END;
$$;

-- Simulates an accepted heartbeat at a new position (bypasses the jump
-- filter, which is tested in security_lockdown.test.sql).
CREATE FUNCTION pg_temp.move(p_n int, p_row float8) RETURNS void LANGUAGE sql AS $$
  UPDATE public.location_presence SET location = pg_temp.pt(pg_temp.row_lat(p_row), -122.0)
  WHERE user_id = pg_temp.u(p_n);
$$;

CREATE FUNCTION pg_temp.stop(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT public.end_live_session(ls.id, ls.user_id, 'user_stopped')
  FROM public.live_sessions ls WHERE ls.user_id = pg_temp.u(p_n) AND ls.status = 'active';
$$;

CREATE FUNCTION pg_temp.sid(p_n int) RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM public.live_sessions WHERE user_id = pg_temp.u(p_n) AND status = 'active';
$$;

CREATE FUNCTION pg_temp.names(p_caller int) RETURNS text[] LANGUAGE sql AS $$
  SELECT COALESCE(array_agg(display_name ORDER BY ord), '{}')
  FROM public.get_nearby_drivers_v3(pg_temp.u(p_caller)) WITH ORDINALITY AS r(
    user_id, handle, display_name, avatar_url, vehicle_type, vehicle_label, vehicle_color,
    vehicle_make, vehicle_model, distance_band, is_speaking, dnd, ord);
$$;

CREATE FUNCTION pg_temp.band(p_caller int, p_target int) RETURNS public.distance_band LANGUAGE sql AS $$
  SELECT distance_band FROM public.get_nearby_drivers_v3(pg_temp.u(p_caller))
  WHERE user_id = pg_temp.u(p_target);
$$;

CREATE FUNCTION pg_temp.qdist(p_a int, p_b int) RETURNS float8 LANGUAGE sql AS $$
  SELECT private.quantized_distance_m(a.location, b.location)
  FROM public.location_presence a, public.location_presence b
  WHERE a.user_id = pg_temp.u(p_a) AND b.user_id = pg_temp.u(p_b);
$$;

CREATE FUNCTION pg_temp.xdist(p_a int, p_b int) RETURNS float8 LANGUAGE sql AS $$
  SELECT extensions.ST_Distance(a.location, b.location)
  FROM public.location_presence a, public.location_presence b
  WHERE a.user_id = pg_temp.u(p_a) AND b.user_id = pg_temp.u(p_b);
$$;

CREATE FUNCTION pg_temp.expire_holds() RETURNS void LANGUAGE sql AS $$
  UPDATE private.proximity_band_holds SET held_until = now() - INTERVAL '1 second';
$$;

CREATE FUNCTION pg_temp.m012_functions() RETURNS oid[] LANGUAGE sql AS $$
  SELECT array_agg(to_regprocedure(f)::oid) FROM unnest(ARRAY[
    'public.get_nearby_drivers_v3(uuid)', 'public.expire_stale_sessions()',
    'private.can_view_open_voice(uuid)', 'private.nearby_pair_band(uuid,uuid)',
    'private.distance_band_for(double precision)', 'private.proximity_cell_m()',
    'private.proximity_prefilter_margin_m()', 'private.proximity_band_hold()',
    'private.snap_to_proximity_grid(extensions.geography)',
    'private.quantized_distance_m(extensions.geography,extensions.geography)',
    'private.range_step_m(integer)']) AS f
$$;

CREATE FUNCTION pg_temp.as_user(p_id uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
-- Migration 010 removes the default EXECUTE-to-PUBLIC for functions this
-- role creates (pg_temp included), so grant what authenticated calls.
GRANT EXECUTE ON FUNCTION pg_temp.as_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.u(int) TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Contract shape: nothing numeric or geographic can leave v3
-- ═══════════════════════════════════════════════════════════════════════════

SELECT is(
  pg_get_function_identity_arguments('public.get_nearby_drivers_v3(uuid)'::regprocedure),
  'p_caller_id uuid',
  'v3 takes only the caller id: no range, no coordinates');

SELECT is(
  (SELECT array_agg(n ORDER BY i)
   FROM pg_proc p, unnest(p.proargnames, p.proargmodes) WITH ORDINALITY AS a(n, m, i)
   WHERE p.oid = 'public.get_nearby_drivers_v3(uuid)'::regprocedure AND m = 't'),
  ARRAY['user_id','handle','display_name','avatar_url','vehicle_type','vehicle_label',
        'vehicle_color','vehicle_make','vehicle_model','distance_band','is_speaking','dnd'],
  'v3 returns exactly the permitted columns (no distance, coordinate, bearing or session id)');

SELECT is_empty(
  $$ SELECT format_type(t, NULL)
     FROM pg_proc p, unnest(p.proallargtypes, p.proargmodes) AS a(t, m)
     WHERE p.oid = 'public.get_nearby_drivers_v3(uuid)'::regprocedure AND m = 't'
       AND format_type(t, NULL) NOT IN ('uuid', 'text', 'boolean', 'vehicle_type', 'distance_band') $$,
  'no v3 output column has a numeric, geometric or other type');

SELECT is(
  (SELECT array_agg(attname::text ORDER BY attnum) FROM pg_attribute
   WHERE attrelid = 'private.proximity_band_holds'::regclass AND attnum > 0 AND NOT attisdropped),
  ARRAY['caller_id', 'target_session_id', 'band', 'held_until'],
  'the hold table stores only ids, the public band and the hold end');

SELECT enum_has_labels('public', 'distance_band',
  ARRAY['within_800m', '800m_to_1600m', '1600m_to_3200m', 'beyond_3200m'],
  'four fixed bands, nearest first');


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Band classification at the boundaries (upper bound inclusive)
-- ═══════════════════════════════════════════════════════════════════════════

SELECT is(
  (SELECT array_agg(private.distance_band_for(d)::text ORDER BY i)
   FROM unnest(ARRAY[0, 100, 799.99, 800, 800.01, 1599.99, 1600, 1600.01,
                     3199.99, 3200, 3200.01, 5000]::float8[]) WITH ORDINALITY AS x(d, i)),
  ARRAY['within_800m', 'within_800m', 'within_800m', 'within_800m', '800m_to_1600m',
        '800m_to_1600m', '800m_to_1600m', '1600m_to_3200m', '1600m_to_3200m',
        '1600m_to_3200m', 'beyond_3200m', 'beyond_3200m'],
  'bands at min range, max range, and just below / at / just above each boundary');

SELECT is(
  (SELECT array_agg(private.range_step_m(r) ORDER BY i)
   FROM unnest(ARRAY[100, 101, 399, 400, 1234, 3199, 4800, 4999, 5000]) WITH ORDINALITY AS x(r, i)),
  ARRAY[100, 100, 250, 400, 1000, 3000, 4800, 4800, 5000],
  'stored ranges are floored to the fixed steps');


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Grid: bounded snapping error and roughly square cells at any latitude
-- ═══════════════════════════════════════════════════════════════════════════

SELECT cmp_ok(
  (SELECT max(extensions.ST_Distance(pg_temp.pt(lat, lng), private.snap_to_proximity_grid(pg_temp.pt(lat, lng))))
   FROM unnest(ARRAY[-66.5, -45.123, -33.9, -0.0001, 0, 1.29, 19.43, 37.0, 51.5, 60.17, 64.14, 69.65, 78.2]) AS lat,
        unnest(ARRAY[-179.99999, -122.41, -73.97, -0.12, 0, 18.42, 103.8, 151.2, 179.99999]) AS lng),
  '<', 180::float8,
  'a snapped point is always within ~0.72 cell of the raw point (latitudes -66..78, both antimeridian sides)');

SELECT ok(
  (SELECT bool_and(w BETWEEN 244 AND 256)
   FROM (
     SELECT extensions.ST_Distance(c, private.snap_to_proximity_grid(pg_temp.pt(
              extensions.ST_Y(c::extensions.geometry),
              extensions.ST_X(c::extensions.geometry) + 250 / (111195.08 * cos(radians(extensions.ST_Y(c::extensions.geometry))))))) AS w
     FROM (SELECT private.snap_to_proximity_grid(pg_temp.pt(lat, 10.0)) AS c
           FROM unnest(ARRAY[0, 23.5, 37, 45, 60, 70]::float8[]) AS lat) s
   ) widths),
  'adjacent columns are ~250 m apart from the equator to 70°N (not a fixed longitude step)');

SELECT cmp_ok(
  private.quantized_distance_m(pg_temp.pt(0.001, 179.99999), pg_temp.pt(0.001, -179.99999)),
  '<', 260::float8,
  'the grid wraps cleanly at the antimeridian');


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Privileges and exposure
-- ═══════════════════════════════════════════════════════════════════════════

SELECT ok(
  NOT has_function_privilege('anon', 'public.get_nearby_drivers_v3(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.get_nearby_drivers_v3(uuid)', 'EXECUTE'),
  'anon and authenticated cannot execute v3');
SELECT ok(has_function_privilege('service_role', 'public.get_nearby_drivers_v3(uuid)', 'EXECUTE'),
  'service_role can execute v3');
SELECT ok(
  (SELECT prosecdef FROM pg_proc WHERE oid = 'public.get_nearby_drivers_v3(uuid)'::regprocedure),
  'v3 is SECURITY DEFINER (it reads location_presence)');

SELECT is_empty(
  $$ SELECT p.oid::regprocedure::text FROM pg_proc p
     WHERE p.pronamespace = 'private'::regnamespace
       AND has_function_privilege('anon', p.oid, 'EXECUTE') $$,
  'anon cannot execute any private function');
SELECT is_empty(
  $$ SELECT p.oid::regprocedure::text FROM pg_proc p
     WHERE p.pronamespace = 'private'::regnamespace
       AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
       AND p.proname NOT IN ('is_room_member', 'is_room_owner', 'can_view_open_voice') $$,
  'authenticated can execute only the three RLS policy helpers in private');

SELECT is_empty(
  $$ SELECT r || ':' || priv
     FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS r,
          unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) AS priv
     WHERE has_table_privilege(r, 'private.proximity_band_holds', priv) $$,
  'no API role has any privilege on the hold table');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'private.proximity_band_holds'::regclass),
  'RLS is enabled on the hold table');

SELECT is_empty(
  $$ SELECT p.oid::regprocedure::text FROM pg_proc p
     WHERE p.oid = ANY (pg_temp.m012_functions())
       AND NOT (p.proconfig @> ARRAY['search_path=""']) $$,
  'every function created or replaced by migration 012 pins an empty search_path');

SELECT is(
  (SELECT count(*)::int FROM pg_proc p WHERE p.oid = ANY (pg_temp.m012_functions())),
  11, 'and all eleven exist');

SELECT is_empty(
  $$ SELECT c FROM pg_db_role_setting s, unnest(s.setconfig) AS c
     WHERE c ILIKE 'pgrst.db_schemas%' AND c ILIKE '%private%' $$,
  'no role setting exposes the private schema through the Data API');
SELECT ok(NOT has_schema_privilege('anon', 'private', 'USAGE'), 'anon still has no USAGE on private');

SELECT ok(
  NOT has_function_privilege('authenticated', 'public.get_nearby_drivers_v2(uuid,integer)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.get_nearby_drivers_v2(uuid,integer)', 'EXECUTE'),
  'deprecated v2 remains service_role only');


-- ═══════════════════════════════════════════════════════════════════════════
-- Fixtures
-- ═══════════════════════════════════════════════════════════════════════════
--  1 alice  caller, range 5000, row 0
--  2 zed    row 2  (~500 m)            within_800m
--  3 amy    row 3  (~750 m)            within_800m (farther than zed, sorts first)
--  4 bob    row 5  (~1250 m)           800m_to_1600m
--  5 cat    row 10 (~2500 m)           1600m_to_3200m
--  6 dee    row 16 (~4000 m)           beyond_3200m
--  7 eve    row 21 (~5240 m)           out of range
--  8 fay    row 5, own range 800       hidden (mutual range)
--  9 gus    row 2, banned
-- 10 hal    row 2, shadow-banned
-- 11 ivy    row 2, has blocked alice
-- 12 jon    row 2, blocked by alice
-- 13 kim    row 2, presence expired
-- 14 lou    row 2, live session expired
-- 15 max    not live
-- 16 ned    row 20 (~4990 m)           beyond_3200m (max range)

SELECT pg_temp.mk_user(n, name) FROM (VALUES
  (1,'alice'),(2,'zed'),(3,'amy'),(4,'bob'),(5,'cat'),(6,'dee'),(7,'eve'),(8,'fay'),
  (9,'gus'),(10,'hal'),(11,'ivy'),(12,'jon'),(13,'kim'),(14,'lou'),(15,'max'),(16,'ned')) v(n, name);

SELECT pg_temp.go_live(n, r, rng) FROM (VALUES
  (1,0,5000),(2,2,5000),(3,3,5000),(4,5,5000),(5,10,5000),(6,16,5000),(7,21,5000),(8,5,800),
  (9,2,5000),(10,2,5000),(11,2,5000),(12,2,5000),(13,2,5000),(14,2,5000),(16,20,5000)) v(n, r, rng);

UPDATE public.profiles SET is_banned = true        WHERE id = pg_temp.u(9);
UPDATE public.profiles SET is_shadow_banned = true WHERE id = pg_temp.u(10);
INSERT INTO public.blocks (blocker_id, blocked_id) VALUES (pg_temp.u(11), pg_temp.u(1)), (pg_temp.u(1), pg_temp.u(12));
UPDATE public.location_presence SET expires_at = now() - INTERVAL '1 second' WHERE user_id = pg_temp.u(13);
UPDATE public.live_sessions     SET expires_at = now() - INTERVAL '1 second' WHERE user_id = pg_temp.u(14);

-- Everyone live is talking on the open channel (for the Realtime test).
INSERT INTO public.voice_sessions (user_id, live_session_id, is_speaking)
SELECT user_id, id, true FROM public.live_sessions WHERE status = 'active' AND user_id <> pg_temp.u(1);


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Visibility, bands and ordering
-- ═══════════════════════════════════════════════════════════════════════════

SELECT ok(pg_temp.qdist(1, 3) > pg_temp.qdist(1, 2),
  'precondition: amy is farther than zed');
SELECT ok(pg_temp.qdist(1, 16) <= 5000 AND pg_temp.qdist(1, 7) > 5000,
  'precondition: ned is just inside 5000 m and eve just outside (quantized)');

SELECT is(pg_temp.names(1),
  ARRAY['amy', 'zed', 'bob', 'cat', 'dee', 'ned'],
  'alice sees exactly the eligible drivers, ordered by band then name (not by distance)');

SELECT is(
  (SELECT array_agg(distance_band::text ORDER BY display_name)
   FROM public.get_nearby_drivers_v3(pg_temp.u(1))),
  ARRAY['within_800m', '800m_to_1600m', '1600m_to_3200m', 'beyond_3200m', 'beyond_3200m', 'within_800m'],
  'bands: amy/zed within 800 m, bob 800-1600, cat 1600-3200, dee and ned (max range) beyond 3200');

SELECT is_empty(
  $$ SELECT r.user_id FROM public.get_nearby_drivers_v3(pg_temp.u(1)) r
     JOIN public.location_presence a ON a.user_id = pg_temp.u(1)
     JOIN public.location_presence t ON t.user_id = r.user_id
     WHERE r.distance_band IS DISTINCT FROM private.distance_band_for(private.quantized_distance_m(a.location, t.location)) $$,
  'a fresh band is the band of the quantized distance');

SELECT is(
  (SELECT to_jsonb(r) - ARRAY['user_id','handle','display_name','avatar_url','vehicle_type',
                               'vehicle_label','vehicle_color','vehicle_make','vehicle_model']
   FROM public.get_nearby_drivers_v3(pg_temp.u(1)) r WHERE r.display_name = 'amy'),
  (SELECT to_jsonb(r) - ARRAY['user_id','handle','display_name','avatar_url','vehicle_type',
                               'vehicle_label','vehicle_color','vehicle_make','vehicle_model']
   FROM public.get_nearby_drivers_v3(pg_temp.u(1)) r WHERE r.display_name = 'zed'),
  'two drivers ~250 m apart in the same band are indistinguishable apart from identity');

SELECT is_empty(
  $$ SELECT k FROM public.get_nearby_drivers_v3(pg_temp.u(1)) r, jsonb_object_keys(to_jsonb(r)) k
     WHERE k ~* '(dist.*_m$|lat|lng|lon|coord|bearing|heading|location|session)' $$,
  'no output key looks like a coordinate, bearing, measured distance or session');

SELECT is(pg_temp.names(15), '{}'::text[], 'a caller who is not live sees nobody');
SELECT is((SELECT count(*)::int FROM public.get_nearby_drivers_v3(NULL)), 0, 'a NULL caller sees nobody');


-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Temporal stabilization (30 s hold)
-- ═══════════════════════════════════════════════════════════════════════════

SELECT is(
  (SELECT count(*)::int FROM private.proximity_band_holds WHERE caller_id = pg_temp.u(1)),
  6, 'one hold row per visible target, none for hidden ones');

CREATE TEMP TABLE hold_before AS
  SELECT held_until FROM private.proximity_band_holds
  WHERE caller_id = pg_temp.u(1) AND target_session_id = pg_temp.sid(2);

-- zed moves from row 2 to row 6 (~1500 m): a fresh band would be 800-1600.
SELECT pg_temp.move(2, 6);
SELECT is(private.distance_band_for(pg_temp.qdist(1, 2)), '800m_to_1600m'::public.distance_band,
  'precondition: zed''s fresh band has changed');
SELECT is(pg_temp.band(1, 2), 'within_800m'::public.distance_band,
  'within the hold, zed keeps the held band even though a fresh one differs');

SELECT is(
  (SELECT count(DISTINCT pg_temp.band(1, 2))::int FROM generate_series(1, 25)),
  1, '25 rapid refetches return one band');

SELECT is(
  (SELECT held_until FROM private.proximity_band_holds
   WHERE caller_id = pg_temp.u(1) AND target_session_id = pg_temp.sid(2)),
  (SELECT held_until FROM hold_before),
  'polling does not extend the hold (it is not a sliding window)');

-- Restart: alice ends her session and goes live again, even with another range.
SELECT pg_temp.stop(1);
SELECT pg_temp.go_live(1, 0, 4800);
SELECT is(pg_temp.band(1, 2), 'within_800m'::public.distance_band,
  'restarting the caller''s session (new range too) does not bypass the hold');

-- The attacker moves themselves across a boundary inside the hold.
SELECT pg_temp.move(1, 3);
SELECT is(pg_temp.band(1, 2), 'within_800m'::public.distance_band,
  'moving the caller inside the hold does not resample the band');
SELECT pg_temp.move(1, 0);

SELECT pg_temp.expire_holds();
SELECT is(pg_temp.band(1, 2), '800m_to_1600m'::public.distance_band,
  'after the hold expires the band updates');
SELECT is(
  (SELECT count(*)::int FROM private.proximity_band_holds
   WHERE caller_id = pg_temp.u(1) AND target_session_id = pg_temp.sid(2)),
  1, 'still exactly one hold row for the pair');
SELECT cmp_ok(
  (SELECT held_until FROM private.proximity_band_holds
   WHERE caller_id = pg_temp.u(1) AND target_session_id = pg_temp.sid(2)),
  '=', now() + INTERVAL '30 seconds',
  'a new 30 s hold starts when the band is resampled');


-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Visibility is re-evaluated on every request, whatever is held
-- ═══════════════════════════════════════════════════════════════════════════

SELECT ok(EXISTS (SELECT 1 FROM private.proximity_band_holds
                  WHERE caller_id = pg_temp.u(1) AND target_session_id = pg_temp.sid(4)),
  'precondition: bob has a live hold row');

INSERT INTO public.blocks (blocker_id, blocked_id) VALUES (pg_temp.u(1), pg_temp.u(4));
SELECT ok(NOT ('bob' = ANY (pg_temp.names(1))), 'caller blocks bob: gone immediately despite the hold');
-- Unblocking inside the hold returns the held band, not a fresh sample.
SELECT pg_temp.move(4, 1);
DELETE FROM public.blocks WHERE blocker_id = pg_temp.u(1) AND blocked_id = pg_temp.u(4);
SELECT is(pg_temp.band(1, 4), '800m_to_1600m'::public.distance_band,
  'block/unblock inside the hold does not resample the band');

INSERT INTO public.blocks (blocker_id, blocked_id) VALUES (pg_temp.u(4), pg_temp.u(1));
SELECT ok(NOT ('bob' = ANY (pg_temp.names(1))), 'bob blocks the caller: gone immediately');
DELETE FROM public.blocks WHERE blocker_id = pg_temp.u(4);

UPDATE public.profiles SET is_banned = true WHERE id = pg_temp.u(4);
SELECT ok(NOT ('bob' = ANY (pg_temp.names(1))), 'banned target: gone immediately');
UPDATE public.profiles SET is_banned = false, is_shadow_banned = true WHERE id = pg_temp.u(4);
SELECT ok(NOT ('bob' = ANY (pg_temp.names(1))), 'shadow-banned target: gone immediately');
UPDATE public.profiles SET is_shadow_banned = false WHERE id = pg_temp.u(4);

UPDATE public.location_presence SET expires_at = now() - INTERVAL '1 second' WHERE user_id = pg_temp.u(4);
SELECT ok(NOT ('bob' = ANY (pg_temp.names(1))), 'stale target presence: gone immediately');
UPDATE public.location_presence SET expires_at = now() + INTERVAL '25 seconds' WHERE user_id = pg_temp.u(4);
UPDATE public.live_sessions SET expires_at = now() - INTERVAL '1 second' WHERE id = pg_temp.sid(4);
SELECT ok(NOT ('bob' = ANY (pg_temp.names(1))), 'expired target session: gone immediately');
UPDATE public.live_sessions SET expires_at = now() + INTERVAL '25 seconds' WHERE id = pg_temp.sid(4);
SELECT ok('bob' = ANY (pg_temp.names(1)), 'bob visible again once eligible');

CREATE TEMP TABLE bob_old AS SELECT pg_temp.sid(4) AS sid;
SELECT pg_temp.stop(4);
SELECT ok(NOT ('bob' = ANY (pg_temp.names(1))), 'Stop / Stop & Hide: gone immediately');
SELECT ok(EXISTS (SELECT 1 FROM private.proximity_band_holds h JOIN bob_old o ON o.sid = h.target_session_id),
  'even though the old session''s hold row still exists');

-- bob goes live again far away: the new session must not inherit the old band.
SELECT pg_temp.go_live(4, 16, 5000);
SELECT is(pg_temp.band(1, 4), 'beyond_3200m'::public.distance_band,
  'a new target session gets a fresh band, not the old session''s held one');

SELECT public.expire_stale_sessions();
SELECT is_empty(
  $$ SELECT 1 FROM private.proximity_band_holds WHERE held_until < now() $$,
  'the cleanup job removes expired holds');
UPDATE private.proximity_band_holds SET held_until = now() - INTERVAL '1 second'
WHERE target_session_id = (SELECT sid FROM bob_old);
SELECT public.expire_stale_sessions();
SELECT is_empty(
  $$ SELECT 1 FROM private.proximity_band_holds h JOIN bob_old o ON o.sid = h.target_session_id $$,
  'the cleanup job purges the ended session''s hold once it expires');


-- ═══════════════════════════════════════════════════════════════════════════
-- 8. Caller eligibility
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE public.profiles SET is_banned = true WHERE id = pg_temp.u(1);
SELECT is(pg_temp.names(1), '{}'::text[], 'a banned caller sees nobody');
UPDATE public.profiles SET is_banned = false WHERE id = pg_temp.u(1);

UPDATE public.location_presence SET expires_at = now() - INTERVAL '1 second' WHERE user_id = pg_temp.u(1);
SELECT is(pg_temp.names(1), '{}'::text[], 'a caller with expired presence sees nobody');
UPDATE public.location_presence SET expires_at = now() + INTERVAL '25 seconds' WHERE user_id = pg_temp.u(1);

UPDATE public.live_sessions SET expires_at = now() - INTERVAL '1 second' WHERE id = pg_temp.sid(1);
SELECT is(pg_temp.names(1), '{}'::text[], 'a caller with an expired session sees nobody');
UPDATE public.live_sessions SET expires_at = now() + INTERVAL '25 seconds' WHERE id = pg_temp.sid(1);


-- ═══════════════════════════════════════════════════════════════════════════
-- 9. Ranges: mutual, stepped, min, max
-- ═══════════════════════════════════════════════════════════════════════════

SELECT ok(NOT ('fay' = ANY (pg_temp.names(1))), 'fay (own range 800, ~1250 m) is hidden: range is mutual');
SELECT ok(NOT ('alice' = ANY (pg_temp.names(8))), 'and alice is hidden from fay');
SELECT pg_temp.move(8, 3);
SELECT ok('fay' = ANY (pg_temp.names(1)), 'fay within both ranges is visible');
SELECT pg_temp.move(8, 5);

-- max: a caller with the minimum step only sees people in the same cell.
SELECT pg_temp.mk_user(20, 'oli');
SELECT pg_temp.mk_user(21, 'pam');
SELECT pg_temp.go_live(20, 40.2, 100);
SELECT pg_temp.go_live(21, 40.0, 5000);
SELECT is(pg_temp.qdist(20, 21), 0::float8, 'precondition: oli and pam share a cell');
SELECT is(pg_temp.band(20, 21), 'within_800m'::public.distance_band, 'min range (100 m): same-cell driver visible');
SELECT pg_temp.move(21, 41.0);
SELECT is(pg_temp.names(20), '{}'::text[], 'min range: a driver one cell away is not');
SELECT pg_temp.stop(20);
SELECT pg_temp.stop(21);

-- A stored range that is not a step gives no extra resolution.
SELECT pg_temp.mk_user(22, 'quin');
SELECT pg_temp.go_live(22, 0.1, 4999);
SELECT ok(pg_temp.qdist(22, 16) BETWEEN 4800 AND 4999,
  'precondition: ned is between 4800 and 4999 m from quin');
SELECT ok(NOT ('ned' = ANY (pg_temp.names(22))), 'a 4999 m range behaves as the 4800 m step');
SELECT pg_temp.stop(22);


-- ═══════════════════════════════════════════════════════════════════════════
-- 10. Quantized predicate: the range edge is not an exact-distance oracle
-- ═══════════════════════════════════════════════════════════════════════════
-- Caller rob (range 800) is placed near the top of his cell.
--   sue near the bottom of the cell 4 rows up: exact ≈ 754 m, quantized ≈ 1000 m
--   tom near the top of the cell 3 rows up, with rob moved to the bottom of
--   his cell: exact ≈ 993 m, quantized ≈ 750 m

SELECT pg_temp.mk_user(23, 'rob');
SELECT pg_temp.mk_user(24, 'sue');
SELECT pg_temp.mk_user(25, 'tom');
SELECT pg_temp.go_live(23, 100.49, 800);
SELECT pg_temp.go_live(24, 103.51, 5000);
SELECT pg_temp.go_live(25, 200.0, 5000);

SELECT ok(pg_temp.xdist(23, 24) < 800 AND pg_temp.qdist(23, 24) > 800,
  'precondition: sue is inside 800 m exactly but outside it quantized');
SELECT ok(NOT ('sue' = ANY (pg_temp.names(23))), 'sue is hidden from rob (quantized predicate)');

SELECT pg_temp.move(23, 99.51);
SELECT pg_temp.move(25, 103.49);
SELECT ok(pg_temp.xdist(23, 25) > 800 AND pg_temp.qdist(23, 25) <= 800,
  'precondition: tom is outside 800 m exactly but inside it quantized');
SELECT ok('tom' = ANY (pg_temp.names(23)), 'tom is visible to rob (quantized predicate)');

-- Back to the top of his cell: tom (≈ 749 m either way) stays visible, sue
-- (exact ≈ 754 m, quantized ≈ 998 m) stays hidden.
SELECT pg_temp.move(23, 100.49);


-- ═══════════════════════════════════════════════════════════════════════════
-- 11. Open-channel speaking state matches the nearby set exactly
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.voice_sessions (user_id, live_session_id, is_speaking)
SELECT user_id, id, true FROM public.live_sessions
WHERE status = 'active' AND user_id IN (pg_temp.u(4), pg_temp.u(24), pg_temp.u(25));

CREATE TEMP TABLE nearby_alice AS
  SELECT user_id FROM public.get_nearby_drivers_v3(pg_temp.u(1));
CREATE TEMP TABLE nearby_rob AS
  SELECT user_id FROM public.get_nearby_drivers_v3(pg_temp.u(23));
GRANT SELECT ON nearby_alice, nearby_rob TO authenticated;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user(pg_temp.u(1));

SELECT set_eq(
  $$ SELECT DISTINCT user_id FROM public.voice_sessions WHERE room_id IS NULL $$,
  $$ SELECT user_id FROM nearby_alice $$,
  'alice receives open-channel speaking state for exactly her nearby set');
SELECT is_empty(
  $$ SELECT 1 FROM public.voice_sessions
     WHERE user_id IN (pg_temp.u(7), pg_temp.u(8), pg_temp.u(9), pg_temp.u(10),
                       pg_temp.u(11), pg_temp.u(12), pg_temp.u(13), pg_temp.u(14)) $$,
  'out-of-range, mutual-range, banned, shadow-banned, blocked and expired speakers are invisible');

SELECT pg_temp.as_user(pg_temp.u(23));
SELECT set_eq(
  $$ SELECT DISTINCT user_id FROM public.voice_sessions WHERE room_id IS NULL $$,
  $$ SELECT user_id FROM nearby_rob $$,
  'rob too: speaking state is never a wider proximity oracle than the nearby list');
SELECT is_empty(
  $$ SELECT 1 FROM public.voice_sessions WHERE user_id = pg_temp.u(24) $$,
  'sue (inside 800 m exactly, outside quantized) is not visible through Realtime either');

SELECT pg_temp.as_user(pg_temp.u(15));
SELECT is_empty($$ SELECT 1 FROM public.voice_sessions $$,
  'a user who is not live sees no open-channel speaking state');


-- ── Direct abuse as an authenticated client ─────────────────────────────────
SELECT pg_temp.as_user(pg_temp.u(1));
SELECT throws_ok($$ SELECT * FROM public.get_nearby_drivers_v3(pg_temp.u(1)) $$,
  '42501', NULL, 'v3 is not callable by clients');
SELECT throws_ok($$ SELECT * FROM public.get_nearby_drivers_v2(pg_temp.u(1), 5000) $$,
  '42501', NULL, 'v2 is not callable by clients');
SELECT throws_ok($$ SELECT * FROM private.proximity_band_holds $$,
  '42501', NULL, 'clients cannot read the hold table');
SELECT throws_ok($$ INSERT INTO private.proximity_band_holds VALUES (pg_temp.u(1), gen_random_uuid(), 'within_800m', now()) $$,
  '42501', NULL, 'clients cannot insert holds');
SELECT throws_ok($$ UPDATE private.proximity_band_holds SET held_until = now() $$,
  '42501', NULL, 'clients cannot update holds');
SELECT throws_ok($$ DELETE FROM private.proximity_band_holds $$,
  '42501', NULL, 'clients cannot delete holds');
SELECT throws_ok($$ SELECT private.nearby_pair_band(pg_temp.u(1), pg_temp.u(2)) $$,
  '42501', NULL, 'clients cannot call the pair predicate');
SELECT throws_ok($$ SELECT private.snap_to_proximity_grid(extensions.ST_SetSRID(extensions.ST_MakePoint(0, 0), 4326)::extensions.geography) $$,
  '42501', NULL, 'clients cannot call the grid function');
SELECT throws_ok($$ SELECT private.quantized_distance_m(
    extensions.ST_SetSRID(extensions.ST_MakePoint(0, 0), 4326)::extensions.geography,
    extensions.ST_SetSRID(extensions.ST_MakePoint(0, 1), 4326)::extensions.geography) $$,
  '42501', NULL, 'clients cannot call the quantized distance');
SELECT throws_ok($$ SELECT * FROM public.location_presence $$,
  '42501', NULL, 'clients still cannot read location_presence');

RESET ROLE;


-- ═══════════════════════════════════════════════════════════════════════════
-- 12. Adversarial session: a curious caller probing one target
-- ═══════════════════════════════════════════════════════════════════════════
-- Inside one hold, the attacker walks their own (spoofed) position back and
-- forth across the target's band edges, restarts the session with every
-- range step, blocks/unblocks, and refetches. Every observation must be the
-- same band. The target also moves across a boundary meanwhile.

SELECT pg_temp.mk_user(30, 'vic');   -- attacker
SELECT pg_temp.mk_user(31, 'wes');   -- target
SELECT pg_temp.go_live(31, 300.0, 5000);
SELECT pg_temp.go_live(30, 303.0, 5000);

CREATE FUNCTION pg_temp.probe() RETURNS TABLE (observations int, distinct_bands int, fresh_bands int)
LANGUAGE plpgsql AS $$
DECLARE
  v_obs   public.distance_band[] := '{}';
  v_fresh public.distance_band[] := '{}';
  v_range int;
  v_step  int := 0;
BEGIN
  FOR i IN 1..40 LOOP
    -- attacker position: rows 301..306 (band edge around row 303/304)
    PERFORM pg_temp.move(30, 300 + 1 + (i % 6));
    IF i % 8 = 0 THEN
      v_step := v_step + 1;
      v_range := (ARRAY[2000, 3000, 3200, 4800, 5000])[1 + v_step % 5];
      PERFORM pg_temp.stop(30);
      PERFORM pg_temp.go_live(30, 300 + 1 + (i % 6), v_range);
    END IF;
    IF i % 10 = 5 THEN
      INSERT INTO public.blocks (blocker_id, blocked_id) VALUES (pg_temp.u(30), pg_temp.u(31));
      DELETE FROM public.blocks WHERE blocker_id = pg_temp.u(30);
    END IF;
    IF i = 20 THEN
      PERFORM pg_temp.move(31, 299.0);   -- target crosses a band edge too
    END IF;
    v_obs   := v_obs   || pg_temp.band(30, 31);
    v_fresh := v_fresh || private.distance_band_for(pg_temp.qdist(30, 31));
  END LOOP;
  RETURN QUERY SELECT
    cardinality(v_obs),
    (SELECT count(DISTINCT b)::int FROM unnest(v_obs) b),
    (SELECT count(DISTINCT b)::int FROM unnest(v_fresh) b);
END;
$$;

SELECT results_eq(
  $$ SELECT observations, distinct_bands, fresh_bands > 1 FROM pg_temp.probe() $$,
  $$ VALUES (40, 1, true) $$,
  '40 probes (moving, restarting with every range, block/unblock, refetch) inside one hold see one band, although fresh bands varied');

SELECT pg_temp.expire_holds();
SELECT isnt(pg_temp.band(30, 31), NULL, 'after the hold the attacker gets exactly one new sample');
SELECT is(
  (SELECT count(*)::int FROM private.proximity_band_holds WHERE caller_id = pg_temp.u(30)),
  1, 'and there is still one hold row for the pair');

SELECT * FROM finish();
ROLLBACK;

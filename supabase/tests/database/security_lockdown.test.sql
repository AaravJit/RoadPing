-- pgTAP: migration 010 security lockdown + trusted proximity.
-- Run with `supabase test db`, or scripts/db-test/run.sh without Docker.
BEGIN;
SELECT plan(47);

-- ── Fixtures (as the migration owner, bypassing RLS) ─────────────────────────
-- Around (37.0, -122.0). 0.0045° latitude ≈ 500 m.

CREATE FUNCTION pg_temp.mk_user(p_id uuid, p_name text) RETURNS void
LANGUAGE sql AS $$
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES (p_id, p_name || '@example.test', jsonb_build_object('display_name', p_name));
$$;

CREATE FUNCTION pg_temp.go_live(p_id uuid, p_lat float8, p_lng float8, p_range int) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE v_sid uuid;
BEGIN
  INSERT INTO public.live_sessions (user_id, range_m) VALUES (p_id, p_range) RETURNING id INTO v_sid;
  PERFORM public.upsert_location_presence(p_id, v_sid, p_lat, p_lng);
  RETURN v_sid;
END;
$$;

CREATE FUNCTION pg_temp.as_user(p_id uuid) RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
-- Migration 010 removes the default EXECUTE-to-PUBLIC for functions this
-- role creates (in any schema, pg_temp included), so grant it explicitly.
GRANT EXECUTE ON FUNCTION pg_temp.as_user(uuid) TO authenticated;

SELECT pg_temp.mk_user('00000000-0000-0000-0000-00000000000a', 'alice');   -- caller
SELECT pg_temp.mk_user('00000000-0000-0000-0000-00000000000b', 'bob');     -- 500 m, visible
SELECT pg_temp.mk_user('00000000-0000-0000-0000-00000000000c', 'carol');   -- 22 km, out of range
SELECT pg_temp.mk_user('00000000-0000-0000-0000-00000000000d', 'dan');     -- 1 km, has blocked alice
SELECT pg_temp.mk_user('00000000-0000-0000-0000-00000000000e', 'erin');    -- 3 km, own range 1 km
SELECT pg_temp.mk_user('00000000-0000-0000-0000-00000000000f', 'frank');   -- 500 m, presence expired
SELECT pg_temp.mk_user('00000000-0000-0000-0000-000000000010', 'gina');    -- 500 m, banned
SELECT pg_temp.mk_user('00000000-0000-0000-0000-000000000011', 'hank');    -- not live

SELECT pg_temp.go_live('00000000-0000-0000-0000-00000000000a', 37.0000, -122.0, 5000);
SELECT pg_temp.go_live('00000000-0000-0000-0000-00000000000b', 37.0045, -122.0, 2000);
SELECT pg_temp.go_live('00000000-0000-0000-0000-00000000000c', 37.2000, -122.0, 5000);
SELECT pg_temp.go_live('00000000-0000-0000-0000-00000000000d', 37.0090, -122.0, 5000);
SELECT pg_temp.go_live('00000000-0000-0000-0000-00000000000e', 37.0270, -122.0, 1000);
SELECT pg_temp.go_live('00000000-0000-0000-0000-00000000000f', 37.0045, -122.0, 5000);
SELECT pg_temp.go_live('00000000-0000-0000-0000-000000000010', 37.0045, -122.0, 5000);

UPDATE public.location_presence SET expires_at = now() - INTERVAL '1 minute'
WHERE user_id = '00000000-0000-0000-0000-00000000000f';
UPDATE public.profiles SET is_banned = true
WHERE id = '00000000-0000-0000-0000-000000000010';
INSERT INTO public.blocks (blocker_id, blocked_id)
VALUES ('00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-00000000000a');

-- Open-channel speaking rows for bob (nearby), carol (far), dan (blocker)
INSERT INTO public.voice_sessions (user_id, live_session_id, is_speaking)
SELECT ls.user_id, ls.id, true
FROM public.live_sessions ls
WHERE ls.user_id IN ('00000000-0000-0000-0000-00000000000b',
                     '00000000-0000-0000-0000-00000000000c',
                     '00000000-0000-0000-0000-00000000000d');
-- An old bob row that must not be visible as history
INSERT INTO public.voice_sessions (user_id, live_session_id, is_speaking, started_at, ended_at)
SELECT ls.user_id, ls.id, false, now() - INTERVAL '10 minutes', now() - INTERVAL '9 minutes'
FROM public.live_sessions ls WHERE ls.user_id = '00000000-0000-0000-0000-00000000000b';

-- Private room owned by bob
INSERT INTO public.rooms (id, owner_id, name, is_private, invite_code)
VALUES ('00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-00000000000b', 'crew', true, 'CREW1');


-- ── 1. Function privileges ───────────────────────────────────────────────────

SELECT is_empty(
  $$ SELECT p.oid::regprocedure::text FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
       AND has_function_privilege('anon', p.oid, 'EXECUTE') $$,
  'no SECURITY DEFINER function in public is executable by anon'
);

SELECT is_empty(
  $$ SELECT p.oid::regprocedure::text FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
       AND has_function_privilege('authenticated', p.oid, 'EXECUTE') $$,
  'no SECURITY DEFINER function in public is executable by authenticated'
);

SELECT is_empty(
  $$ SELECT f FROM unnest(ARRAY[
       'public.check_private_zone(uuid,double precision,double precision)',
       'public.upsert_location_presence(uuid,uuid,double precision,double precision)',
       'public.update_location_heartbeat(uuid,uuid,double precision,double precision)',
       'public.end_live_session(uuid,uuid,public.session_ended_reason)',
       'public.expire_stale_sessions()',
       'public.get_nearby_drivers(double precision,double precision,double precision,uuid)',
       'public.get_nearby_drivers_v2(uuid,integer)',
       'public.consume_rate_limit(uuid,text,integer,integer)'
     ]) AS f
     WHERE NOT has_function_privilege('service_role', f, 'EXECUTE') $$,
  'service_role can execute every Edge Function helper'
);

SELECT is_empty(
  $$ SELECT f FROM unnest(ARRAY[
       'private.is_room_member(uuid)',
       'private.is_room_owner(uuid)',
       'private.can_view_open_voice(uuid)'
     ]) AS f
     WHERE NOT has_function_privilege('authenticated', f, 'EXECUTE') $$,
  'authenticated can execute the private RLS helpers'
);

SELECT ok(NOT has_schema_privilege('anon', 'private', 'USAGE'), 'anon has no USAGE on private');
SELECT ok(NOT has_table_privilege('authenticated', 'private.rate_limits', 'SELECT'), 'rate_limits not readable by clients');


-- ── 2. Direct PostgREST-style abuse as an authenticated user ────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('00000000-0000-0000-0000-000000000011');

SELECT throws_ok(
  $$ SELECT public.check_private_zone('00000000-0000-0000-0000-00000000000b', 37.0, -122.0) $$,
  '42501', NULL, 'check_private_zone is not callable by clients');
SELECT throws_ok(
  $$ SELECT * FROM public.get_nearby_drivers(37.0, -122.0, 5000, '00000000-0000-0000-0000-000000000011') $$,
  '42501', NULL, 'legacy get_nearby_drivers is not callable by clients');
SELECT throws_ok(
  $$ SELECT * FROM public.get_nearby_drivers_v2('00000000-0000-0000-0000-00000000000a', 5000) $$,
  '42501', NULL, 'get_nearby_drivers_v2 is not callable by clients');
SELECT throws_ok(
  $$ SELECT public.end_live_session(gen_random_uuid(), '00000000-0000-0000-0000-00000000000b', 'user_stopped') $$,
  '42501', NULL, 'end_live_session is not callable by clients');
SELECT throws_ok(
  $$ SELECT public.update_location_heartbeat('00000000-0000-0000-0000-00000000000b', gen_random_uuid(), 0, 0) $$,
  '42501', NULL, 'update_location_heartbeat is not callable by clients');
SELECT throws_ok(
  $$ SELECT public.is_blocked('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000d') $$,
  '42501', NULL, 'is_blocked is not callable by clients');

SELECT throws_ok(
  $$ INSERT INTO public.live_sessions (user_id) VALUES ('00000000-0000-0000-0000-000000000011') $$,
  '42501', NULL, 'clients cannot insert live_sessions');
SELECT throws_ok(
  $$ UPDATE public.live_sessions SET expires_at = now() + INTERVAL '1 day' $$,
  '42501', NULL, 'clients cannot update live_sessions');
SELECT throws_ok(
  $$ SELECT * FROM public.location_presence $$,
  '42501', NULL, 'clients cannot read location_presence');
SELECT throws_ok(
  $$ INSERT INTO public.voice_sessions (user_id, live_session_id, is_speaking)
     VALUES ('00000000-0000-0000-0000-000000000011', gen_random_uuid(), true) $$,
  '42501', NULL, 'clients cannot insert voice_sessions');
SELECT lives_ok(
  $$ SELECT id FROM public.live_sessions WHERE status = 'active' $$,
  'clients can still read their own live_sessions');

RESET ROLE;


-- ── 3. Trusted proximity ─────────────────────────────────────────────────────

SELECT results_eq(
  $$ SELECT user_id FROM public.get_nearby_drivers_v2('00000000-0000-0000-0000-00000000000a', 5000) $$,
  $$ VALUES ('00000000-0000-0000-0000-00000000000b'::uuid) $$,
  'nearby excludes far, blocked-by-target, out-of-their-range, expired and banned drivers'
);

SELECT is(
  (SELECT approximate_distance_m FROM public.get_nearby_drivers_v2('00000000-0000-0000-0000-00000000000a', 5000)),
  500,
  'distance measured from the caller''s stored presence, rounded to 50 m'
);

SELECT is_empty(
  $$ SELECT 1 FROM public.get_nearby_drivers_v2('00000000-0000-0000-0000-00000000000a', 400) $$,
  'caller range is honoured'
);

SELECT is_empty(
  $$ SELECT 1 FROM public.get_nearby_drivers_v2('00000000-0000-0000-0000-000000000011', 5000) $$,
  'a caller without live presence sees nobody'
);

SELECT is_empty(
  $$ SELECT 1 FROM public.get_nearby_drivers_v2('00000000-0000-0000-0000-00000000000f', 5000) $$,
  'a caller whose own presence expired sees nobody'
);


-- ── 4. Open-channel speaking state visibility ────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('00000000-0000-0000-0000-00000000000a');

SELECT results_eq(
  $$ SELECT DISTINCT user_id FROM public.voice_sessions WHERE room_id IS NULL $$,
  $$ VALUES ('00000000-0000-0000-0000-00000000000b'::uuid) $$,
  'alice sees only nearby, unblocked speakers'
);
SELECT is(
  (SELECT count(*)::int FROM public.voice_sessions WHERE room_id IS NULL),
  1,
  'old speaking rows are not visible as history'
);

SELECT pg_temp.as_user('00000000-0000-0000-0000-000000000011');
SELECT is_empty(
  $$ SELECT 1 FROM public.voice_sessions $$,
  'a user who is not live sees no open-channel speaking state'
);


-- ── 5. Room policies still work through the private helpers ─────────────────

SELECT pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
SELECT is_empty($$ SELECT 1 FROM public.rooms WHERE id = '00000000-0000-0000-0000-0000000000aa' $$,
  'non-member cannot see a private room');

SELECT pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
SELECT lives_ok(
  $$ INSERT INTO public.room_members (room_id, user_id)
     VALUES ('00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-00000000000a') $$,
  'owner can still add a member');

SELECT pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
SELECT is((SELECT count(*)::int FROM public.room_members WHERE room_id = '00000000-0000-0000-0000-0000000000aa'),
  2, 'member sees the room roster');

RESET ROLE;


-- ── 6. Rate limiting ─────────────────────────────────────────────────────────

SELECT is(
  ARRAY[
    public.consume_rate_limit('00000000-0000-0000-0000-00000000000a', 'test', 2, 60),
    public.consume_rate_limit('00000000-0000-0000-0000-00000000000a', 'test', 2, 60),
    public.consume_rate_limit('00000000-0000-0000-0000-00000000000a', 'test', 2, 60)
  ],
  ARRAY[true, true, false],
  'third call in the window is over the limit'
);


-- ── 7. Heartbeat jump tolerance ──────────────────────────────────────────────

CREATE FUNCTION pg_temp.dist_from(p_user uuid, p_lat float8, p_lng float8) RETURNS float8
LANGUAGE sql AS $$
  SELECT extensions.ST_Distance(location,
    extensions.ST_SetSRID(extensions.ST_MakePoint(p_lng, p_lat), 4326)::extensions.geography)
  FROM public.location_presence WHERE user_id = p_user;
$$;

CREATE FUNCTION pg_temp.hb(p_user uuid, p_lat float8, p_lng float8) RETURNS timestamptz
LANGUAGE sql AS $$
  SELECT public.update_location_heartbeat(p_user, ls.id, p_lat, p_lng)
  FROM public.live_sessions ls WHERE ls.user_id = p_user AND ls.status = 'active';
$$;

-- ── 7a. Live-session lifecycle: bounded reconnect grace (35 s) ─────────────

-- bob: 10 s past expiry, inside the grace
UPDATE public.live_sessions     SET expires_at = now() - INTERVAL '10 seconds' WHERE user_id = '00000000-0000-0000-0000-00000000000b';
UPDATE public.location_presence SET expires_at = now() - INTERVAL '10 seconds' WHERE user_id = '00000000-0000-0000-0000-00000000000b';
-- dan and erin: 40 s past expiry, beyond the grace
UPDATE public.live_sessions     SET expires_at = now() - INTERVAL '40 seconds'
WHERE user_id IN ('00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-00000000000e');
UPDATE public.location_presence SET expires_at = now() - INTERVAL '40 seconds'
WHERE user_id IN ('00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-00000000000e');

SELECT is_empty(
  $$ SELECT 1 FROM public.get_nearby_drivers_v2('00000000-0000-0000-0000-00000000000a', 5000) $$,
  'a driver past expires_at is hidden immediately, even inside the grace');

SELECT public.expire_stale_sessions();

SELECT is((SELECT status::text FROM public.live_sessions WHERE user_id = '00000000-0000-0000-0000-00000000000b' ORDER BY started_at DESC LIMIT 1),
  'active', 'cleanup leaves a session inside the grace alone');
SELECT is((SELECT status::text FROM public.live_sessions WHERE user_id = '00000000-0000-0000-0000-00000000000e' ORDER BY started_at DESC LIMIT 1),
  'expired', 'cleanup expires a session past the grace');

SELECT isnt(pg_temp.hb('00000000-0000-0000-0000-00000000000b', 37.0045, -122.0), NULL,
  'a heartbeat inside the grace resumes the same session');
SELECT results_eq(
  $$ SELECT user_id FROM public.get_nearby_drivers_v2('00000000-0000-0000-0000-00000000000a', 5000) $$,
  $$ VALUES ('00000000-0000-0000-0000-00000000000b'::uuid) $$,
  'the resumed driver is visible again');

-- dan's session is still status=active (cleanup already ran, so simulate a
-- late cron by resetting erin-style state only for dan): heartbeat decides.
UPDATE public.live_sessions SET status = 'active', ended_at = NULL, ended_reason = NULL,
       expires_at = now() - INTERVAL '40 seconds'
WHERE user_id = '00000000-0000-0000-0000-00000000000d'
  AND id = (SELECT id FROM public.live_sessions WHERE user_id = '00000000-0000-0000-0000-00000000000d' ORDER BY started_at DESC LIMIT 1);
INSERT INTO public.location_presence (user_id, session_id, location, expires_at)
SELECT user_id, id, extensions.ST_SetSRID(extensions.ST_MakePoint(-122.0, 37.009), 4326)::extensions.geography,
       now() - INTERVAL '40 seconds'
FROM public.live_sessions WHERE user_id = '00000000-0000-0000-0000-00000000000d' AND status = 'active'
ON CONFLICT (user_id) DO NOTHING;

SELECT is(pg_temp.hb('00000000-0000-0000-0000-00000000000d', 37.009, -122.0), NULL,
  'a heartbeat past the grace cannot revive the session, even before cron runs');
SELECT is((SELECT status::text FROM public.live_sessions WHERE user_id = '00000000-0000-0000-0000-00000000000d' ORDER BY started_at DESC LIMIT 1),
  'expired', 'the late heartbeat ends the session as expired');
SELECT is_empty($$ SELECT 1 FROM public.location_presence WHERE user_id = '00000000-0000-0000-0000-00000000000d' $$,
  'and removes its presence');


SELECT isnt(pg_temp.hb('00000000-0000-0000-0000-00000000000a', 37.0018, -122.0), NULL, 'heartbeat returns new expiry');
SELECT ok(pg_temp.dist_from('00000000-0000-0000-0000-00000000000a', 37.0018, -122.0) < 1,
  '200 m move within GPS/speed envelope is accepted');

SELECT pg_temp.hb('00000000-0000-0000-0000-00000000000a', 37.5, -122.0);
SELECT ok(pg_temp.dist_from('00000000-0000-0000-0000-00000000000a', 37.0018, -122.0) < 1,
  '55 km teleport is held at the last accepted position');

UPDATE public.location_presence SET pending_since = now() - INTERVAL '30 seconds'
WHERE user_id = '00000000-0000-0000-0000-00000000000a';
SELECT pg_temp.hb('00000000-0000-0000-0000-00000000000a', 37.5005, -122.0);
SELECT ok(pg_temp.dist_from('00000000-0000-0000-0000-00000000000a', 37.0018, -122.0) < 1,
  'two consistent reports are not yet enough');
SELECT pg_temp.hb('00000000-0000-0000-0000-00000000000a', 37.5010, -122.0);
SELECT ok(pg_temp.dist_from('00000000-0000-0000-0000-00000000000a', 37.5010, -122.0) < 1,
  'three consistent reports over 20 s relocate the user');

SELECT is(
  public.update_location_heartbeat('00000000-0000-0000-0000-000000000011', gen_random_uuid(), 37.0, -122.0),
  NULL,
  'heartbeat without an active session returns NULL'
);


-- ── 8. Default privileges for future functions ──────────────────────────────
-- Runs as the migration role, like a future migration would.

CREATE FUNCTION public.rp_future_definer() RETURNS int
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS 'SELECT 1';
CREATE FUNCTION extensions.rp_future_ext() RETURNS int
LANGUAGE sql AS 'SELECT 1';

SELECT ok(
  NOT has_function_privilege('anon', 'public.rp_future_definer()', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.rp_future_definer()', 'EXECUTE'),
  'a new SECURITY DEFINER function in public is not client-executable without any REVOKE');
SELECT ok(has_function_privilege('service_role', 'public.rp_future_definer()', 'EXECUTE'),
  'service_role still gets new public functions (Edge Function helpers)');
SELECT ok(
  has_function_privilege('anon', 'extensions.rp_future_ext()', 'EXECUTE')
  AND has_function_privilege('authenticated', 'extensions.st_dwithin(extensions.geography, extensions.geography, double precision, boolean)', 'EXECUTE'),
  'extension functions (new and existing) stay executable');


-- ── 9. search_path hardening ─────────────────────────────────────────────────

SELECT is_empty(
  $$ SELECT p.oid::regprocedure::text FROM pg_proc p
     WHERE p.oid::regprocedure::text IN (
       'private.is_room_member(uuid)', 'private.is_room_owner(uuid)',
       'private.can_view_open_voice(uuid)', 'private.live_session_grace()',
       'upsert_location_presence(uuid,uuid,double precision,double precision)',
       'update_location_heartbeat(uuid,uuid,double precision,double precision)',
       'get_nearby_drivers_v2(uuid,integer)',
       'consume_rate_limit(uuid,text,integer,integer)',
       'expire_stale_sessions()')
       AND NOT (p.proconfig @> ARRAY['search_path=""']) $$,
  'every function created or replaced by migration 010 pins an empty search_path');

SELECT * FROM finish();
ROLLBACK;

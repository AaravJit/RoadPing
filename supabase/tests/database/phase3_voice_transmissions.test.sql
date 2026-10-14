-- pgTAP: migration 013 server-authorized push-to-talk transmissions (Phase 3).
-- Migration: 20261001000013_voice_transmissions
-- Run with `supabase test db`, or scripts/db-test/run.sh without Docker.
-- Design: docs/PHASE3_VOICE_PTT.md.
--
-- Everything runs in one transaction, so now() is constant: expiry is
-- simulated by moving timestamps into the past.
BEGIN;
SELECT plan(118);

-- ── Helpers (same grid as the Phase 2 test) ─────────────────────────────────
CREATE FUNCTION pg_temp.dlat() RETURNS float8 LANGUAGE sql AS $$ SELECT 250 / 111195.08 $$;
CREATE FUNCTION pg_temp.row_lat(k float8) RETURNS float8 LANGUAGE sql AS $$
  SELECT -90 + (floor((37.0 + 90) / pg_temp.dlat()) + 0.5) * pg_temp.dlat() + k * pg_temp.dlat()
$$;
CREATE FUNCTION pg_temp.u(p_n int) RETURNS uuid LANGUAGE sql AS $$
  SELECT ('30000000-0000-0000-0000-' || lpad(p_n::text, 12, '0'))::uuid
$$;
CREATE FUNCTION pg_temp.c(p_n int) RETURNS uuid LANGUAGE sql AS $$
  SELECT ('c0000000-0000-0000-0000-' || lpad(p_n::text, 12, '0'))::uuid
$$;
CREATE FUNCTION pg_temp.inst(p_n int) RETURNS uuid LANGUAGE sql AS $$
  SELECT ('1a000000-0000-0000-0000-' || lpad(p_n::text, 12, '0'))::uuid
$$;
CREATE FUNCTION pg_temp.tok(p_n int) RETURNS text LANGUAGE sql AS $$
  SELECT lpad(to_hex(p_n), 64, 'a')
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
CREATE FUNCTION pg_temp.sid(p_n int) RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM public.live_sessions WHERE user_id = pg_temp.u(p_n) AND status = 'active';
$$;
CREATE FUNCTION pg_temp.stop(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT public.end_live_session(ls.id, ls.user_id, 'user_stopped')
  FROM public.live_sessions ls WHERE ls.user_id = pg_temp.u(p_n) AND ls.status = 'active';
$$;
CREATE FUNCTION pg_temp.begin_tx(p_n int, p_c int) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.voice_begin_transmission(pg_temp.u(p_n), pg_temp.c(p_c));
$$;
CREATE FUNCTION pg_temp.tx(p_n int, p_c int) RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM private.voice_transmissions WHERE speaker_id = pg_temp.u(p_n) AND client_tx_id = pg_temp.c(p_c);
$$;
CREATE FUNCTION pg_temp.can(p_listener int, p_tx uuid) RETURNS boolean LANGUAGE sql AS $$
  SELECT (public.voice_listener_grant(pg_temp.u(p_listener), p_tx, NULL) ->> 'ok')::boolean;
$$;
CREATE FUNCTION pg_temp.fanout(p_tx uuid) RETURNS uuid[] LANGUAGE sql AS $$
  SELECT COALESCE(array_agg(listener_id ORDER BY listener_id), '{}')
  FROM public.voice_fanout_targets(p_tx);
$$;
CREATE FUNCTION pg_temp.reg(p_n int, p_token text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.register_ptt_token(pg_temp.u(p_n), pg_temp.inst(p_n), pg_temp.sid(p_n), p_token, 'production');
$$;

-- ── Fixture ─────────────────────────────────────────────────────────────────
-- Rows north of the speaker (row 0). 1 row ≈ 250 m.
--   1 alice  speaker, 3200 m range
--   2 bob    2 rows, 3200 m           → hears nearby
--   3 carol  30 rows (~7.5 km)        → too far
--   4 dave   2 rows, dnd              → excluded
--   5 erin   2 rows, blocks alice     → excluded
--   6 frank  2 rows, blocked by alice → excluded
--   7 gina   2 rows, not live         → excluded
--   8 hank   40 rows, room member     → hears room only
--   9 ivy    2 rows, banned later
--  10 jack   2 rows, 800 m range, 5 rows away → out of his own range
SELECT pg_temp.mk_user(n, nm) FROM (VALUES
  (1,'alice'),(2,'bob'),(3,'carol'),(4,'dave'),(5,'erin'),
  (6,'frank'),(7,'gina'),(8,'hank'),(9,'ivy'),(10,'jack')) v(n, nm);

SELECT pg_temp.go_live(1, 0, 3200);
SELECT pg_temp.go_live(2, 2, 3200);
SELECT pg_temp.go_live(3, 30, 4800);
SELECT pg_temp.go_live(4, 2, 3200);
SELECT pg_temp.go_live(5, 2, 3200);
SELECT pg_temp.go_live(6, 2, 3200);
SELECT pg_temp.go_live(8, 40, 4800);
SELECT pg_temp.go_live(9, 2, 3200);
SELECT pg_temp.go_live(10, 5, 800);
UPDATE public.profiles SET dnd_mode = true WHERE id = pg_temp.u(4);
INSERT INTO public.blocks (blocker_id, blocked_id) VALUES
  (pg_temp.u(5), pg_temp.u(1)),
  (pg_temp.u(1), pg_temp.u(6));

-- ═══ Privileges ═════════════════════════════════════════════════════════════
SELECT is_empty($$
  SELECT p.oid::regprocedure::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE (n.nspname, p.proname) IN (('public','voice_set_context'),('public','voice_begin_transmission'),
    ('public','voice_confirm_transmission'),('public','voice_end_transmission'),('public','voice_listener_grant'),
    ('public','voice_fanout_targets'),('public','register_ptt_token'),('public','unregister_ptt_token'),
    ('public','drop_ptt_token'),('public','voice_block_kicks'))
    AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE')) $$,
  'no voice or PTT RPC is executable by anon or authenticated');
SELECT is((
  SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE (n.nspname, p.proname) IN (('public','voice_set_context'),('public','voice_begin_transmission'),
    ('public','voice_confirm_transmission'),('public','voice_end_transmission'),('public','voice_listener_grant'),
    ('public','voice_fanout_targets'),('public','register_ptt_token'),('public','unregister_ptt_token'),
    ('public','drop_ptt_token'),('public','voice_block_kicks'))
    AND has_function_privilege('service_role', p.oid, 'EXECUTE')), 10,
  'all ten voice and PTT RPCs are executable by service_role');
SELECT is_empty($$
  SELECT p.oid::regprocedure::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'private'
    AND p.proname IN ('voice_can_listen','voice_listener_uid','active_live_session','voice_end_where','voice_hard_end')
    AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
         OR has_function_privilege('service_role', p.oid, 'EXECUTE')) $$,
  'private voice helpers are executable by nobody but their owner');
SELECT is_empty($$
  SELECT t, r, priv
  FROM unnest(ARRAY['private.voice_transmissions','private.voice_contexts','private.ptt_push_tokens']) t,
       unnest(ARRAY['anon','authenticated','service_role']) r,
       unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) priv
  WHERE has_table_privilege(r, t, priv) $$,
  'voice tables grant nothing to anon, authenticated or service_role');
SELECT ok((SELECT bool_and(c.relrowsecurity) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'private' AND c.relname IN ('voice_transmissions','voice_contexts','ptt_push_tokens')),
  'RLS is enabled on all voice tables');
SELECT is_empty($$
  SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE (n.nspname = 'public' AND p.proname IN ('voice_set_context','voice_begin_transmission','voice_confirm_transmission',
           'voice_end_transmission','voice_listener_grant','voice_fanout_targets','register_ptt_token',
           'unregister_ptt_token','drop_ptt_token','end_live_session','expire_stale_sessions'))
     OR (n.nspname = 'private' AND p.proname IN ('voice_can_listen','voice_listener_uid','active_live_session','voice_end_where'))
    AND true
  EXCEPT
  SELECT p.proname FROM pg_proc p
  WHERE p.proconfig @> ARRAY['search_path=""'] $$,
  'every voice function pins an empty search_path');
SELECT is(public.voice_begin_transmission(pg_temp.u(8), pg_temp.c(99)) ->> 'created', 'true', 'a first begin is reported as created');
SELECT public.voice_end_transmission(pg_temp.u(8), NULL, 'aborted');
SELECT ok(NOT has_function_privilege('authenticated', 'public.end_live_session(uuid,uuid,public.session_ended_reason)', 'EXECUTE')
          AND has_function_privilege('service_role', 'public.end_live_session(uuid,uuid,public.session_ended_reason)', 'EXECUTE'),
  'end_live_session keeps service_role-only EXECUTE after replacement');
SELECT ok(NOT has_function_privilege('authenticated', 'public.expire_stale_sessions()', 'EXECUTE')
          AND has_function_privilege('service_role', 'public.expire_stale_sessions()', 'EXECUTE'),
  'expire_stale_sessions keeps service_role-only EXECUTE after replacement');

-- ═══ Begin ══════════════════════════════════════════════════════════════════
SELECT is(pg_temp.begin_tx(7, 1) ->> 'error', 'not_live', 'a user who is not live cannot begin');
SELECT is(public.voice_begin_transmission(pg_temp.u(1), NULL) ->> 'error', 'invalid', 'a missing client id is rejected');

SELECT ok((pg_temp.begin_tx(1, 1) ->> 'ok')::boolean, 'a live user can begin');
SELECT matches(pg_temp.begin_tx(1, 1) ->> 'channel', '^rpt_[0-9a-f]{32}$', 'channel name is opaque random hex');
SELECT ok((pg_temp.begin_tx(1, 1) ->> 'speaker_uid')::int BETWEEN 1 AND 1073741823, 'speaker uid is in the speaker range');
SELECT is(pg_temp.begin_tx(1, 1) ->> 'state', 'arming', 'a new transmission is arming');
SELECT is((pg_temp.begin_tx(1, 1) ->> 'transmission_id')::uuid, pg_temp.tx(1, 1), 'begin is idempotent per client id');
SELECT is(pg_temp.begin_tx(1, 1) ->> 'created', 'false', 'a retried begin is not reported as created (no second fan-out)');
SELECT is((SELECT count(*)::int FROM private.voice_transmissions WHERE speaker_id = pg_temp.u(1)), 1,
  'a retried begin creates no second row');
SELECT is(pg_temp.begin_tx(1, 1) ->> 'room_id', NULL, 'Nearby is the default context');
SELECT ok(pg_temp.begin_tx(1, 1) ->> 'channel' NOT LIKE '%' || pg_temp.u(1)::text || '%'
          AND pg_temp.begin_tx(1, 1) ->> 'channel' NOT LIKE '%' || pg_temp.sid(1)::text || '%',
  'channel name contains neither the user id nor the session id');
SELECT ok((SELECT hard_end_at = now() + INTERVAL '70 seconds' FROM private.voice_transmissions WHERE id = pg_temp.tx(1, 1)),
  'hard end is 70 s after begin');
SELECT is_empty($$ SELECT 1 FROM public.voice_sessions WHERE user_id = pg_temp.u(1) $$,
  'no public speaking state before confirm');

-- ═══ Nearby listener predicate ══════════════════════════════════════════════
SELECT ok(pg_temp.can(2, pg_temp.tx(1, 1)),       'bob (in range, live) may listen');
SELECT ok(NOT pg_temp.can(3, pg_temp.tx(1, 1)),   'carol (too far) may not listen');
SELECT ok(NOT pg_temp.can(4, pg_temp.tx(1, 1)),   'dave (Do Not Disturb) may not listen');
SELECT ok(NOT pg_temp.can(5, pg_temp.tx(1, 1)),   'erin (blocked the speaker) may not listen');
SELECT ok(NOT pg_temp.can(6, pg_temp.tx(1, 1)),   'frank (blocked by the speaker) may not listen');
SELECT ok(NOT pg_temp.can(7, pg_temp.tx(1, 1)),   'gina (not live) may not listen');
SELECT ok(NOT pg_temp.can(8, pg_temp.tx(1, 1)),   'hank (too far) may not listen to Nearby');
SELECT ok(NOT pg_temp.can(10, pg_temp.tx(1, 1)),  'jack (outside his own 800 m range) may not listen');
SELECT ok(NOT pg_temp.can(1, pg_temp.tx(1, 1)),   'the speaker gets no listener grant');
SELECT is(public.voice_listener_grant(pg_temp.u(2), gen_random_uuid(), NULL),
          public.voice_listener_grant(pg_temp.u(3), pg_temp.tx(1, 1), NULL),
  'an unknown transmission and a denied one get the identical answer');
SELECT is(public.voice_listener_grant(pg_temp.u(2), NULL, NULL) ->> 'error', 'denied', 'a grant without an id is denied');

SELECT is(
  (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(public.voice_listener_grant(pg_temp.u(2), pg_temp.tx(1, 1), NULL)) k),
  ARRAY['channel','hard_end_at','listener_uid','ok','room_id','speaker_id','speaker_uid','transmission_id'],
  'a grant carries no location, distance or band');
SELECT ok((public.voice_listener_grant(pg_temp.u(2), pg_temp.tx(1, 1), NULL) ->> 'listener_uid')::bigint BETWEEN 1073741824 AND 2147483647,
  'listener uid is outside the speaker uid range');
SELECT is(public.voice_listener_grant(pg_temp.u(2), pg_temp.tx(1, 1), NULL) ->> 'listener_uid',
          public.voice_listener_grant(pg_temp.u(2), pg_temp.tx(1, 1), NULL) ->> 'listener_uid',
  'listener uid is stable across renewals');
SELECT isnt(public.voice_listener_grant(pg_temp.u(2), pg_temp.tx(1, 1), NULL) ->> 'listener_uid',
            public.voice_listener_grant(pg_temp.u(9), pg_temp.tx(1, 1), NULL) ->> 'listener_uid',
  'different listeners get different uids');

-- Moving out of range revokes on the next renewal
UPDATE public.location_presence SET location = extensions.ST_SetSRID(extensions.ST_MakePoint(-122.0, pg_temp.row_lat(50)), 4326)::extensions.geography
WHERE user_id = pg_temp.u(2);
SELECT ok(NOT pg_temp.can(2, pg_temp.tx(1, 1)), 'bob moved out of range: renewal denied');
UPDATE public.location_presence SET location = extensions.ST_SetSRID(extensions.ST_MakePoint(-122.0, pg_temp.row_lat(2)), 4326)::extensions.geography
WHERE user_id = pg_temp.u(2);
SELECT ok(pg_temp.can(2, pg_temp.tx(1, 1)), 'bob back in range: allowed again');

-- A new block revokes immediately
INSERT INTO public.blocks (blocker_id, blocked_id) VALUES (pg_temp.u(2), pg_temp.u(1));
SELECT ok(NOT pg_temp.can(2, pg_temp.tx(1, 1)), 'bob blocks alice mid-transmission: renewal denied');
DELETE FROM public.blocks WHERE blocker_id = pg_temp.u(2);

SELECT is((SELECT array_agg(listener_uid) FROM public.voice_block_kicks(pg_temp.u(2), pg_temp.u(1))),
  ARRAY[(public.voice_listener_grant(pg_temp.u(2), pg_temp.tx(1, 1), NULL) ->> 'listener_uid')::int],
  'block kicks name the blocker''s listener uid in the speaker''s channel');
SELECT is_empty($$ SELECT 1 FROM public.voice_block_kicks(pg_temp.u(2), pg_temp.u(3)) $$,
  'no kicks between two people who are not talking');

-- Bans and shadow bans
UPDATE public.profiles SET is_banned = true WHERE id = pg_temp.u(9);
SELECT ok(NOT pg_temp.can(9, pg_temp.tx(1, 1)), 'a banned listener may not listen');
UPDATE public.profiles SET is_shadow_banned = true WHERE id = pg_temp.u(1);
SELECT ok(NOT pg_temp.can(2, pg_temp.tx(1, 1)), 'a shadow-banned speaker reaches nobody');
SELECT is(pg_temp.fanout(pg_temp.tx(1, 1)), '{}'::uuid[], 'a shadow-banned speaker fans out to nobody');
UPDATE public.profiles SET is_shadow_banned = false WHERE id = pg_temp.u(1);

-- Do Not Disturb toggled mid-transmission
UPDATE public.profiles SET dnd_mode = true WHERE id = pg_temp.u(2);
SELECT ok(NOT pg_temp.can(2, pg_temp.tx(1, 1)), 'turning on Do Not Disturb revokes on the next renewal');
UPDATE public.profiles SET dnd_mode = false WHERE id = pg_temp.u(2);

-- Half-duplex: a transmitting listener gets no grant
SELECT ok((pg_temp.begin_tx(2, 50) ->> 'ok')::boolean, 'bob begins his own transmission');
SELECT ok(NOT pg_temp.can(2, pg_temp.tx(1, 1)), 'a listener who is transmitting gets no grant (half-duplex)');
SELECT is(public.voice_end_transmission(pg_temp.u(2), pg_temp.tx(2, 50), 'released'), 1, 'bob releases');
SELECT ok(pg_temp.can(2, pg_temp.tx(1, 1)), 'after releasing, bob may listen again');
SELECT is(public.voice_end_transmission(pg_temp.u(2), pg_temp.tx(2, 50), 'released'), 0, 'ending twice is a no-op');

-- ═══ Confirm ════════════════════════════════════════════════════════════════
SELECT is(public.voice_confirm_transmission(pg_temp.u(2), pg_temp.tx(1, 1)) ->> 'error', 'not_found',
  'only the speaker can confirm');
SELECT ok((public.voice_confirm_transmission(pg_temp.u(1), pg_temp.tx(1, 1)) ->> 'ok')::boolean, 'speaker confirms');
SELECT is((SELECT count(*)::int FROM public.voice_sessions WHERE user_id = pg_temp.u(1) AND is_speaking AND ended_at IS NULL), 1,
  'confirm turns on exactly one speaking row');
SELECT ok((public.voice_confirm_transmission(pg_temp.u(1), pg_temp.tx(1, 1)) ->> 'ok')::boolean, 'confirm is idempotent');
SELECT is((SELECT count(*)::int FROM public.voice_sessions WHERE user_id = pg_temp.u(1)), 1,
  'a repeated confirm creates no second speaking row');
SELECT ok((SELECT vs.expires_at = t.hard_end_at AND vs.room_id IS NULL
           FROM public.voice_sessions vs JOIN private.voice_transmissions t ON t.voice_session_id = vs.id
           WHERE t.id = pg_temp.tx(1, 1)), 'speaking row expires at the hard end, Nearby');
SELECT ok((public.voice_listener_grant(pg_temp.u(2), NULL,
            (SELECT voice_session_id FROM private.voice_transmissions WHERE id = pg_temp.tx(1, 1))) ->> 'ok')::boolean,
  'a foreground listener can be granted from the speaking row id');
SELECT ok(NOT (public.voice_listener_grant(pg_temp.u(3), NULL,
            (SELECT voice_session_id FROM private.voice_transmissions WHERE id = pg_temp.tx(1, 1))) ->> 'ok')::boolean,
  'the speaking row id grants nothing to someone out of range');

-- ═══ PTT tokens and fan-out ═════════════════════════════════════════════════
SELECT is(pg_temp.reg(2, 'not-hex') ->> 'error', 'invalid', 'a malformed token is rejected');
SELECT is(public.register_ptt_token(pg_temp.u(2), pg_temp.inst(2), pg_temp.sid(2), pg_temp.tok(2), 'staging') ->> 'error',
  'invalid', 'an unknown APNs environment is rejected');
SELECT is(public.register_ptt_token(pg_temp.u(2), pg_temp.inst(2), pg_temp.sid(3), pg_temp.tok(2), 'production') ->> 'error',
  'not_live', 'a token cannot be bound to someone else''s session');
SELECT is(public.register_ptt_token(pg_temp.u(7), pg_temp.inst(7), gen_random_uuid(), pg_temp.tok(7), 'production') ->> 'error',
  'not_live', 'a user who is not live cannot register a token');
SELECT ok((SELECT bool_and((pg_temp.reg(n, pg_temp.tok(n)) ->> 'ok')::boolean) FROM unnest(ARRAY[1,2,3,4,5,6,8,10]) n),
  'live users register PTT tokens');
SELECT is((SELECT token FROM private.ptt_push_tokens WHERE user_id = pg_temp.u(2)), pg_temp.tok(2), 'token stored lowercase hex');
SELECT ok((pg_temp.reg(2, upper(pg_temp.tok(2))) ->> 'ok')::boolean, 're-registering is an upsert');
SELECT is((SELECT count(*)::int FROM private.ptt_push_tokens WHERE user_id = pg_temp.u(2)), 1, 'one row per installation');

SELECT is(pg_temp.fanout(pg_temp.tx(1, 1)), ARRAY[pg_temp.u(2)],
  'fan-out reaches exactly the eligible listeners with tokens');
SELECT is((SELECT listener_uid FROM public.voice_fanout_targets(pg_temp.tx(1, 1)) WHERE listener_id = pg_temp.u(2))::text,
  public.voice_listener_grant(pg_temp.u(2), pg_temp.tx(1, 1), NULL) ->> 'listener_uid',
  'fan-out and grant agree on the listener uid');

-- A token that moves to another account leaves the old one
SELECT ok((public.register_ptt_token(pg_temp.u(10), pg_temp.inst(10), pg_temp.sid(10), pg_temp.tok(2), 'production') ->> 'ok')::boolean,
  'a device token re-registered by another account');
SELECT is((SELECT array_agg(user_id) FROM private.ptt_push_tokens WHERE token = pg_temp.tok(2)), ARRAY[pg_temp.u(10)],
  'the token now belongs only to the new account');
SELECT ok((pg_temp.reg(2, pg_temp.tok(2)) ->> 'ok')::boolean, 'and back again');
SELECT pg_temp.reg(10, pg_temp.tok(10));

SELECT public.drop_ptt_token(upper(pg_temp.tok(3)));
SELECT is_empty($$ SELECT 1 FROM private.ptt_push_tokens WHERE user_id = pg_temp.u(3) $$, 'APNs-rejected tokens are dropped');
SELECT is(public.unregister_ptt_token(pg_temp.u(4), NULL), 1, 'unregister removes the caller''s tokens');

-- ═══ Rooms ══════════════════════════════════════════════════════════════════
CREATE FUNCTION pg_temp.room() RETURNS uuid LANGUAGE sql AS $$ SELECT 'aaaaaaaa-0000-0000-0000-000000000001'::uuid $$;
INSERT INTO public.rooms (id, owner_id, name) VALUES (pg_temp.room(), pg_temp.u(1), 'Convoy');
INSERT INTO public.room_members (room_id, user_id) VALUES (pg_temp.room(), pg_temp.u(8));

SELECT is(public.voice_set_context(pg_temp.u(2), pg_temp.room()) ->> 'error', 'not_member', 'a non-member cannot enter a room context');
SELECT is(public.voice_set_context(pg_temp.u(7), NULL) ->> 'error', 'not_live', 'a user who is not live has no context');

-- Alice is talking on Nearby; switching context ends that transmission.
SELECT ok((public.voice_set_context(pg_temp.u(1), pg_temp.room()) ->> 'ok')::boolean, 'the owner enters the room context');
SELECT is((SELECT state || ':' || ended_reason FROM private.voice_transmissions WHERE id = pg_temp.tx(1, 1)), 'ended:context_changed',
  'switching context ends the open transmission');
SELECT ok((SELECT vs.ended_at IS NOT NULL AND NOT vs.is_speaking FROM public.voice_sessions vs
           JOIN private.voice_transmissions t ON t.voice_session_id = vs.id WHERE t.id = pg_temp.tx(1, 1)),
  'and its speaking row');
SELECT ok(NOT pg_temp.can(2, pg_temp.tx(1, 1)), 'an ended transmission grants nobody');
SELECT is(pg_temp.begin_tx(1, 1) ->> 'error', 'transmission_ended', 'an ended client id cannot be reused');

SELECT ok((pg_temp.begin_tx(1, 2) ->> 'room_id')::uuid = pg_temp.room(), 'a press in the room context is a room transmission');
SELECT ok(NOT pg_temp.can(8, pg_temp.tx(1, 2)), 'a member still in the Nearby context does not hear the room');
SELECT ok((public.voice_set_context(pg_temp.u(8), pg_temp.room()) ->> 'ok')::boolean, 'hank enters the room context');
SELECT ok(pg_temp.can(8, pg_temp.tx(1, 2)), 'a member in the room context hears it regardless of distance');
SELECT ok(NOT pg_temp.can(2, pg_temp.tx(1, 2)), 'a nearby non-member does not hear the room');
SELECT is(pg_temp.fanout(pg_temp.tx(1, 2)), ARRAY[pg_temp.u(8)], 'room fan-out reaches room-context members only');
INSERT INTO public.blocks (blocker_id, blocked_id) VALUES (pg_temp.u(8), pg_temp.u(1));
SELECT ok(NOT pg_temp.can(8, pg_temp.tx(1, 2)), 'blocks apply inside rooms too');
DELETE FROM public.blocks WHERE blocker_id = pg_temp.u(8);
DELETE FROM public.room_members WHERE room_id = pg_temp.room() AND user_id = pg_temp.u(8);
SELECT ok(NOT pg_temp.can(8, pg_temp.tx(1, 2)), 'leaving the room revokes on the next renewal');
INSERT INTO public.room_members (room_id, user_id) VALUES (pg_temp.room(), pg_temp.u(8));

SELECT ok((public.voice_set_context(pg_temp.u(1), NULL) ->> 'ok')::boolean, 'back to Nearby');
SELECT ok(NOT EXISTS (SELECT 1 FROM private.voice_contexts WHERE user_id = pg_temp.u(1)), 'Nearby is stored as no row');
SELECT is((SELECT state FROM private.voice_transmissions WHERE id = pg_temp.tx(1, 2)), 'ended', 'the room transmission ended on the switch');

-- ═══ Supersede, hard end, speaker leaves ════════════════════════════════════
SELECT ok((pg_temp.begin_tx(1, 3) ->> 'ok')::boolean, 'new press');
SELECT ok((pg_temp.begin_tx(1, 4) ->> 'ok')::boolean, 'another press while the first is open');
SELECT is((SELECT ended_reason FROM private.voice_transmissions WHERE id = pg_temp.tx(1, 3)), 'superseded',
  'a new press supersedes the open one');
SELECT is((SELECT count(*)::int FROM private.voice_transmissions WHERE speaker_id = pg_temp.u(1) AND state <> 'ended'), 1,
  'one open transmission per speaker');

UPDATE private.voice_transmissions SET hard_end_at = now() - INTERVAL '1 second' WHERE id = pg_temp.tx(1, 4);
SELECT ok(NOT pg_temp.can(2, pg_temp.tx(1, 4)), 'past the hard end nobody is granted');
SELECT is(public.voice_confirm_transmission(pg_temp.u(1), pg_temp.tx(1, 4)) ->> 'error', 'transmission_ended',
  'past the hard end the speaker cannot confirm');
SELECT is(pg_temp.fanout(pg_temp.tx(1, 4)), '{}'::uuid[], 'past the hard end there is no fan-out');

SELECT ok((pg_temp.begin_tx(1, 5) ->> 'ok')::boolean, 'press');
SELECT ok(pg_temp.can(2, pg_temp.tx(1, 5)), 'bob can hear it');
UPDATE public.live_sessions SET expires_at = now() - INTERVAL '1 second' WHERE id = pg_temp.sid(1);
SELECT ok(NOT pg_temp.can(2, pg_temp.tx(1, 5)), 'a speaker whose heartbeat lapsed reaches nobody');
UPDATE public.live_sessions SET expires_at = now() + INTERVAL '25 seconds' WHERE id = pg_temp.sid(1);
UPDATE public.live_sessions SET expires_at = now() - INTERVAL '1 second' WHERE id = pg_temp.sid(2);
SELECT ok(NOT pg_temp.can(2, pg_temp.tx(1, 5)), 'a listener whose heartbeat lapsed is denied');
UPDATE public.live_sessions SET expires_at = now() + INTERVAL '25 seconds' WHERE id = pg_temp.sid(2);

-- ═══ end_live_session ═══════════════════════════════════════════════════════
SELECT public.voice_set_context(pg_temp.u(8), pg_temp.room());
SELECT ok((pg_temp.begin_tx(8, 1) ->> 'ok')::boolean, 'hank presses in the room');
SELECT public.voice_confirm_transmission(pg_temp.u(8), pg_temp.tx(8, 1));
SELECT pg_temp.stop(8);
SELECT is((SELECT state || ':' || ended_reason FROM private.voice_transmissions WHERE id = pg_temp.tx(8, 1)), 'ended:live_ended',
  'stopping live ends the open transmission');
SELECT ok(NOT EXISTS (SELECT 1 FROM public.voice_sessions WHERE user_id = pg_temp.u(8) AND ended_at IS NULL),
  'and its speaking row');
SELECT ok(NOT EXISTS (SELECT 1 FROM private.ptt_push_tokens WHERE user_id = pg_temp.u(8)), 'and deletes the PTT token');
SELECT ok(NOT EXISTS (SELECT 1 FROM private.voice_contexts WHERE user_id = pg_temp.u(8)), 'and the voice context');

-- ═══ expire_stale_sessions ══════════════════════════════════════════════════
-- Bob's session lapses past the grace; Alice's open transmission passes its
-- hard end; an old ended row is purged; the speaker's token is untouched.
UPDATE public.live_sessions SET expires_at = now() - INTERVAL '10 minutes' WHERE id = pg_temp.sid(2);
UPDATE public.location_presence SET expires_at = now() - INTERVAL '10 minutes' WHERE user_id = pg_temp.u(2);
SELECT public.voice_set_context(pg_temp.u(2), NULL);
UPDATE private.voice_transmissions SET hard_end_at = now() - INTERVAL '1 second' WHERE id = pg_temp.tx(1, 5);
UPDATE private.voice_transmissions SET ended_at = now() - INTERVAL '2 hours' WHERE id = pg_temp.tx(1, 1);
SELECT public.expire_stale_sessions();
SELECT is((SELECT state || ':' || ended_reason FROM private.voice_transmissions WHERE id = pg_temp.tx(1, 5)), 'ended:expired',
  'the sweep ends transmissions past their hard end');
SELECT ok(NOT EXISTS (SELECT 1 FROM private.ptt_push_tokens WHERE user_id = pg_temp.u(2)),
  'the sweep deletes tokens of expired sessions');
SELECT ok(EXISTS (SELECT 1 FROM private.ptt_push_tokens WHERE user_id = pg_temp.u(1)),
  'the sweep keeps tokens of active sessions');
SELECT ok(NOT EXISTS (SELECT 1 FROM private.voice_transmissions WHERE id = pg_temp.tx(1, 1)),
  'the sweep purges ended transmissions after an hour');
SELECT ok(EXISTS (SELECT 1 FROM private.voice_transmissions WHERE id = pg_temp.tx(1, 3)),
  'recently ended transmissions are kept until then');
UPDATE private.ptt_push_tokens SET expires_at = now() - INTERVAL '1 second' WHERE user_id = pg_temp.u(1);
SELECT public.expire_stale_sessions();
SELECT ok(NOT EXISTS (SELECT 1 FROM private.ptt_push_tokens WHERE user_id = pg_temp.u(1)),
  'the sweep deletes tokens past their 12 h expiry');

-- ═══ Phase 2 regression ═════════════════════════════════════════════════════
SELECT is(
  (SELECT array_agg(a ORDER BY a) FROM unnest((SELECT proargnames FROM pg_proc WHERE oid = 'public.get_nearby_drivers_v3(uuid)'::regprocedure)) a),
  ARRAY['avatar_url','display_name','distance_band','dnd','handle','is_speaking','p_caller_id','user_id',
        'vehicle_color','vehicle_label','vehicle_make','vehicle_model','vehicle_type'],
  'get_nearby_drivers_v3 output is unchanged: band only, no numeric distance');
SELECT ok(pg_get_functiondef('private.can_view_open_voice(uuid)'::regprocedure) LIKE '%private.nearby_pair_band%',
  'open-channel speaking state still uses the Phase 2 predicate');
SELECT ok(pg_get_functiondef('private.voice_can_listen(uuid,uuid)'::regprocedure) LIKE '%private.nearby_pair_band(p_listener, t.speaker_id)%',
  'nearby audio uses the same Phase 2 predicate');
SELECT is_empty($$
  SELECT column_name FROM information_schema.columns
  WHERE table_schema = 'private' AND table_name IN ('voice_transmissions','voice_contexts','ptt_push_tokens')
    AND (data_type = 'USER-DEFINED' AND udt_name = 'geography' OR column_name ~ '(^|_)(lat|lng|lon|location|distance|band)(_|$)') $$,
  'voice tables store no coordinates, distance or band');

SELECT * FROM finish();
ROLLBACK;

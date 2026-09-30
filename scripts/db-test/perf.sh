#!/usr/bin/env bash
# Performance fixture for get_nearby_drivers_v3 (migration 012): PERF_USERS
# live users (default 3000) spread uniformly over a PERF_SPAN_KM square
# (default 22 km) around 37°N, 122°W,
# every one with the 4800 m maximum range. Prints timings and EXPLAIN ANALYZE
# plans for v3's slow statements (via auto_explain, nested statements
# included) and for one pair check, then removes the fixture. Not part of run.sh; run it after run.sh.
#
#   PGHOST=/tmp PGPORT=54399 PGUSER=postgres scripts/db-test/perf.sh
set -euo pipefail

DB="${DB_NAME:-roadping_test}"
N="${PERF_USERS:-3000}"
SPAN_KM="${PERF_SPAN_KM:-22}"   # side of the square
PSQL=(psql -v ON_ERROR_STOP=1 -q -X -d "$DB")

"${PSQL[@]}" -v n="$N" -v span="$SPAN_KM" <<'SQL'
DELETE FROM auth.users WHERE id::text LIKE '40000000-%';
SELECT setseed(0.42);
INSERT INTO auth.users (id, email, raw_user_meta_data)
SELECT ('40000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid,
       'p' || g || '@example.test', jsonb_build_object('display_name', 'p' || g)
FROM generate_series(1, :n) g;
WITH s AS (
  INSERT INTO public.live_sessions (user_id, range_m)
  SELECT id, 4800 FROM auth.users WHERE id::text LIKE '40000000-%'
  RETURNING id, user_id
)
SELECT count(public.upsert_location_presence(
  s.user_id, s.id,
  CASE WHEN s.user_id = '40000000-0000-0000-0000-000000000001' THEN 37.0
       ELSE 37.0 + (random() - 0.5) * :span / 111.2 END,
  CASE WHEN s.user_id = '40000000-0000-0000-0000-000000000001' THEN -122.0
       ELSE -122.0 + (random() - 0.5) * :span / 88.8 END))  -- km per degree at 37°N
FROM s;
ANALYZE public.location_presence;
ANALYZE public.live_sessions;
ANALYZE public.profiles;
SQL

echo "── candidates in the prefilter / visible (caller at the centre)"
"${PSQL[@]}" -t -A <<'SQL'
SELECT count(*) FILTER (WHERE extensions.ST_DWithin(t.location, me.location, 4800 + private.proximity_prefilter_margin_m()))
       || ' prefilter / ' ||
       count(*) FILTER (WHERE private.nearby_pair_band(me.user_id, t.user_id) IS NOT NULL) || ' visible'
FROM public.location_presence me, public.location_presence t
WHERE me.user_id = '40000000-0000-0000-0000-000000000001' AND t.user_id <> me.user_id;
SQL

echo "── timings: first call (inserts holds), then 5 calls inside the hold"
"${PSQL[@]}" <<'SQL'
\timing on
SELECT count(*) FROM public.get_nearby_drivers_v3('40000000-0000-0000-0000-000000000001');
SELECT count(*) FROM public.get_nearby_drivers_v3('40000000-0000-0000-0000-000000000001');
SELECT count(*) FROM public.get_nearby_drivers_v3('40000000-0000-0000-0000-000000000001');
SELECT count(*) FROM public.get_nearby_drivers_v3('40000000-0000-0000-0000-000000000001');
SELECT count(*) FROM public.get_nearby_drivers_v3('40000000-0000-0000-0000-000000000001');
SELECT count(*) FROM public.get_nearby_drivers_v3('40000000-0000-0000-0000-000000000001');
SELECT count(*) FROM public.get_nearby_drivers_v2('40000000-0000-0000-0000-000000000001', 4800);
\timing off
SQL

echo "── EXPLAIN ANALYZE: v3's statements taking over 5 ms (inside the hold)"
"${PSQL[@]}" <<'SQL' 2>&1
LOAD 'auto_explain';
SET auto_explain.log_min_duration = 5;
SET auto_explain.log_analyze = on;
SET auto_explain.log_buffers = on;
SET auto_explain.log_nested_statements = on;
SET auto_explain.log_timing = on;
SET client_min_messages = log;
SELECT count(*) FROM public.get_nearby_drivers_v3('40000000-0000-0000-0000-000000000001');
SQL

echo "── EXPLAIN ANALYZE: one pair check (private.nearby_pair_band body)"
"${PSQL[@]}" <<'SQL'
PREPARE pair(uuid, uuid) AS
  SELECT private.distance_band_for(q.distance_m)
  FROM public.location_presence me
  JOIN public.live_sessions ms ON ms.id = me.session_id AND ms.user_id = me.user_id AND ms.status = 'active' AND ms.expires_at > now()
  JOIN public.profiles mp ON mp.id = me.user_id AND mp.is_banned = false
  JOIN public.location_presence them ON them.user_id = $2 AND them.expires_at > now()
  JOIN public.live_sessions ts ON ts.id = them.session_id AND ts.user_id = them.user_id AND ts.status = 'active' AND ts.expires_at > now()
  JOIN public.profiles tp ON tp.id = $2 AND tp.is_banned = false AND tp.is_shadow_banned = false
  CROSS JOIN LATERAL (SELECT private.quantized_distance_m(me.location, them.location) AS distance_m) q
  WHERE me.user_id = $1 AND me.expires_at > now() AND $2 <> $1
    AND NOT EXISTS (SELECT 1 FROM public.blocks b WHERE (b.blocker_id = $1 AND b.blocked_id = $2) OR (b.blocker_id = $2 AND b.blocked_id = $1));
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
EXECUTE pair('40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002');
SQL

"${PSQL[@]}" -c "DELETE FROM auth.users WHERE id::text LIKE '40000000-%';"

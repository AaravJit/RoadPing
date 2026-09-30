#!/usr/bin/env bash
# Concurrency check for get_nearby_drivers_v3's band holds (migration 012).
# pgTAP runs in one transaction, so real parallel sessions are tested here
# against committed fixtures, which are removed at the end.
#
#   PGHOST=/tmp PGPORT=54399 PGUSER=postgres scripts/db-test/concurrency.sh
set -euo pipefail

DB="${DB_NAME:-roadping_test}"
PSQL=(psql -v ON_ERROR_STOP=1 -q -X -t -A -d "$DB")
PAR="${PARALLEL:-40}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

fail() { echo "not ok - $*"; exit 1; }

# Callers 3...01-03, targets 3...11-15, all around 37°N on one meridian.
"${PSQL[@]}" <<'SQL'
DELETE FROM auth.users WHERE id::text LIKE '30000000-%';
INSERT INTO auth.users (id, email, raw_user_meta_data)
SELECT ('30000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       'c' || n || '@example.test', jsonb_build_object('display_name', 'c' || n)
FROM unnest(ARRAY[1, 2, 3, 11, 12, 13, 14, 15]) AS n;

WITH s AS (
  INSERT INTO public.live_sessions (user_id, range_m)
  SELECT id, 5000 FROM auth.users WHERE id::text LIKE '30000000-%'
  RETURNING id, user_id
)
SELECT public.upsert_location_presence(
  s.user_id, s.id,
  37.0 + (right(s.user_id::text, 2)::int % 10) * 0.0045,   -- ~500 m steps
  -122.0)
FROM s;
SQL

call() {  # $1 = caller suffix, $2 = output file
  "${PSQL[@]}" -c "SELECT string_agg(user_id || ':' || distance_band, ',' ORDER BY user_id)
                   FROM public.get_nearby_drivers_v3('30000000-0000-0000-0000-0000000000$1')" >"$2" 2>&1
}

# 1. Many simultaneous first calls from one caller.
for i in $(seq 1 "$PAR"); do call 01 "$TMP/a$i" & done; wait
grep -l ERROR "$TMP"/a* >/dev/null 2>&1 && fail "errors in parallel calls: $(cat "$TMP"/a* | grep ERROR | head -3)"
[[ "$(cat "$TMP"/a* | sort -u | wc -l)" == 1 ]] || fail "parallel calls returned different results"
rows="$("${PSQL[@]}" -c "SELECT count(*) FROM private.proximity_band_holds WHERE caller_id = '30000000-0000-0000-0000-000000000001'")"
[[ "$rows" == 7 ]] || fail "expected 7 hold rows for caller 01, got $rows"
echo "ok - $PAR simultaneous first calls: identical results, one hold row per target"

# 2. Race at hold expiry while a target has crossed a band edge.
"${PSQL[@]}" <<'SQL'
UPDATE private.proximity_band_holds SET held_until = now() - INTERVAL '1 second'
WHERE caller_id = '30000000-0000-0000-0000-000000000001';
UPDATE public.location_presence SET location =
  extensions.ST_SetSRID(extensions.ST_MakePoint(-122.0, 37.0 + 0.0045 * 5), 4326)::extensions.geography
WHERE user_id = '30000000-0000-0000-0000-000000000011';
SQL
for i in $(seq 1 "$PAR"); do call 01 "$TMP/b$i" & done; wait
grep -l ERROR "$TMP"/b* >/dev/null 2>&1 && fail "errors at hold expiry: $(cat "$TMP"/b* | grep ERROR | head -3)"
[[ "$(cat "$TMP"/b* | sort -u | wc -l)" == 1 ]] || fail "calls racing the hold expiry saw different bands"
cmp -s "$TMP/a1" "$TMP/b1" && fail "the moved target's band did not update after expiry"
rows="$("${PSQL[@]}" -c "SELECT count(*) FROM private.proximity_band_holds WHERE caller_id = '30000000-0000-0000-0000-000000000001' AND held_until > now()")"
[[ "$rows" == 7 ]] || fail "expected 7 live hold rows after the race, got $rows"
echo "ok - $PAR calls racing a hold expiry: one resample, identical results"

# 3. Several callers at once (independent rows, no deadlocks).
for i in $(seq 1 "$PAR"); do
  for c in 01 02 03 11 12; do call "$c" "$TMP/c$c-$i" & done
done; wait
grep -l ERROR "$TMP"/c* >/dev/null 2>&1 && fail "errors with several callers: $(cat "$TMP"/c* | grep ERROR | head -3)"
for c in 01 02 03 11 12; do
  [[ "$(cat "$TMP"/c$c-* | sort -u | wc -l)" == 1 ]] || fail "caller $c saw different results"
done
dups="$("${PSQL[@]}" -c "SELECT count(*) - count(DISTINCT (caller_id, target_session_id)) FROM private.proximity_band_holds")"
[[ "$dups" == 0 ]] || fail "duplicate hold rows"
echo "ok - $((PAR * 5)) calls from 5 callers: no errors, no deadlocks, no duplicates"

"${PSQL[@]}" -c "DELETE FROM auth.users WHERE id::text LIKE '30000000-%'" >/dev/null
left="$("${PSQL[@]}" -c "SELECT count(*) FROM private.proximity_band_holds h JOIN public.live_sessions s ON s.id = h.target_session_id WHERE s.user_id::text LIKE '30000000-%'")"
[[ "$left" == 0 ]] || fail "holds survived account deletion"
echo "ok - deleting the accounts cascades their hold rows"

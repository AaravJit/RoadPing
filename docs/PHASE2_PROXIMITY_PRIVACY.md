# Phase 2: privacy-safe proximity

Migration: `supabase/migrations/20260930000012_privacy_safe_proximity.sql`
Rollback: `supabase/rollback/20260930000012_privacy_safe_proximity.down.sql`
Tests: `supabase/tests/database/phase2_proximity_privacy.test.sql` (pgTAP),
`scripts/db-test/concurrency.sh`, `supabase/functions/get-nearby-drivers/handler.test.ts`
and `supabase/functions/_shared/validate.test.ts` (Deno),
`scripts/client-test/proximity.test.mjs` and `ranges.test.mjs` (Node).
Performance fixture: `scripts/db-test/perf.sh`.

Builds on Phase 1 (`docs/SECURITY_LOCKDOWN.md`): position is the caller's
stored presence, `location_presence` is unreadable by clients, every proximity
helper is service-role-only or a `private` policy helper.

## Previous design (after Phase 1)

- `get_nearby_drivers_v2(caller, range)` computed the exact geodesic distance
  and returned it rounded to 50 m (`approximate_distance_m`), ordered by exact
  distance.
- The Edge Function accepted `range_m`, capped to the session range and floored
  to a step, so a client could still choose among 12 thresholds per request.
- The client polled every 5 s (and took a GPS fix for each poll) and drew every
  stranger on the map at `your position + distance` along an angle hashed from
  their user id (`mapPlacement.ts`). That pin looked geographic but the
  direction was invented.
- `private.can_view_open_voice` used exact `ST_DWithin` on the raw range.

## Threat model

Attacker: an ordinary authenticated user, possibly with several accounts, a
GPS spoofer (reported positions are accepted within 300 m + 85 m/s of the last
accepted one), a modified client, and patience. Goal: locate another live
user, or track them over time. Out of scope: an attacker with database or
service-role access, and someone who can simply see the target on the road.

| Vector | Before Phase 2 | After Phase 2 |
|---|---|---|
| Repeated distance polling | a fresh 50 m-rounded distance every request (up to 30/min) | one band per (caller, target session) per 30 s; refetches return the held value |
| Client range probing | `range_m` in each request, 12 steps | the request body never reaches the query; the only range is the stored session range |
| Session-restart range probing | n/a after the first draft of this PR: 12 stored steps (100–5000 m) let an attacker restart at 250 m, then 400 m, and learn "250–400 m" | the only effective ranges are 800 / 1600 / 3200 m (the band edges) and a 4800 m maximum; any stored value is floored to one of them, below 800 m to none. Present at range R ⇔ band ≤ R's band, so restarting at every range learns the band and nothing finer |
| Movement + repeated observations (trilateration) | 50 m rings from any spoofed point, every request | 4 broad bands from **grid-snapped** positions, one sample per 30 s; resolution is bounded by the ~250 m cell, not GPS |
| Band-boundary probing | n/a | edges are evaluated on cell centres, so an attacker learns at most which cell the target is in, one sample per 30 s |
| Range-edge (visible or not) | exact `ST_DWithin`: exact-circle oracle | quantized predicate on band edges only: the edge is a band edge. **Not held** (see Residual observability) |
| Ordering leakage | sorted by exact distance | band, then name, then id |
| Fake-bearing UI | invented direction drawn as geography | no stranger is drawn on the map |
| Session restart / reconnect | fresh numbers immediately | hold is keyed on the caller's user id, so restarting the app or session keeps it |
| Blocked / banned / private zone | excluded (v2) | unchanged, re-evaluated every request whatever is held; private zones still end the session from raw positions |
| Speaking-state visibility (Realtime) | exact-distance predicate: an oracle wider than the list | the same `private.nearby_pair_band` predicate as the list |
| Stale presence | hidden at `expires_at` | unchanged; holds never make anyone visible |

Coarse proximity cannot make location inference impossible. The aim is to
remove precision the product does not need and to make systematic probing
slow, coarse and costly.

## API contract

`POST /functions/v1/get-nearby-drivers` with any body (the new app sends `{}`).

```jsonc
{ "drivers": [ {
  "user_id": "uuid", "handle": "maya", "display_name": "Maya", "avatar_url": null,
  "vehicle_type": "car", "vehicle_label": "…", "vehicle_color": "Blue",
  "vehicle_make": "Honda", "vehicle_model": "Civic",
  "distance_band": "800m_to_1600m",
  "is_speaking": false, "dnd": false
} ] }
```

No coordinate, numeric distance, bearing, heading, grid cell or session id.
The Edge Function copies only these keys (`_shared/proximity.ts`
`toPublicDriver`) and drops rows with an unknown band. The target's
`session_id` was removed because the app never used it.

A request that carries `lat`, `lng` or `range_m` is a pre-Phase-2 build: it
gets `{ "drivers": [] }` (see Rollout).

`distance_band` is `public.distance_band`, an enum. The client validates it
(`src/services/proximity.ts`), which is also the only place that labels, speaks
and sorts bands.

## Band thresholds

Quantized distance, upper bound inclusive:

| Key | Metres | Imperial | Metric | VoiceOver (imperial) |
|---|---|---|---|---|
| `within_800m` | ≤ 800 | Within ½ mi | Within 800 m | within half a mile |
| `800m_to_1600m` | 800–1600 | ½–1 mi | 0.8–1.6 km | half a mile to 1 mile away |
| `1600m_to_3200m` | 1600–3200 | 1–2 mi | 1.6–3.2 km | 1 to 2 miles away |
| `beyond_3200m` | > 3200 (to the 4800 m max range) | Over 2 mi | Over 3.2 km | more than 2 miles away |

Why these: the edges are the ½, 1 and 2 mile range presets (800, 1600, 3200 m),
so a range and its outermost band agree and imperial labels are round. Each
band doubles the previous one, so relative precision is constant. There is no
¼ mi band: grid snapping moves a distance by up to ~320 m (see below), which
would make a 400 m band wrong too often, and the nearest band is the most
useful one for localisation.

The client never converts a band back into a single number, prefixes "~", or
says "about". Ranges are described as approximate in the Nearby sheet.

## Broadcast ranges

The range a user picks is also an observation channel: "visible or not" at
range R says whether the target is within R. With the original 12 stored
steps (100, 250, 400, 500, 800, 1000, 1600, 2000, 3000, 3200, 4800, 5000 m),
an attacker could end and restart their session at 250 m (absent) and 400 m
(present) and learn a 250–400 m interval although the band only said
"Within ½ mi". The 30 s band hold does not help, because visibility itself is
re-evaluated on every request.

The only effective ranges are now the band edges plus one maximum:

| Range | Imperial preset | Metric preset | Visible bands |
|---|---|---|---|
| 800 m | ½ mi | 800 m | within_800m |
| 1600 m | 1 mi | 1.6 km | up to 800m_to_1600m |
| 3200 m | 2 mi | 3.2 km | up to 1600m_to_3200m |
| 4800 m | 3 mi (default) | 4.8 km | all four, beyond_3200m out to 4800 m |

`private.range_step_m` floors any stored value to the largest of these at or
below it, or NULL below 800 m; `nearby_pair_band` treats a NULL on either
side as "not visible" (not `LEAST`, which skips NULLs and would silently
widen a legacy ¼ mi range to the other side's). Since both sides' ranges are
band edges, "present at range R" is exactly "fresh band ≤ R's band": the only
extra fact beyond the band is the one horizon at 4800 m, which the contract
already implies (you only see people within your range). The pgTAP suite
restarts an attacker's session at 100 distinct ranges (100–5000 m in 50 m
steps plus every old preset) against a target at 23 distances from 0 to
~5.5 km, 2,300 restarts in all, and checks that the present/absent vectors
split the placements into exactly 5 classes: the 4 bands and out of range.

No one's radius grows:

- `start-live-session` still accepts 100–5000 (old builds send it) but stores
  the floored range. Old ¼ mi (400) and 500 m presets are refused with "The
  smallest range is now ½ mile (800 m). Choose a larger range and try again."
  rather than widened.
- Existing rows are not rewritten (rollback stays exact). A live session with
  a stored value below 800 m is neither shown nor shown anyone until the user
  restarts; values above 800 m act as their floor (1000 → 800, 2000 and
  3000 → 1600, 5000 → 4800), which only ever shrinks.
- `profiles.default_range_m` keeps its value (default 2000 in the column,
  4800 in the app). The app highlights the floored preset. A saved ¼ mi /
  500 m default highlights nothing, the Drive dock reads "Set range", and Go
  Live opens the range sheet ("Ranges now start at ½ mile. Pick one to go
  live.") until the user chooses.
- The old metric presets change: 500 m / 1 / 2 / 3 / 5 km become 800 m /
  1.6 / 3.2 / 4.8 km. The imperial ½ / 1 / 2 / 3 mi presets are unchanged
  and ¼ mi is gone.

## Spatial quantization

`private.snap_to_proximity_grid(geography)` snaps a point to the centre of a
~250 m cell of a latitude-adaptive grid:

- rows are a fixed 250 m of latitude (250 / 111 195.08 degrees);
- each row is divided into a whole number of columns,
  `floor(360 · 111 195.08 · cos(row centre latitude) / 250)`, so a column is
  about 250 m wide at that row's latitude, and columns wrap exactly at ±180°;
- `cos` is floored at 0.01, so near the poles cells get narrower, never wider.

A plain longitude-degree grid would have cells ~250 m wide at the equator but
~125 m at 60°N; this one stays ~250 m (tested at 0–70°N). The disclosed band
comes from the geodesic distance between the two cell centres
(`private.quantized_distance_m`, spheroidal `ST_Distance`).

Measured on 20 000 random pairs: mean |quantized − exact| 83 m, 95th
percentile 195 m, max 319 m (bound: two half-diagonals ≈ 355 m); the band
differs from the exact-distance band for 2.3% of pairs.

Nothing about the grid leaves the server: no snapped point, no cell id.

The **visibility predicate uses the quantized distance too**
(`quantized ≤ min(step(caller range), step(target range))`), in both
`get_nearby_drivers_v3` and the speaking-state policy. Keeping exact
`ST_DWithin` for "within range" would have left an exact-circle oracle at the
range edge; with the quantized predicate that edge also resolves only cells.
Trade-off: near the edge a driver can appear up to ~320 m outside your range
or disappear up to ~320 m inside it. An exact `ST_DWithin(range + 500 m)`
prefilter keeps the GIST index; it is a strict superset and discloses nothing.

Private zones are unchanged: `check_private_zone` still uses the raw position.

## Temporal stabilization

`private.proximity_band_holds` (private schema, RLS on, no grants to any API
role):

| Column | Type |
|---|---|
| `caller_id` | uuid → profiles, cascade |
| `target_session_id` | uuid → live_sessions, cascade |
| `band` | `public.distance_band` |
| `held_until` | timestamptz |

Primary key `(caller_id, target_session_id)`. No coordinates, distance or
profile state.

For each visible target, v3 upserts the fresh band with
`held_until = now() + 30 s`; if a live hold exists it returns the held band
and leaves `held_until` alone (not a sliding window: polling cannot freeze a
band forever, and cannot refresh it early). A held band wider than the
caller's own range (only possible after restarting with a smaller range) is
replaced by a fresh one.

- Keyed on the caller's **user**: restarting the app, the session, or changing
  range keeps the hold.
- Keyed on the target's **session**: a new target session starts fresh and
  never inherits an old band.
- Visibility is never read from the hold. Every request re-checks sessions,
  expiry, bans, shadow-bans, blocks and range, so Stop, Stop & Hide, block,
  ban and expiry take effect on the next request even with a live hold.
  Block → unblock inside a hold returns the held band, not a new sample.
- Concurrency: v3 takes a transaction advisory lock per caller, so parallel
  calls from one caller serialize and see the same hold; different callers
  touch different rows. `concurrency.sh` runs 40 parallel first calls, 40
  calls racing an expiry, and 200 calls from 5 callers.
- Cleanup: `expire_stale_sessions()` (cron, every minute) deletes expired
  holds; account deletion cascades.

## Ordering

`ORDER BY band, lower(display_name), id`, `LIMIT 100`. The client re-sorts
with the same rule (`compareNearbyDrivers`), which also hides the exact-distance
order of an old backend during rollout.

## Voice visibility

`private.nearby_pair_band(caller, target)` is the single "is target nearby for
caller" definition: both live and unexpired, caller not banned, target not
banned or shadow-banned, no block either way, quantized distance within both
stepped ranges. `get_nearby_drivers_v3` uses it for every candidate;
`private.can_view_open_voice(speaker)` is now
`nearby_pair_band(auth.uid(), speaker) IS NOT NULL`. The pgTAP test checks
that the Realtime-visible open-channel speakers equal the v3 list, including
a driver inside the range by exact distance but outside it quantized. The
2-minute window on the policy is unchanged. v3's `is_speaking` now counts only
open-channel speech (`room_id IS NULL`); v2 also flagged someone talking in a
private room as speaking to strangers.

## Residual observability

What a live user can still learn about another live user:

- That they are live, within both ranges, and not blocked; their profile and
  vehicle fields; speaking and DND state. (That is the feature.)
- Their band, one sample per 30 s per account, from cell centres.
- **Whether the target is inside my range, on every request.** Visibility is
  not held (it must stay fresh), and a range is a band edge, so someone at
  range 800 m can tell, per request instead of per 30 s, whether the target
  is currently in the nearest band. This is band-level information, just
  fresher than the held band; restarting at other ranges adds only the other
  band edges (tested, see Broadcast ranges). Like every edge it is evaluated
  on cell centres and limited by the 30/min request limit and the spoofing
  envelope. A future option is an exit/entry cooldown, at the cost of fresh
  visibility.
- A patient spoofer comparing samples from many positions can locate a
  stationary target to roughly its 250 m cell within minutes; several accounts
  multiply the sample rate. Moving targets are much harder. The tests show
  that repeated probes inside a hold get one band sample and that range
  restarts get nothing finer than the band edges; they do not show that a
  target cannot be located.
- Speaking events arrive over Realtime with the speaker's user id and live
  session id, only for speakers in the same nearby set.
- Anyone who can physically see the person can of course place them.

## Rollout / deployment order

Do not deploy as part of this PR. Order:

1. Ship this app build to TestFlight and move testers to it. It reads the
   Phase 2 `distance_band` and, until step 3, the old
   `approximate_distance_m` (deprecated `legacyDistanceToBand` in
   `src/services/proximity.ts`, mapped straight to a band and discarded).
2. `supabase link --project-ref govebqdalfcoiyovsdth`,
   `supabase migration list` (only `20260930000012` pending),
   `supabase db push --dry-run` (lists only `20260930000012_privacy_safe_proximity.sql`),
   then `supabase db push`. The deployed function keeps using v2 meanwhile.
   From this point open-channel speaking state already uses the Phase 2
   predicate.
3. `supabase functions deploy start-live-session` (that one function). From
   here new sessions store only 800 / 1600 / 3200 / 4800 m and old builds'
   ¼ mi / 500 m starts are refused with a message. The database already
   floors ranges from step 2, so this is the storage and messaging side.
4. Expire older TestFlight builds, then `supabase functions deploy get-nearby-drivers`
   (that one function only; see `docs/SECURITY_LOCKDOWN.md` on why never a
   blanket deploy). Older builds then get an empty Nearby list: they would
   otherwise place drivers without a distance at a NaN map coordinate, which
   MapKit rejects (inferred from MapKit's behaviour, not reproduced on a
   device).
5. Once no build older than step 1 is in use, delete `legacyDistanceToBand`
   and the legacy-request branch in `handler.ts`, and drop
   `get_nearby_drivers_v2` in a later migration.

## Rollback

1. Redeploy the previous `get-nearby-drivers` (the Phase 1 version calls v2)
   and the previous `start-live-session` (accepts and stores 100–5000 as sent).
2. Run `supabase/rollback/20260930000012_privacy_safe_proximity.down.sql`
   (SQL editor or `psql`), then delete the `20260930000012` row from
   `supabase_migrations.schema_migrations` if the CLI should re-apply it.

It restores migration 010's `can_view_open_voice` and `expire_stale_sessions`
bodies (keeping their owner, `search_path` and grants) and drops v3, the hold
table, the helpers and the enum. It does not touch v2 (still service-role
only), location tables or default privileges; `run.sh` re-runs the Phase 1
tests on the rolled-back schema, then re-applies 012 and runs everything.

## Validation

```sh
npm ci
npm run typecheck
npm run test:proximity
npx expo-doctor
npx expo export --platform ios

# Database (no Docker): see scripts/db-test/run.sh for the Postgres setup
PGHOST=/tmp PGPORT=54399 PGUSER=postgres ROLLBACK_CHECK=1 scripts/db-test/run.sh
# or, with Docker: supabase test db

# Edge Functions (esm.sh blocked? map the import to npm instead):
#   deno.json: {"nodeModulesDir":"auto","imports":{"@supabase/supabase-js":"npm:@supabase/supabase-js@2.106.0"}}
deno check --config deno.json supabase/functions/*/index.ts
deno test  --config deno.json supabase/functions/get-nearby-drivers/handler.test.ts \
                               supabase/functions/_shared/validate.test.ts

# Performance fixture (after run.sh): plans and timings for v3
PGHOST=/tmp PGPORT=54399 PGUSER=postgres scripts/db-test/perf.sh
PERF_SPAN_KM=100 scripts/db-test/perf.sh   # a sparser, more realistic density
```

## Performance

Measured with `scripts/db-test/perf.sh` on the sandbox Postgres 16 (warm
cache, one connection), caller at the centre, all ranges 4800 m:

| Fixture | Prefilter candidates | Visible | v3 (held) | v2 |
|---|---|---|---|---|
| 3 000 live in a 22 km square | 542 | 452 | ~105–135 ms | ~14 ms |
| 3 000 live in a 100 km square | 22 | 20 | ~7.5–8.5 ms | ~6.5 ms |

The first call for a caller is ~20 ms slower (hold inserts, cold plans).

Plan (`EXPLAIN ANALYZE` via auto_explain, dense fixture):

- Caller lookup: index scans on `location_presence_pkey`,
  `live_sessions_one_active_per_user`, `profiles_pkey`; < 1 ms.
- `candidates` (MATERIALIZED): Bitmap Index Scan on
  `location_presence_location_gist` (906 rows for the expanded box, 0.1 ms),
  Bitmap Heap Scan rechecking `ST_DWithin(range + 500 m)` (541 rows kept), then
  `private.nearby_pair_band` once per row. **This is ~95% of the time**:
  ~0.24 ms and ~20 buffer hits per candidate (six primary-key lookups for the
  two presences, sessions and profiles, the blocks check on `blocks_pkey`, and
  two plpgsql grid snaps).
- `held`: `INSERT … ON CONFLICT` on `proximity_band_holds_pkey`, 451 rows,
  ~5 ms.
- Final join: `live_sessions_pkey`, `profiles_pkey`, `vehicles_pkey` per
  held row, top-N heapsort by band and name; ~2.5 ms. The first draft joined
  back to `candidates` (both CTEs estimated at one row), which planned as a
  nested loop filtering 243 540 rows (~36 ms at this density, quadratic in
  it). It now joins through the session owner; `candidates` is
  `MATERIALIZED` so the pair check is not evaluated twice when inlined.
- Open-channel speaking: one bitmap scan on `voice_sessions_expires_idx`.

With 5 s foreground polling a live user costs 0.2 calls/s. At the sparse
density that is ~1.6 ms of database time per live user per second
(3 000 live users ≈ 5 CPU-seconds per second); at the dense one ~25 ms
(3 000 live users ≈ 75 CPU-seconds per second), which one database would not
sustain. Cost grows linearly with the drivers inside ~5.3 km of each caller.
The same pair check also runs for each Realtime speaking event per
subscriber (`can_view_open_voice`). No redesign is in this PR; if density
ever approaches the dense fixture, the next step is set-based: snap the
caller once, snap candidates in one pass, and check blocks with one
anti-join instead of per-pair lookups (keeping `nearby_pair_band` as the
single definition for the voice policy and asserting in tests that both
agree). Reducing the poll rate while the list is unchanged would also help.

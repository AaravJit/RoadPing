# Phase 2: privacy-safe proximity

Migration: `supabase/migrations/20260930000012_privacy_safe_proximity.sql`
Rollback: `supabase/rollback/20260930000012_privacy_safe_proximity.down.sql`
Tests: `supabase/tests/database/phase2_proximity_privacy.test.sql` (pgTAP),
`scripts/db-test/concurrency.sh`, `supabase/functions/get-nearby-drivers/handler.test.ts`
(Deno), `scripts/client-test/proximity.test.mjs` (Node).

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
| Client range probing | `range_m` in each request, 12 steps | the request body never reaches the query; the only range is the stored session range, floored to a step; changing it means a new session (12 per 10 min) and does not reset holds |
| Movement + repeated observations (trilateration) | 50 m rings from any spoofed point, every request | 4 broad bands from **grid-snapped** positions, one sample per 30 s; resolution is bounded by the ~250 m cell, not GPS |
| Band-boundary probing | n/a | edges are evaluated on cell centres, so an attacker learns at most which cell the target is in, one sample per 30 s |
| Range-edge (visible or not) | exact `ST_DWithin`: exact-circle oracle | quantized predicate: same cell-level resolution. **Not held** (see Residual observability) |
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
| `beyond_3200m` | > 3200 (to the 5000 m max range) | Over 2 mi | Over 3.2 km | more than 2 miles away |

Why these: the edges are the ½, 1 and 2 mile range presets (800, 1600, 3200 m),
so a range and its outermost band agree and imperial labels are round. Each
band doubles the previous one, so relative precision is constant. There is no
¼ mi band: grid snapping moves a distance by up to ~320 m (see below), which
would make a 400 m band wrong too often, and the nearest band is the most
useful one for localisation. A 400 m or 500 m range simply shows everyone as
"Within ½ mi", which is true.

The client never converts a band back into a single number, prefixes "~", or
says "about". Ranges are described as approximate in the Nearby sheet.

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
- **The range edge, on every request.** Whether someone is visible is not
  held (visibility must stay fresh), so an attacker at a fixed range can see
  the target appear or vanish as either of them crosses the edge. It resolves
  cell centres only, is limited by the 30/min request limit and the spoofing
  envelope, and range changes cost a new session (12 per 10 min). A future
  option is an exit/entry cooldown, at the cost of fresh visibility.
- A patient spoofer comparing samples from many positions can locate a
  stationary target to roughly its 250 m cell within minutes; several accounts
  multiply the sample rate. Moving targets are much harder.
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
3. Expire older TestFlight builds, then `supabase functions deploy get-nearby-drivers`
   (that one function only; see `docs/SECURITY_LOCKDOWN.md` on why never a
   blanket deploy). Older builds then get an empty Nearby list: they would
   otherwise place drivers without a distance at a NaN map coordinate, which
   MapKit rejects (inferred from MapKit's behaviour, not reproduced on a
   device).
4. Once no build older than step 1 is in use, delete `legacyDistanceToBand`
   and the legacy-request branch in `handler.ts`, and drop
   `get_nearby_drivers_v2` in a later migration.

## Rollback

1. Redeploy the previous `get-nearby-drivers` (the Phase 1 version calls v2).
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
deno test  --config deno.json supabase/functions/get-nearby-drivers/handler.test.ts
```

Performance on the test machine: with 3 000 live users in a 22 km square
(~470 candidates in range), v3 takes ~150 ms versus ~13 ms for v2; the cost is
the per-candidate pair check (~0.14 ms each, which is also the per-event cost
of the speaking-state policy). Realistic densities are far lower; a set-based
v3 is the optimisation if it is ever needed.

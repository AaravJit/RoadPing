# Backend security lockdown (migration 010)

Migration: `supabase/migrations/20260930000010_security_lockdown.sql`
Rollback: `supabase/rollback/20260930000010_security_lockdown.down.sql`
Tests: `supabase/tests/database/security_lockdown.test.sql` (pgTAP). Run with
`supabase test db`, or without Docker via `scripts/db-test/run.sh` against a
plain Postgres with PostGIS, pg_cron and pgTAP (`ROLLBACK_CHECK=1` also
exercises the rollback and re-applies the migration).

## Why

Migrations 001–009 never revoked `EXECUTE`. Postgres grants `EXECUTE` on new
functions to `PUBLIC`, and Supabase's default privileges also grant it to
`anon` and `authenticated`. Every `SECURITY DEFINER` function in `public` was
therefore callable through `/rest/v1/rpc/*` with the anon key that ships in the
app, and most of them take the caller's identity as a parameter
(`p_caller_id`, `p_user_id`). That made `get_nearby_drivers` an
unauthenticated live-location lookup around any point and `check_private_zone`
a home-finder.

The client never calls `.rpc()` (verified: `grep -rn "\.rpc(" src app` is
empty), so no function in `public` needs to be client-callable.

## Function inventory

| Function (exact signature) | Kind | Intended caller | Used by RLS? | Before | After |
|---|---|---|---|---|---|
| `set_updated_at()` | trigger, INVOKER | triggers | no | PUBLIC | unchanged (not DEFINER; trigger-only) |
| `handle_new_user()` | trigger, DEFINER | `auth.users` trigger | no | PUBLIC, anon, authenticated | owner only (triggers still fire) |
| `handle_new_room()` | trigger, DEFINER | `rooms` trigger | no | PUBLIC, anon, authenticated | owner only |
| `is_blocked(uuid, uuid)` | helper, DEFINER | `get_nearby_drivers*` (runs as owner) | no | PUBLIC, anon, authenticated | owner only |
| `is_room_member(uuid, uuid)` | RLS helper, DEFINER | rooms / room_members / voice_sessions policies | **yes** | PUBLIC, anon, authenticated | owner only; policies repointed to `private.is_room_member(uuid)` |
| `is_room_owner(uuid, uuid)` | RLS helper, DEFINER | room_members policies | **yes** | PUBLIC, anon, authenticated | owner only; policies repointed to `private.is_room_owner(uuid)` |
| `is_user_inside_private_zone(uuid, geography)` | helper, DEFINER | `check_private_zone` | no | PUBLIC, anon, authenticated | owner only |
| `check_private_zone(uuid, float8, float8)` | Edge helper, DEFINER | start-live-session, update-live-location | no | PUBLIC, anon, authenticated | service_role |
| `upsert_location_presence(uuid, uuid, float8, float8)` | Edge helper, DEFINER | start-live-session | no | PUBLIC, anon, authenticated | service_role (body now also resets jump state) |
| `update_location_heartbeat(uuid, uuid, float8, float8)` | Edge helper, DEFINER | update-live-location | no | PUBLIC, anon, authenticated | service_role (body now GPS-error-tolerant jump handling) |
| `end_live_session(uuid, uuid, session_ended_reason)` | Edge helper, DEFINER | start/stop-live-session, update-live-location, delete-account | no | PUBLIC, anon, authenticated | service_role |
| `expire_stale_sessions()` | job, DEFINER | pg_cron (as postgres), expire-stale-sessions Edge Function | no | PUBLIC, anon, authenticated | service_role (+ owner for cron) |
| `get_nearby_drivers(float8, float8, float8, uuid)` | Edge helper, DEFINER | get-nearby-drivers (old build) | no | PUBLIC, anon, authenticated | service_role; **deprecated**, kept only so an un-redeployed Edge Function keeps working |
| **new** `get_nearby_drivers_v2(uuid, integer)` | Edge helper, DEFINER | get-nearby-drivers | no | — | service_role |
| **new** `consume_rate_limit(uuid, text, integer, integer)` | Edge helper, DEFINER | rate-limited Edge Functions | no | — | service_role |
| **new** `private.is_room_member(uuid)` | RLS helper, DEFINER, uses `auth.uid()` | RLS policies | yes | — | authenticated (schema not exposed by the API) |
| **new** `private.is_room_owner(uuid)` | RLS helper, DEFINER, uses `auth.uid()` | RLS policies | yes | — | authenticated (not exposed) |
| **new** `private.can_view_open_voice(uuid)` | RLS helper, DEFINER, uses `auth.uid()` | voice_sessions SELECT policy | yes | — | authenticated (not exposed) |

`private` is not in the API's exposed schemas (`supabase/config.toml` `[api].schemas`
and the hosted project's Data API settings), so `authenticated` can execute
those helpers inside policy evaluation and Realtime, but no client can call
them. The private helpers take no user id: they read `auth.uid()`.

All functions created or replaced by 010 use `SET search_path = ''` and
schema-qualify every relation, type and non-catalog function.

### Default privileges for future functions

Invariant: a new function created by the migration role (`postgres`) is not
client-executable just because someone forgot a `REVOKE`. Two defaults grant
it today, and 010 removes both:

1. Supabase's per-schema default `GRANT EXECUTE ... TO anon, authenticated` in
   `public`: `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON
   FUNCTIONS FROM anon, authenticated`.
2. Postgres's built-in `EXECUTE` to `PUBLIC`. Per-schema default privileges
   are *added* to the global ones and cannot subtract from them, so
   `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM
   PUBLIC` is a no-op: it creates no `pg_default_acl` row and the next function
   is still executable by `anon` (verified on Postgres 16). The revoke therefore
   has to be role-wide: `ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS
   FROM PUBLIC` (no `IN SCHEMA`), which applies only to functions this role
   creates from now on.

Scope, verified locally: functions created before the change keep their
grants; functions created by other roles (Supabase's `supabase_admin`,
`supabase_auth_admin`, ...) are unaffected; an extension installed by
`postgres` into `extensions` stays executable because 010 re-adds
`IN SCHEMA extensions GRANT EXECUTE ... TO PUBLIC`. It does apply to every
other schema the role creates functions in (`private`, `pg_temp`, an extension
installed into `public`). `service_role` keeps Supabase's per-schema grant in
`public`, so new Edge Function helpers need no extra grant. A new function meant
for clients (for example an RLS helper called by `authenticated`, or an Auth
hook) needs an explicit `GRANT EXECUTE`. The pgTAP test still fails if any
`SECURITY DEFINER` function in `public` is executable by `anon` or
`authenticated`, as a second line of defence.

## Policy changes

| Table | Policy | Change |
|---|---|---|
| rooms | public visible to all; private to members only | `is_room_member(id, auth.uid())` → `private.is_room_member(id)` |
| room_members | members can see fellow members | → `private.is_room_member(room_id)` |
| room_members | owner can add any user to their room | → `private.is_room_owner(room_id)` (behaviour unchanged; consent is a later task) |
| room_members | owner manages moderator status | → `private.is_room_owner(room_id)` |
| room_members | user leaves; owner kicks | → `private.is_room_owner(room_id)` |
| voice_sessions | reads own + room members + open-channel | open-channel branch now requires `private.can_view_open_voice(user_id)` (both live and unexpired, within the smaller of the two ranges, not blocked either way, speaker not banned) and a row started in the last 2 minutes |
| live_sessions | user starts own session / heartbeats and ends own session | **dropped** (all writes go through Edge Functions) |
| location_presence | inserts / updates / deletes own presence | **dropped** |
| voice_sessions | creates / updates / ends own | **dropped** |

Table grants: `INSERT, UPDATE, DELETE, TRUNCATE` revoked from `anon` and
`authenticated` on `live_sessions`, `location_presence`, `voice_sessions`; all
privileges revoked on `location_presence`. Client reads that remain:
`live_sessions` own row (`src/services/rooms.ts:114`), `voice_sessions`
Realtime (`src/services/voice.ts:220`).

## Proximity semantics after the change

- The query point is the caller's **stored** presence, never request lat/lng
  (the Edge Function accepts and ignores `lat`/`lng` from older clients).
- Presence and sessions count only while `expires_at > now()` on both the
  presence row and the live session; the one-minute cron sweep is no longer
  what hides a dead session.
- Visibility is mutual: the distance must be within the smaller of the
  caller's effective range and the target's own broadcast range.
- The caller's effective range is floored to a fixed step
  (100, 250, 400, 500, 800, 1000, 1600, 2000, 3000, 3200, 4800, 5000 m; the
  app's presets are all steps), so the range cannot be binary-searched.
- Banned callers get 403 from nearby; a banned user's heartbeat ends the session.
- Distances are still rounded to 50 m. Snapping to a grid / distance bands is
  Task 2 and is what closes slow trilateration by a GPS-spoofing account.

## Live-session lifecycle contract

Chosen behaviour: a bounded reconnect grace, enforced identically by the
heartbeat and the cleanup job (`private.live_session_grace()` = 35 s), so cron
timing never decides whether a session survives.

| Time since `expires_at` (25 s after the last accepted heartbeat) | Visible to others | Heartbeat |
|---|---|---|
| before it | yes | extends the session |
| 0 – 35 s after (reconnect window) | **no** | resumes the same session |
| more than 35 s after | no | ends it as `expired`, returns NULL (Edge: 404); the client must start a new session |

The cleanup job deletes presence and expires sessions at the same 35 s
boundary. A driver is therefore never visible with a stale position, a tunnel
or a lost signal of up to about a minute since the last heartbeat recovers
without a new session, and nothing older can be revived. Why not "expiry is
authoritative": with a 12 s heartbeat and 25 s expiry, a single slow or missed
heartbeat would kill the session, and today's app does not recover from that
(it keeps showing LIVE). The grace only affects resumption; visibility is
still cut at `expires_at`.

## Location jump handling

`update_location_heartbeat` compares each report with the last accepted
position. Allowed movement is `300 m + 85 m/s × seconds since last accepted
fix`: 300 m absorbs two independent ~100 m "Balanced" fixes plus Wi-Fi/cell
fallbacks, 85 m/s (~190 mph) covers any road vehicle. A report outside that
envelope keeps the session alive but does not move the user; it becomes a
candidate. Three consecutive candidates within 300 m of each other spanning at
least 20 s are accepted (GPS re-acquisition after a tunnel, a stale first fix).
Because the envelope grows with time, a user held at an old position is
re-accepted naturally as time passes.

## Rate limits (fixed window, per user)

| Endpoint | Limit | Normal client rate |
|---|---|---|
| get-nearby-drivers | 30 / 60 s | 12 / min |
| update-live-location | 20 / 60 s | 5 / min |
| start-live-session | 12 / 10 min | on demand |
| start-voice-session | 60 / 60 s | per PTT press |
| create-agora-token | 30 / 10 min | per room join / foreground |
| report-user | 20 / hour | on demand |

Exceeding returns HTTP 429. If the rate-limit RPC itself errors, the request is
allowed and the error logged, so a limiter fault can't take the app down; the
location protections above do not depend on it.

## Production migration history

Production (`govebqdalfcoiyovsdth`) had already applied
`20260609000010_terms_and_report_reasons` from the unmerged
`apple-compliance-resubmission` branch. That file is now in
`supabase/migrations/` byte-for-byte, so the repo history matches production
and `db push` no longer stops on a remote version missing locally. Every
statement in it is `IF NOT EXISTS`, and the CLI skips versions already recorded
in `supabase_migrations.schema_migrations`, so it is never re-run in
production. `production_parity.test.sql` checks its columns and enum labels.

The app code, types and report UI that use these columns and reasons are still
only on `apple-compliance-resubmission`. `_shared/validate.ts` carries the two
new report reasons here so that deploying `report-user` from this branch does
not reject reports production already accepts.

## Deploy order

1. `supabase link --project-ref govebqdalfcoiyovsdth`, then
   `supabase migration list`: local and remote must match through
   `20260609000010`, with only `20260930000010` pending. If anything else
   differs, stop.
2. `supabase db push --dry-run` must list only
   `20260930000010_security_lockdown.sql`; then `supabase db push`. The
   currently deployed Edge Functions keep working: they use `service_role`, and
   the deprecated `get_nearby_drivers(float8, float8, float8, uuid)` still
   exists for them.
3. Deploy only these functions, one by one:
   `supabase functions deploy <name>` for get-nearby-drivers,
   update-live-location, start-live-session, start-voice-session,
   create-agora-token, report-user. Do not run a blanket
   `supabase functions deploy`: `get-room-members` on this branch lacks the
   block filter from `apple-compliance-resubmission`.

## Rollback

Run `supabase/rollback/20260930000010_security_lockdown.down.sql` with the SQL
editor or `psql`, then redeploy the previous Edge Functions. It restores the
original grants, policies and function bodies and drops the new objects.
Rolling back re-opens every hole above, so only do it to recover from an
outage.

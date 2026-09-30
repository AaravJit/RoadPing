-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 010: Security lockdown + trusted proximity foundation
--
-- Design, inventory and rollback: docs/SECURITY_LOCKDOWN.md
--
-- 1. private schema + RLS helpers that read auth.uid() (not exposed by the API)
-- 2. Repoint rooms / room_members / voice_sessions policies to those helpers
-- 3. Remove direct client writes to live_sessions, location_presence,
--    voice_sessions (all real writes go through Edge Functions)
-- 4. Open-channel voice rows visible only to nearby, unblocked live users
-- 5. Location jump handling state on location_presence
-- 6. get_nearby_drivers_v2: query from the caller's stored presence, expiry
--    and mutual range enforced
-- 7. consume_rate_limit for Edge Function throttling
-- 8. Live-session lifecycle: bounded reconnect grace, enforced in the
--    heartbeat and the cleanup job alike
-- 9. Revoke EXECUTE on every SECURITY DEFINER function in public from
--    PUBLIC / anon / authenticated; grant Edge helpers to service_role only;
--    new functions created by the migration role are not client-executable
--    by default
--
-- Every function created or replaced here uses SET search_path = '' and
-- schema-qualifies every relation, type and non-catalog function.
-- ─────────────────────────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════════════════════
-- 1. private schema + RLS helpers
-- ═══════════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
-- authenticated needs USAGE so policies (and Realtime, which evaluates them as
-- the subscriber) can call the helpers. The schema is not in the API's
-- exposed schemas, so clients cannot call these directly.
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

-- Live-session lifecycle contract (docs/SECURITY_LOCKDOWN.md):
--   • visible to others only while now() < expires_at (25 s after the last
--     accepted heartbeat);
--   • reconnect window: until expires_at + this grace, a heartbeat resumes
--     the SAME session (the driver was hidden meanwhile);
--   • after that the session is dead: a heartbeat ends it as 'expired' and
--     returns NULL, and the client must start a new session. The cleanup job
--     sweeps at the same boundary, so cron timing never decides the outcome.
CREATE OR REPLACE FUNCTION private.live_session_grace()
RETURNS interval
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$ SELECT INTERVAL '35 seconds' $$;

CREATE OR REPLACE FUNCTION private.is_room_member(p_room uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.room_members
    WHERE room_id = p_room
      AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION private.is_room_owner(p_room uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.rooms
    WHERE id       = p_room
      AND owner_id = auth.uid()
  );
$$;

-- TRUE when the calling user may see p_speaker's open-channel speaking state:
-- both are live with unexpired presence, within the smaller of the two
-- broadcast ranges, neither has blocked the other, and the speaker is not
-- banned or shadow-banned. Mirrors get_nearby_drivers_v2 visibility.
CREATE OR REPLACE FUNCTION private.can_view_open_voice(p_speaker uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.location_presence me
    JOIN public.live_sessions ms
      ON  ms.id         = me.session_id
      AND ms.user_id    = me.user_id
      AND ms.status     = 'active'
      AND ms.expires_at > now()
    JOIN public.location_presence them
      ON  them.user_id    = p_speaker
      AND them.expires_at > now()
    JOIN public.live_sessions ts
      ON  ts.id         = them.session_id
      AND ts.user_id    = them.user_id
      AND ts.status     = 'active'
      AND ts.expires_at > now()
    JOIN public.profiles tp
      ON  tp.id               = p_speaker
      AND tp.is_banned        = false
      AND tp.is_shadow_banned = false
    WHERE me.user_id    = auth.uid()
      AND me.expires_at > now()
      AND p_speaker    <> auth.uid()
      AND extensions.ST_DWithin(me.location, them.location, LEAST(ms.range_m, ts.range_m))
      AND NOT EXISTS (
        SELECT 1
        FROM public.blocks b
        WHERE (b.blocker_id = auth.uid() AND b.blocked_id = p_speaker)
           OR (b.blocker_id = p_speaker  AND b.blocked_id = auth.uid())
      )
  );
$$;

REVOKE ALL ON FUNCTION private.is_room_member(uuid)      FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_room_owner(uuid)       FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_view_open_voice(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.live_session_grace()      FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_room_member(uuid)      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_room_owner(uuid)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_view_open_voice(uuid) TO authenticated, service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Repoint room policies to the private helpers (same behaviour)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER POLICY "rooms: public visible to all; private to members only"
  ON public.rooms
  USING (
    NOT is_private
    OR private.is_room_member(id)
  );

ALTER POLICY "room_members: members can see fellow members"
  ON public.room_members
  USING (private.is_room_member(room_id));

ALTER POLICY "room_members: owner can add any user to their room"
  ON public.room_members
  WITH CHECK (private.is_room_owner(room_id));

ALTER POLICY "room_members: owner manages moderator status"
  ON public.room_members
  USING      (private.is_room_owner(room_id))
  WITH CHECK (private.is_room_owner(room_id));

ALTER POLICY "room_members: user leaves; owner kicks"
  ON public.room_members
  USING (
    auth.uid() = user_id
    OR private.is_room_owner(room_id)
  );


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Remove direct client writes (Edge Functions use service_role)
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "live_sessions: user starts own session"                  ON public.live_sessions;
DROP POLICY IF EXISTS "live_sessions: user heartbeats and ends own session"     ON public.live_sessions;
DROP POLICY IF EXISTS "location_presence: user inserts own presence"            ON public.location_presence;
DROP POLICY IF EXISTS "location_presence: user updates own presence (heartbeat)" ON public.location_presence;
DROP POLICY IF EXISTS "location_presence: user deletes own presence on stop"    ON public.location_presence;
DROP POLICY IF EXISTS "voice_sessions: user creates own"                        ON public.voice_sessions;
DROP POLICY IF EXISTS "voice_sessions: user updates own (toggle speaking)"      ON public.voice_sessions;
DROP POLICY IF EXISTS "voice_sessions: user can end own"                        ON public.voice_sessions;

-- Belt and braces: table privileges as well as policies.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.live_sessions  FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.voice_sessions FROM anon, authenticated;
REVOKE ALL ON public.location_presence FROM anon, authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Open-channel speaking state: nearby, unblocked live users only
-- ═══════════════════════════════════════════════════════════════════════════
-- The 2-minute window lets a nearby listener receive the "stopped speaking"
-- update (voice rows live at most 60 s) without exposing speaking history.

DROP POLICY IF EXISTS "voice_sessions: user reads own + room members + open-channel"
  ON public.voice_sessions;

CREATE POLICY "voice_sessions: own, room members, nearby open-channel"
  ON public.voice_sessions
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR (room_id IS NOT NULL AND private.is_room_member(room_id))
    OR (
      room_id IS NULL
      AND started_at > now() - INTERVAL '2 minutes'
      AND private.can_view_open_voice(user_id)
    )
  );


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Location jump handling state
-- ═══════════════════════════════════════════════════════════════════════════
-- updated_at is rewritten by tr_location_presence_updated_at on every UPDATE,
-- so the time of the last *accepted* position needs its own column.

ALTER TABLE public.location_presence
  ADD COLUMN IF NOT EXISTS location_accepted_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS pending_location     extensions.geography(Point, 4326),
  ADD COLUMN IF NOT EXISTS pending_count        smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pending_since        timestamptz;

COMMENT ON COLUMN public.location_presence.pending_location IS
  'Candidate position from a report outside the plausible-movement envelope. '
  'Accepted after 3 consistent reports spanning >= 20 s. Never returned to clients.';

CREATE OR REPLACE FUNCTION public.upsert_location_presence(
  p_user_id    uuid,
  p_session_id uuid,
  p_lat        double precision,
  p_lng        double precision
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_expires_at timestamptz := now() + INTERVAL '25 seconds';
BEGIN
  INSERT INTO public.location_presence (
    user_id, session_id, location, expires_at,
    location_accepted_at, pending_location, pending_count, pending_since
  )
  VALUES (
    p_user_id,
    p_session_id,
    extensions.ST_SetSRID(
      extensions.ST_MakePoint(p_lng, p_lat), 4326
    )::extensions.geography,
    v_expires_at,
    now(), NULL, 0, NULL
  )
  ON CONFLICT (user_id) DO UPDATE SET
    session_id           = EXCLUDED.session_id,
    location             = EXCLUDED.location,
    updated_at           = now(),
    expires_at           = EXCLUDED.expires_at,
    location_accepted_at = now(),
    pending_location     = NULL,
    pending_count        = 0,
    pending_since        = NULL;

  RETURN v_expires_at;
END;
$$;

-- Returns the new expires_at, or NULL when there is no active session with a
-- presence row for (p_user_id, p_session_id), or when the session is past its
-- reconnect grace (it is then ended as 'expired'). An implausible jump keeps
-- the session alive at the last accepted position (docs/SECURITY_LOCKDOWN.md).
CREATE OR REPLACE FUNCTION public.update_location_heartbeat(
  p_user_id    uuid,
  p_session_id uuid,
  p_lat        double precision,
  p_lng        double precision
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- Two independent ~100 m "Balanced" fixes plus Wi-Fi/cell fallback noise.
  c_error_allowance_m   constant double precision := 300;
  -- ~190 mph: faster than any road vehicle.
  c_max_speed_mps       constant double precision := 85;
  c_confirm_reports     constant smallint         := 3;
  c_confirm_min_span    constant interval         := INTERVAL '20 seconds';

  v_expires_at         timestamptz := now() + INTERVAL '25 seconds';
  v_session_expires_at timestamptz;
  v_new                extensions.geography;
  v_row        public.location_presence%ROWTYPE;
  v_elapsed_s  double precision;
  v_count      smallint;
  v_since      timestamptz;
BEGIN
  v_new := extensions.ST_SetSRID(
             extensions.ST_MakePoint(p_lng, p_lat), 4326
           )::extensions.geography;

  -- Lock presence, then the session: the same order end_live_session and
  -- expire_stale_sessions use, so a concurrent stop or sweep serialises with
  -- this heartbeat instead of deadlocking.
  SELECT * INTO v_row
  FROM public.location_presence
  WHERE user_id    = p_user_id
    AND session_id = p_session_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT expires_at INTO v_session_expires_at
  FROM public.live_sessions
  WHERE id      = p_session_id
    AND user_id = p_user_id
    AND status  = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Past the reconnect grace: the session is dead, whatever cron has done.
  IF now() > v_session_expires_at + private.live_session_grace() THEN
    PERFORM public.end_live_session(p_session_id, p_user_id, 'expired'::public.session_ended_reason);
    RETURN NULL;
  END IF;

  v_elapsed_s := GREATEST(EXTRACT(EPOCH FROM (now() - v_row.location_accepted_at)), 1);

  IF extensions.ST_DWithin(
       v_row.location, v_new,
       c_error_allowance_m + c_max_speed_mps * v_elapsed_s
     ) THEN
    -- Plausible movement: accept.
    UPDATE public.location_presence SET
      location             = v_new,
      expires_at           = v_expires_at,
      location_accepted_at = now(),
      pending_location     = NULL,
      pending_count        = 0,
      pending_since        = NULL
    WHERE user_id = p_user_id;
  ELSE
    -- Implausible jump: hold the last accepted position and track a candidate.
    IF v_row.pending_location IS NOT NULL
       AND extensions.ST_DWithin(v_row.pending_location, v_new, c_error_allowance_m) THEN
      v_count := v_row.pending_count + 1;
      v_since := v_row.pending_since;
    ELSE
      v_count := 1;
      v_since := now();
    END IF;

    IF v_count >= c_confirm_reports AND now() - v_since >= c_confirm_min_span THEN
      -- Consistent relocation (e.g. GPS re-acquired after a tunnel): accept.
      UPDATE public.location_presence SET
        location             = v_new,
        expires_at           = v_expires_at,
        location_accepted_at = now(),
        pending_location     = NULL,
        pending_count        = 0,
        pending_since        = NULL
      WHERE user_id = p_user_id;
    ELSE
      UPDATE public.location_presence SET
        expires_at       = v_expires_at,
        pending_location = v_new,
        pending_count    = v_count,
        pending_since    = v_since
      WHERE user_id = p_user_id;
    END IF;
  END IF;

  UPDATE public.live_sessions SET
    last_heartbeat_at = now(),
    expires_at        = v_expires_at
  WHERE id      = p_session_id
    AND user_id = p_user_id
    AND status  = 'active';

  RETURN v_expires_at;
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 6. get_nearby_drivers_v2 — caller's stored presence is the query point
-- ═══════════════════════════════════════════════════════════════════════════
-- Same columns as get_nearby_drivers so the Edge Function response shape does
-- not change. p_range_m is the caller's effective range (already capped and
-- stepped by the Edge Function); the target's own range also applies.

CREATE OR REPLACE FUNCTION public.get_nearby_drivers_v2(
  p_caller_id uuid,
  p_range_m   integer
)
RETURNS TABLE (
  user_id                uuid,
  handle                 text,
  display_name           text,
  avatar_url             text,
  vehicle_type           public.vehicle_type,
  vehicle_label          text,
  vehicle_color          text,
  vehicle_make           text,
  vehicle_model          text,
  approximate_distance_m integer,
  is_speaking            boolean,
  session_id             uuid,
  dnd                    boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH me AS (
    SELECT lp.location
    FROM public.location_presence lp
    JOIN public.live_sessions ls
      ON  ls.id         = lp.session_id
      AND ls.user_id    = lp.user_id
      AND ls.status     = 'active'
      AND ls.expires_at > now()
    WHERE lp.user_id    = p_caller_id
      AND lp.expires_at > now()
  )
  SELECT
    p.id                                                              AS user_id,
    p.handle,
    p.display_name,
    p.avatar_url,
    v.vehicle_type,
    v.label                                                           AS vehicle_label,
    v.color                                                           AS vehicle_color,
    v.make                                                            AS vehicle_make,
    v.model                                                           AS vehicle_model,
    (round(extensions.ST_Distance(lp.location, me.location) / 50.0) * 50)::integer
                                                                      AS approximate_distance_m,
    EXISTS (
      SELECT 1
      FROM   public.voice_sessions vs
      WHERE  vs.live_session_id = ls.id
        AND  vs.is_speaking     = true
        AND  vs.ended_at        IS NULL
        AND  (vs.expires_at     IS NULL OR vs.expires_at > now())
    )                                                                 AS is_speaking,
    ls.id                                                             AS session_id,
    p.dnd_mode                                                        AS dnd
  FROM me
  JOIN public.location_presence lp
    ON  lp.expires_at > now()
  JOIN public.live_sessions ls
    ON  ls.id         = lp.session_id
    AND ls.user_id    = lp.user_id
    AND ls.status     = 'active'
    AND ls.expires_at > now()
  JOIN public.profiles p ON p.id = lp.user_id
  LEFT JOIN public.vehicles v ON v.id = ls.vehicle_id
  -- First test uses a constant radius so the GIST index applies; the second
  -- applies the other driver's own range (mutual visibility).
  WHERE extensions.ST_DWithin(lp.location, me.location, p_range_m)
    AND extensions.ST_DWithin(lp.location, me.location, ls.range_m)
    AND lp.user_id        <> p_caller_id
    AND p.is_banned        = false
    AND p.is_shadow_banned = false
    AND NOT public.is_blocked(p_caller_id, lp.user_id)
  ORDER BY extensions.ST_Distance(lp.location, me.location) ASC
  LIMIT 100;
$$;

COMMENT ON FUNCTION public.get_nearby_drivers_v2(uuid, integer) IS
  'Safe driver cards around the caller''s stored, unexpired presence. Mutual range, '
  'excludes self, banned, shadow-banned and blocks in either direction. Distance '
  'rounded to 50 m. Service role only.';

COMMENT ON FUNCTION public.get_nearby_drivers(double precision, double precision, double precision, uuid) IS
  'DEPRECATED by get_nearby_drivers_v2 (trusts caller-supplied coordinates). '
  'Kept, service role only, so an un-redeployed Edge Function keeps working. Drop in a later migration.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Rate limiting (fixed window per user + bucket)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS private.rate_limits (
  user_id      uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  bucket       text        NOT NULL CHECK (char_length(bucket) BETWEEN 1 AND 64),
  window_start timestamptz NOT NULL,
  hits         integer     NOT NULL,
  PRIMARY KEY (user_id, bucket)
);

ALTER TABLE private.rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.rate_limits FROM PUBLIC, anon, authenticated;

-- Returns TRUE when the request is within the limit (and counts it).
CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_user_id        uuid,
  p_bucket         text,
  p_limit          integer,
  p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_window timestamptz;
  v_hits   integer;
BEGIN
  IF p_limit < 1 OR p_window_seconds < 1 THEN
    RAISE EXCEPTION 'consume_rate_limit: limit and window must be positive';
  END IF;

  v_window := to_timestamp(
    floor(EXTRACT(EPOCH FROM now()) / p_window_seconds) * p_window_seconds
  );

  INSERT INTO private.rate_limits AS r (user_id, bucket, window_start, hits)
  VALUES (p_user_id, p_bucket, v_window, 1)
  ON CONFLICT (user_id, bucket) DO UPDATE SET
    hits         = CASE WHEN r.window_start = EXCLUDED.window_start
                        THEN r.hits + 1 ELSE 1 END,
    window_start = EXCLUDED.window_start
  RETURNING hits INTO v_hits;

  RETURN v_hits <= p_limit;
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 8. Cleanup job: reconnect grace, purge ended voice rows and old rate-limit
--    windows
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.expire_stale_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_expired_voice    int;
  v_deleted_presence int;
  v_expired_sessions int;
  v_purged_voice     int;
BEGIN
  -- Step 0: Close voice sessions whose speaking window has expired
  WITH updated AS (
    UPDATE public.voice_sessions SET
      is_speaking = false,
      ended_at    = now()
    WHERE is_speaking = true
      AND ended_at    IS NULL
      AND expires_at  IS NOT NULL
      AND expires_at  < now()
    RETURNING id
  )
  SELECT COUNT(*) INTO v_expired_voice FROM updated;

  -- Step 1: Remove presence rows past the reconnect grace. (Queries already
  -- hide presence as soon as expires_at passes.)
  WITH deleted AS (
    DELETE FROM public.location_presence
    WHERE expires_at < now() - private.live_session_grace()
    RETURNING user_id
  )
  SELECT COUNT(*) INTO v_deleted_presence FROM deleted;

  -- Step 2: Expire active sessions past the reconnect grace (same boundary
  -- update_location_heartbeat enforces)
  WITH updated AS (
    UPDATE public.live_sessions SET
      status       = 'expired',
      ended_at     = now(),
      ended_reason = 'expired'
    WHERE status     = 'active'
      AND expires_at < now() - private.live_session_grace()
    RETURNING id
  )
  SELECT COUNT(*) INTO v_expired_sessions FROM updated;

  -- Step 3: No speaking history — drop ended voice rows after an hour
  WITH deleted AS (
    DELETE FROM public.voice_sessions
    WHERE ended_at IS NOT NULL
      AND ended_at < now() - INTERVAL '1 hour'
    RETURNING id
  )
  SELECT COUNT(*) INTO v_purged_voice FROM deleted;

  -- Step 4: Old rate-limit windows (largest window in use is 1 hour)
  DELETE FROM private.rate_limits
  WHERE window_start < now() - INTERVAL '1 day';

  IF v_expired_voice > 0 OR v_deleted_presence > 0 OR v_expired_sessions > 0 OR v_purged_voice > 0 THEN
    RAISE LOG
      'expire_stale_sessions: closed % voice sessions, removed % presence rows, expired % live sessions, purged % voice rows',
      v_expired_voice, v_deleted_presence, v_expired_sessions, v_purged_voice;
  END IF;
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 9. EXECUTE privileges
-- ═══════════════════════════════════════════════════════════════════════════

-- Trigger functions and internal helpers: owner only.
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_room()                                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_blocked(uuid, uuid)                             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_room_member(uuid, uuid)                         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_room_owner(uuid, uuid)                          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_user_inside_private_zone(uuid, extensions.geography) FROM PUBLIC, anon, authenticated;

-- Edge Function helpers: service_role only.
REVOKE EXECUTE ON FUNCTION public.check_private_zone(uuid, double precision, double precision)             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_location_presence(uuid, uuid, double precision, double precision) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_location_heartbeat(uuid, uuid, double precision, double precision) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.end_live_session(uuid, uuid, public.session_ended_reason)                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_stale_sessions()                                                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_nearby_drivers(double precision, double precision, double precision, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_nearby_drivers_v2(uuid, integer)                                     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.consume_rate_limit(uuid, text, integer, integer)                         FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.check_private_zone(uuid, double precision, double precision)             TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_location_presence(uuid, uuid, double precision, double precision) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_location_heartbeat(uuid, uuid, double precision, double precision) TO service_role;
GRANT EXECUTE ON FUNCTION public.end_live_session(uuid, uuid, public.session_ended_reason)                TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_stale_sessions()                                                  TO service_role;
GRANT EXECUTE ON FUNCTION public.get_nearby_drivers(double precision, double precision, double precision, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_nearby_drivers_v2(uuid, integer)                                     TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(uuid, text, integer, integer)                         TO service_role;

-- Future functions created by this (the migration) role must not become
-- client-executable because someone forgot a REVOKE.
--
-- 1. Remove Supabase's per-schema default grant to anon/authenticated in public.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
-- 2. Remove the built-in EXECUTE-to-PUBLIC default. Postgres only allows this
--    without IN SCHEMA: per-schema default privileges are added to the global
--    ones and cannot subtract from them (an IN SCHEMA ... FROM PUBLIC revoke
--    is a no-op). It is scoped to objects this role creates from now on:
--    existing functions and other roles' functions are unchanged.
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
-- 3. Keep extension functions this role installs into `extensions` (e.g. a
--    future PostGIS update) executable by everyone, as they are today.
ALTER DEFAULT PRIVILEGES IN SCHEMA extensions GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
-- service_role keeps Supabase's per-schema default grant in public, so new
-- Edge Function helpers work without an explicit GRANT. A new function meant
-- for clients needs an explicit GRANT EXECUTE ... TO authenticated.

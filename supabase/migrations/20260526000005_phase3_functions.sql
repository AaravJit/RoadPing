-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 005: Phase 3 — Edge Function helper SQL
--
-- 1. profiles: add handle (unique @username) and dnd_mode columns
-- 2. live_sessions: add range_m column (user's chosen broadcast radius)
-- 3. voice_sessions: add expires_at column (auto-expiry for stuck speaking state)
-- 4. Replace get_nearby_drivers stub with full PostGIS implementation
-- 5. check_private_zone — double-precision lat/lng wrapper for Edge Functions
-- 6. upsert_location_presence — create/update GPS row from Edge Function
-- 7. update_location_heartbeat — extend session + presence expiry on heartbeat
-- 8. end_live_session — atomic clean shutdown helper
-- 9. Refresh expire_stale_sessions to also sweep expired voice sessions
-- ─────────────────────────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════════════════════
-- 1. profiles: add handle and dnd_mode
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS handle text
    UNIQUE
    CHECK (
      handle IS NULL OR (
        char_length(handle) BETWEEN 3 AND 25
        AND handle ~ '^[a-zA-Z0-9_]+$'
      )
    ),
  ADD COLUMN IF NOT EXISTS dnd_mode boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.handle IS
  'Unique @username. Alphanumeric + underscores, 3-25 chars. NULL until set by user.';
COMMENT ON COLUMN public.profiles.dnd_mode IS
  'Do Not Disturb. User still appears on radar but is_speaking flag is suppressed.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. live_sessions: add range_m (broadcast radius, set at session start)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS range_m integer NOT NULL DEFAULT 2000
    CHECK (range_m BETWEEN 100 AND 5000);

COMMENT ON COLUMN public.live_sessions.range_m IS
  'User-chosen broadcast radius in metres (100–5000). Stored at session start; '
  'get_nearby_drivers caps the query to this value.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. voice_sessions: add expires_at (auto-expiry for stuck speaking state)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.voice_sessions
  ADD COLUMN IF NOT EXISTS expires_at timestamptz
    DEFAULT (now() + INTERVAL '60 seconds');

CREATE INDEX IF NOT EXISTS voice_sessions_expires_idx
  ON public.voice_sessions (expires_at)
  WHERE is_speaking = true AND ended_at IS NULL;

COMMENT ON COLUMN public.voice_sessions.expires_at IS
  'Auto-expiry sentinel. expire_stale_sessions() clears stuck speaking rows after this.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. get_nearby_drivers — replace Phase 2 stub with full PostGIS query
-- ═══════════════════════════════════════════════════════════════════════════

-- The Phase 2 stub had a different parameter signature (radius_m float).
-- Postgres does not allow CREATE OR REPLACE when the parameter list changes,
-- so we must DROP first.
DROP FUNCTION IF EXISTS public.get_nearby_drivers(float);

CREATE OR REPLACE FUNCTION public.get_nearby_drivers(
  p_lat       double precision,
  p_lng       double precision,
  p_range_m   double precision,
  p_caller_id uuid
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
SET search_path = public
AS $$
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
    -- Round to nearest 50 m: reduces position precision, prevents exact tracking
    (
      round(
        extensions.ST_Distance(
          lp.location,
          extensions.ST_SetSRID(
            extensions.ST_MakePoint(p_lng, p_lat), 4326
          )::extensions.geography
        ) / 50.0
      ) * 50
    )::integer                                                        AS approximate_distance_m,
    -- Speaking indicator: true only if an unexpired, active voice session exists
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
  FROM  public.location_presence lp
  JOIN  public.live_sessions ls
         ON  ls.user_id = lp.user_id
         AND ls.status  = 'active'
  JOIN  public.profiles p ON p.id = lp.user_id
  LEFT JOIN public.vehicles v ON v.id = ls.vehicle_id
  WHERE
        -- ⚡ Uses GIST index on location_presence.location
        extensions.ST_DWithin(
          lp.location,
          extensions.ST_SetSRID(
            extensions.ST_MakePoint(p_lng, p_lat), 4326
          )::extensions.geography,
          p_range_m
        )
    AND lp.user_id         != p_caller_id           -- exclude self
    AND p.is_banned         = false                 -- exclude banned
    AND p.is_shadow_banned  = false                 -- exclude shadow-banned
    AND NOT public.is_blocked(p_caller_id, lp.user_id)  -- exclude mutual blocks
  ORDER BY
    extensions.ST_Distance(
      lp.location,
      extensions.ST_SetSRID(
        extensions.ST_MakePoint(p_lng, p_lat), 4326
      )::extensions.geography
    ) ASC
  LIMIT 100;  -- cap result set in dense areas
$$;

COMMENT ON FUNCTION public.get_nearby_drivers(double precision, double precision, double precision, uuid) IS
  'Returns safe driver cards within p_range_m metres of (p_lat, p_lng). '
  'Excludes self, banned, shadow-banned, mutual blocks. '
  'Distance rounded to nearest 50 m. NEVER returns raw coordinates.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. check_private_zone — lat/lng wrapper for Edge Function RPC calls
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.check_private_zone(
  p_user_id uuid,
  p_lat     double precision,
  p_lng     double precision
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_user_inside_private_zone(
    p_user_id,
    extensions.ST_SetSRID(
      extensions.ST_MakePoint(p_lng, p_lat), 4326
    )::extensions.geography
  );
$$;

COMMENT ON FUNCTION public.check_private_zone(uuid, double precision, double precision) IS
  'Convenience wrapper: TRUE if (p_lat, p_lng) falls inside any active private zone '
  'owned by p_user_id. Used by Edge Functions where double-precision coords are simpler '
  'to pass than geography WKT.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 6. upsert_location_presence — insert or update GPS presence row
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.upsert_location_presence(
  p_user_id    uuid,
  p_session_id uuid,
  p_lat        double precision,
  p_lng        double precision
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expires_at timestamptz := now() + INTERVAL '25 seconds';
BEGIN
  INSERT INTO public.location_presence (
    user_id, session_id, location, expires_at
  )
  VALUES (
    p_user_id,
    p_session_id,
    extensions.ST_SetSRID(
      extensions.ST_MakePoint(p_lng, p_lat), 4326
    )::extensions.geography,
    v_expires_at
  )
  ON CONFLICT (user_id) DO UPDATE SET
    session_id = EXCLUDED.session_id,
    location   = EXCLUDED.location,
    updated_at = now(),
    expires_at = EXCLUDED.expires_at;

  RETURN v_expires_at;
END;
$$;

COMMENT ON FUNCTION public.upsert_location_presence(uuid, uuid, double precision, double precision) IS
  'Inserts or updates a location_presence row using PostGIS geography. '
  'Returns the new expires_at. SECURITY DEFINER bypasses the no-SELECT RLS policy.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 7. update_location_heartbeat — extend session + presence expiry on heartbeat
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.update_location_heartbeat(
  p_user_id    uuid,
  p_session_id uuid,
  p_lat        double precision,
  p_lng        double precision
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expires_at timestamptz := now() + INTERVAL '25 seconds';
BEGIN
  -- Update GPS position and extend presence expiry
  UPDATE public.location_presence SET
    location   = extensions.ST_SetSRID(
                   extensions.ST_MakePoint(p_lng, p_lat), 4326
                 )::extensions.geography,
    updated_at = now(),
    expires_at = v_expires_at
  WHERE user_id    = p_user_id
    AND session_id = p_session_id;

  -- Extend live session expiry (heartbeat keeps it alive)
  UPDATE public.live_sessions SET
    last_heartbeat_at = now(),
    expires_at        = v_expires_at
  WHERE id      = p_session_id
    AND user_id = p_user_id
    AND status  = 'active';

  RETURN v_expires_at;
END;
$$;

COMMENT ON FUNCTION public.update_location_heartbeat(uuid, uuid, double precision, double precision) IS
  'Updates GPS position and extends expires_at on both location_presence and live_sessions. '
  'Called on each location update from the mobile client. Returns new expires_at.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 8. end_live_session — atomic clean shutdown
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.end_live_session(
  p_session_id uuid,
  p_user_id    uuid,
  p_reason     public.session_ended_reason
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Close all active voice sessions for this live session
  UPDATE public.voice_sessions SET
    is_speaking = false,
    ended_at    = now()
  WHERE live_session_id = p_session_id
    AND ended_at        IS NULL;

  -- Delete location presence row (user vanishes from radar immediately)
  DELETE FROM public.location_presence
  WHERE user_id = p_user_id;

  -- Mark live session ended (or expired for cron-driven expiry)
  UPDATE public.live_sessions SET
    status       = CASE p_reason
                     WHEN 'expired' THEN 'expired'::public.session_status
                     ELSE                'ended'::public.session_status
                   END,
    ended_at     = now(),
    ended_reason = p_reason
  WHERE id      = p_session_id
    AND user_id = p_user_id
    AND status  = 'active';
END;
$$;

COMMENT ON FUNCTION public.end_live_session(uuid, uuid, public.session_ended_reason) IS
  'Atomically ends a live session: closes voice sessions, deletes location presence, '
  'and marks the session ended/expired. Called by stop-live-session and update-live-location '
  'Edge Functions.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 9. Refresh expire_stale_sessions — add voice session sweep
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.expire_stale_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expired_voice    int;
  v_deleted_presence int;
  v_expired_sessions int;
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

  -- Step 1: Remove stale location presence rows
  WITH deleted AS (
    DELETE FROM public.location_presence
    WHERE expires_at < now()
    RETURNING user_id
  )
  SELECT COUNT(*) INTO v_deleted_presence FROM deleted;

  -- Step 2: Mark stale active sessions as expired
  WITH updated AS (
    UPDATE public.live_sessions SET
      status       = 'expired',
      ended_at     = now(),
      ended_reason = 'expired'
    WHERE status     = 'active'
      AND expires_at < now()
    RETURNING id
  )
  SELECT COUNT(*) INTO v_expired_sessions FROM updated;

  IF v_expired_voice > 0 OR v_deleted_presence > 0 OR v_expired_sessions > 0 THEN
    RAISE LOG
      'expire_stale_sessions: closed % voice sessions, removed % presence rows, expired % live sessions',
      v_expired_voice, v_deleted_presence, v_expired_sessions;
  END IF;
END;
$$;

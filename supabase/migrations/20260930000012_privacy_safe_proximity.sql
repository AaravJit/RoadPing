-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 012: Privacy-safe proximity (Phase 2)
--
-- Design, threat model and rollout: docs/PHASE2_PROXIMITY_PRIVACY.md
-- Rollback: supabase/rollback/20260930000012_privacy_safe_proximity.down.sql
--
-- 1. public.distance_band: the only proximity value a client may receive
-- 2. Server-side spatial quantization: both positions are snapped to a
--    ~250 m latitude-adaptive grid before any disclosed distance is computed
-- 3. private.nearby_pair_band(caller, target): the single definition of
--    "target is nearby for caller", used by get_nearby_drivers_v3 AND the
--    open-channel speaking-state policy
-- 4. private.proximity_band_holds: a per (caller, target live session) band
--    that is held for 30 s, so polling, refetching or restarting cannot
--    sample a fresh band more often than that
-- 5. get_nearby_drivers_v3(p_caller_id): no range, no coordinates, no
--    numeric distance, no target session id; band-then-name ordering
-- 6. private.can_view_open_voice: now the same predicate as (3)
-- 7. expire_stale_sessions also purges expired holds
-- 8. get_nearby_drivers_v2 kept (service_role only) for rollback, deprecated
--
-- Nothing here is callable by anon or authenticated except the existing
-- private.can_view_open_voice (needed by the voice_sessions policy). Every
-- function uses SET search_path = '' and schema-qualifies what it touches.
-- ─────────────────────────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Public distance bands
-- ═══════════════════════════════════════════════════════════════════════════
-- Fixed, server-defined bands (quantized metres, upper bound inclusive):
--   within_800m      d <= 800           ("Within ½ mi" / "Within 800 m")
--   800m_to_1600m    800  < d <= 1600   ("½–1 mi"      / "0.8–1.6 km")
--   1600m_to_3200m   1600 < d <= 3200   ("1–2 mi"      / "1.6–3.2 km")
--   beyond_3200m     d > 3200           ("Over 2 mi"   / "Over 3.2 km")
-- Declaration order is nearest first, so ORDER BY / comparisons use it.

DO $$
BEGIN
  IF to_regtype('public.distance_band') IS NULL THEN
    CREATE TYPE public.distance_band AS ENUM (
      'within_800m',
      '800m_to_1600m',
      '1600m_to_3200m',
      'beyond_3200m'
    );
  END IF;
END
$$;

COMMENT ON TYPE public.distance_band IS
  'Public, fixed proximity band between two live users (quantized distance, '
  'upper bound inclusive: 800 / 1600 / 3200 m). The only proximity value a '
  'client ever receives. See docs/PHASE2_PROXIMITY_PRIVACY.md.';

CREATE OR REPLACE FUNCTION private.distance_band_for(p_distance_m double precision)
RETURNS public.distance_band
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_distance_m <= 800  THEN 'within_800m'::public.distance_band
    WHEN p_distance_m <= 1600 THEN '800m_to_1600m'::public.distance_band
    WHEN p_distance_m <= 3200 THEN '1600m_to_3200m'::public.distance_band
    ELSE                           'beyond_3200m'::public.distance_band
  END
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Spatial quantization and fixed range steps
-- ═══════════════════════════════════════════════════════════════════════════

-- Nominal cell edge in metres.
CREATE OR REPLACE FUNCTION private.proximity_cell_m()
RETURNS double precision
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$ SELECT 250::double precision $$;

-- A snapped point is at most ~0.71 cell from the raw point, so a quantized
-- distance differs from the exact one by less than 1.42 cells. Two cells is a
-- safe index prefilter margin; it only affects which rows are considered.
CREATE OR REPLACE FUNCTION private.proximity_prefilter_margin_m()
RETURNS double precision
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$ SELECT 2 * private.proximity_cell_m() $$;

-- Latitude-adaptive grid. Rows are a fixed cell_m of latitude. Each row is
-- split into a whole number of columns sized so a column is about cell_m wide
-- at that row's latitude, so cells stay roughly square from the equator to
-- high latitudes (a plain longitude-degree grid would be ~250 m wide at the
-- equator and ~125 m at 60°N) and the columns wrap exactly at ±180°. Returns
-- the centre of the cell containing p. Never returned to any client.
CREATE OR REPLACE FUNCTION private.snap_to_proximity_grid(p extensions.geography)
RETURNS extensions.geography
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
DECLARE
  -- Mean length of one degree of latitude (spherical Earth, R = 6371.0088 km).
  c_m_per_deg constant double precision := 111195.08;
  v_cell  double precision := private.proximity_cell_m();
  v_dlat  double precision := v_cell / c_m_per_deg;
  v_lat   double precision := extensions.ST_Y(p::extensions.geometry);
  v_lng   double precision := extensions.ST_X(p::extensions.geometry);
  v_row   double precision;
  v_lat_c double precision;
  v_ncols double precision;
  v_dlon  double precision;
  v_col   double precision;
  v_lng_c double precision;
BEGIN
  v_row   := floor((v_lat + 90) / v_dlat);
  v_lat_c := LEAST(GREATEST(-90 + (v_row + 0.5) * v_dlat, -90), 90);
  -- cos() floored at 0.01 (latitudes beyond ~89.4°): cells there become
  -- narrower than cell_m, never wider.
  v_ncols := GREATEST(
    floor(360 * c_m_per_deg * GREATEST(cos(radians(v_lat_c)), 0.01) / v_cell),
    1
  );
  v_dlon  := 360 / v_ncols;
  v_col   := floor((v_lng + 180) / v_dlon);
  IF v_col >= v_ncols THEN
    v_col := v_ncols - 1;  -- lng = +180 exactly
  END IF;
  v_lng_c := -180 + (v_col + 0.5) * v_dlon;

  RETURN extensions.ST_SetSRID(
    extensions.ST_MakePoint(v_lng_c, v_lat_c), 4326
  )::extensions.geography;
END;
$$;

-- Geodesic distance between the two snapped points (metres, spheroid).
CREATE OR REPLACE FUNCTION private.quantized_distance_m(
  a extensions.geography,
  b extensions.geography
)
RETURNS double precision
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
  SELECT extensions.ST_Distance(
    private.snap_to_proximity_grid(a),
    private.snap_to_proximity_grid(b)
  )
$$;

-- Largest fixed step <= p (the smallest step below it). Same steps as
-- RANGE_STEPS_M in supabase/functions/_shared/validate.ts; every app preset
-- is a step. A stored range that is not a step therefore buys no extra
-- boundary resolution.
CREATE OR REPLACE FUNCTION private.range_step_m(p integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT max(s)
     FROM unnest(ARRAY[100, 250, 400, 500, 800, 1000, 1600, 2000, 3000, 3200, 4800, 5000]) AS s
     WHERE s <= p),
    100
  )
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. The single nearby predicate
-- ═══════════════════════════════════════════════════════════════════════════
-- Returns the fresh (unheld) band when p_target is visible to p_caller, else
-- NULL. Visible means, evaluated now:
--   • caller: live session active and unexpired, presence unexpired, not banned
--   • target: same, and not banned or shadow-banned, and not the caller
--   • no block in either direction
--   • quantized distance <= the smaller of both stepped broadcast ranges
-- Both get_nearby_drivers_v3 and the open-channel voice policy use this, so
-- speaking state is never visible for someone the nearby list would omit.
-- Not SECURITY DEFINER and not client-executable: it is only reached through
-- SECURITY DEFINER callers owned by the migration role.

CREATE OR REPLACE FUNCTION private.nearby_pair_band(p_caller uuid, p_target uuid)
RETURNS public.distance_band
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT private.distance_band_for(q.distance_m)
  FROM public.location_presence me
  JOIN public.live_sessions ms
    ON  ms.id         = me.session_id
    AND ms.user_id    = me.user_id
    AND ms.status     = 'active'
    AND ms.expires_at > now()
  JOIN public.profiles mp
    ON  mp.id        = me.user_id
    AND mp.is_banned = false
  JOIN public.location_presence them
    ON  them.user_id    = p_target
    AND them.expires_at > now()
  JOIN public.live_sessions ts
    ON  ts.id         = them.session_id
    AND ts.user_id    = them.user_id
    AND ts.status     = 'active'
    AND ts.expires_at > now()
  JOIN public.profiles tp
    ON  tp.id               = p_target
    AND tp.is_banned        = false
    AND tp.is_shadow_banned = false
  CROSS JOIN LATERAL (
    SELECT
      private.quantized_distance_m(me.location, them.location) AS distance_m,
      LEAST(private.range_step_m(ms.range_m), private.range_step_m(ts.range_m)) AS range_m
  ) q
  WHERE me.user_id    = p_caller
    AND me.expires_at > now()
    AND p_target     <> p_caller
    AND q.distance_m <= q.range_m
    AND NOT EXISTS (
      SELECT 1
      FROM public.blocks b
      WHERE (b.blocker_id = p_caller AND b.blocked_id = p_target)
         OR (b.blocker_id = p_target AND b.blocked_id = p_caller)
    )
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Temporal stabilization: held bands
-- ═══════════════════════════════════════════════════════════════════════════
-- One row per (caller, target live session). Holds only the public band and
-- when the hold ends: no coordinates, no distance, no profile state. Keyed on
-- the caller's USER (so restarting the app / session keeps the hold) and the
-- target's SESSION (so a new target session never inherits an old band).
-- Visibility is never read from here; it is re-evaluated on every request.

CREATE OR REPLACE FUNCTION private.proximity_band_hold()
RETURNS interval
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$ SELECT INTERVAL '30 seconds' $$;

CREATE TABLE IF NOT EXISTS private.proximity_band_holds (
  caller_id         uuid                 NOT NULL REFERENCES public.profiles(id)      ON DELETE CASCADE,
  target_session_id uuid                 NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  band              public.distance_band NOT NULL,
  held_until        timestamptz          NOT NULL,
  PRIMARY KEY (caller_id, target_session_id)
);

CREATE INDEX IF NOT EXISTS proximity_band_holds_held_until_idx
  ON private.proximity_band_holds (held_until);
CREATE INDEX IF NOT EXISTS proximity_band_holds_target_session_idx
  ON private.proximity_band_holds (target_session_id);

ALTER TABLE private.proximity_band_holds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.proximity_band_holds FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE private.proximity_band_holds IS
  'Server-side 30 s hold of the public distance band per (caller, target live '
  'session). No client access. Purged by expire_stale_sessions().';


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. get_nearby_drivers_v3
-- ═══════════════════════════════════════════════════════════════════════════
-- The caller's position AND range come only from their stored live session;
-- there is no range parameter to probe with. Output has no coordinate, no
-- numeric distance, no bearing and no target session id. Ordered by band,
-- then name, then id, so position within a band says nothing about distance.
-- Calls for one caller are serialized (transaction advisory lock), so
-- concurrent requests see and extend the same hold rows.

CREATE OR REPLACE FUNCTION public.get_nearby_drivers_v3(p_caller_id uuid)
RETURNS TABLE (
  user_id       uuid,
  handle        text,
  display_name  text,
  avatar_url    text,
  vehicle_type  public.vehicle_type,
  vehicle_label text,
  vehicle_color text,
  vehicle_make  text,
  vehicle_model text,
  distance_band public.distance_band,
  is_speaking   boolean,
  dnd           boolean
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_me_location extensions.geography;
  v_me_range    integer;
  v_max_band    public.distance_band;
BEGIN
  IF p_caller_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('roadping.nearby.' || p_caller_id::text, 0));

  SELECT lp.location, private.range_step_m(ls.range_m)
    INTO v_me_location, v_me_range
  FROM public.location_presence lp
  JOIN public.live_sessions ls
    ON  ls.id         = lp.session_id
    AND ls.user_id    = lp.user_id
    AND ls.status     = 'active'
    AND ls.expires_at > now()
  JOIN public.profiles p
    ON  p.id        = lp.user_id
    AND p.is_banned = false
  WHERE lp.user_id    = p_caller_id
    AND lp.expires_at > now();

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- A held band wider than the caller's own range (possible only after the
  -- caller restarted with a smaller range) is replaced by a fresh one.
  v_max_band := private.distance_band_for(v_me_range);

  RETURN QUERY
  WITH candidates AS (
    -- Index-assisted superset; nearby_pair_band decides.
    SELECT
      lp.user_id    AS target_id,
      lp.session_id AS target_session_id,
      private.nearby_pair_band(p_caller_id, lp.user_id) AS fresh_band
    FROM public.location_presence lp
    WHERE lp.user_id   <> p_caller_id
      AND lp.expires_at > now()
      AND extensions.ST_DWithin(
            lp.location, v_me_location,
            v_me_range + private.proximity_prefilter_margin_m()
          )
  ),
  held AS (
    INSERT INTO private.proximity_band_holds AS h
      (caller_id, target_session_id, band, held_until)
    SELECT p_caller_id, c.target_session_id, c.fresh_band,
           now() + private.proximity_band_hold()
    FROM candidates c
    WHERE c.fresh_band IS NOT NULL
    ORDER BY c.target_session_id
    ON CONFLICT (caller_id, target_session_id) DO UPDATE SET
      band       = CASE WHEN h.held_until > now() AND h.band <= v_max_band
                        THEN h.band       ELSE EXCLUDED.band       END,
      held_until = CASE WHEN h.held_until > now() AND h.band <= v_max_band
                        THEN h.held_until ELSE EXCLUDED.held_until END
    RETURNING h.target_session_id, h.band
  )
  SELECT
    p.id,
    p.handle,
    p.display_name,
    p.avatar_url,
    v.vehicle_type,
    v.label,
    v.color,
    v.make,
    v.model,
    held.band,
    EXISTS (
      SELECT 1
      FROM   public.voice_sessions vs
      WHERE  vs.live_session_id = ls.id
        AND  vs.room_id         IS NULL
        AND  vs.is_speaking     = true
        AND  vs.ended_at        IS NULL
        AND  (vs.expires_at     IS NULL OR vs.expires_at > now())
    ),
    p.dnd_mode
  FROM held
  JOIN candidates c
    ON  c.target_session_id = held.target_session_id
  JOIN public.profiles p
    ON  p.id = c.target_id
  JOIN public.live_sessions ls
    ON  ls.id = c.target_session_id
  LEFT JOIN public.vehicles v
    ON  v.id = ls.vehicle_id
  ORDER BY held.band, lower(p.display_name), p.id
  LIMIT 100;
END;
$$;

COMMENT ON FUNCTION public.get_nearby_drivers_v3(uuid) IS
  'Phase 2 nearby list: caller position and range from the stored live session, '
  'mutual stepped range on a ~250 m quantized grid, blocks both ways, banned and '
  'shadow-banned excluded. Returns a public distance_band held 30 s per '
  '(caller, target session); never coordinates, numeric distance, bearing or '
  'session ids. Service role only.';

COMMENT ON FUNCTION public.get_nearby_drivers_v2(uuid, integer) IS
  'DEPRECATED by get_nearby_drivers_v3 (returns 50 m-rounded distance and takes a '
  'caller range). Kept, service role only, for rollback of migration 012 and for '
  'an un-redeployed get-nearby-drivers function. Drop in a later migration.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Open-channel speaking state follows the same predicate
-- ═══════════════════════════════════════════════════════════════════════════
-- Same signature, owner and grants as migration 010 (authenticated keeps
-- EXECUTE for policy evaluation; private is not an exposed schema).

CREATE OR REPLACE FUNCTION private.can_view_open_voice(p_speaker uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
     AND private.nearby_pair_band(auth.uid(), p_speaker) IS NOT NULL
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Cleanup job: also purge expired holds
-- ═══════════════════════════════════════════════════════════════════════════
-- Body identical to migration 010 plus Step 5.

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

  -- Step 5: Expired distance-band holds (a live hold is at most 30 s old)
  DELETE FROM private.proximity_band_holds
  WHERE held_until < now();

  IF v_expired_voice > 0 OR v_deleted_presence > 0 OR v_expired_sessions > 0 OR v_purged_voice > 0 THEN
    RAISE LOG
      'expire_stale_sessions: closed % voice sessions, removed % presence rows, expired % live sessions, purged % voice rows',
      v_expired_voice, v_deleted_presence, v_expired_sessions, v_purged_voice;
  END IF;
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 8. EXECUTE privileges
-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 010's default privileges already keep new functions from being
-- client-executable; these are explicit so the intent survives a replay on a
-- database with different defaults.

REVOKE ALL ON FUNCTION public.get_nearby_drivers_v3(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_nearby_drivers_v3(uuid) TO service_role;

REVOKE ALL ON FUNCTION private.distance_band_for(double precision)                            FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.proximity_cell_m()                                             FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.proximity_prefilter_margin_m()                                 FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.snap_to_proximity_grid(extensions.geography)                   FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.quantized_distance_m(extensions.geography, extensions.geography) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.range_step_m(integer)                                          FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.nearby_pair_band(uuid, uuid)                                   FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.proximity_band_hold()                                          FROM PUBLIC, anon, authenticated, service_role;

-- Unchanged from 010, restated: the policy helper stays executable by
-- authenticated (policy evaluation and Realtime), never by anon.
REVOKE ALL ON FUNCTION private.can_view_open_voice(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_view_open_voice(uuid) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK for migration 20260930000012_privacy_safe_proximity.sql
--
-- Not a migration: run by hand (SQL editor or psql) only to recover from an
-- outage, and redeploy the previous get-nearby-drivers Edge Function FIRST
-- (the Phase 2 function calls get_nearby_drivers_v3, which this drops).
-- Afterwards, delete the 012 row from supabase_migrations.schema_migrations if
-- the CLI should re-apply it later.
--
-- Returns exactly to the post-011 state. It does NOT touch anything Phase 1
-- locked down: get_nearby_drivers_v2 stays service_role only, location tables
-- keep their revoked grants, default privileges are unchanged. Restoring the
-- 010 bodies of can_view_open_voice and expire_stale_sessions keeps their
-- owner, search_path and grants.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── Open-channel speaking state: migration 010 body (exact distance) ───────
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

-- ── Cleanup job: migration 010 body (no hold purge) ────────────────────────
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

-- ── v2 comment back to its 010 text (grants untouched: service_role only) ──
COMMENT ON FUNCTION public.get_nearby_drivers_v2(uuid, integer) IS
  'Safe driver cards around the caller''s stored, unexpired presence. Mutual range, '
  'excludes self, banned, shadow-banned and blocks in either direction. Distance '
  'rounded to 50 m. Service role only.';

-- ── New objects ─────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_nearby_drivers_v3(uuid);
DROP TABLE    IF EXISTS private.proximity_band_holds;
DROP FUNCTION IF EXISTS private.nearby_pair_band(uuid, uuid);
DROP FUNCTION IF EXISTS private.quantized_distance_m(extensions.geography, extensions.geography);
DROP FUNCTION IF EXISTS private.snap_to_proximity_grid(extensions.geography);
DROP FUNCTION IF EXISTS private.proximity_prefilter_margin_m();
DROP FUNCTION IF EXISTS private.proximity_cell_m();
DROP FUNCTION IF EXISTS private.range_step_m(integer);
DROP FUNCTION IF EXISTS private.proximity_band_hold();
DROP FUNCTION IF EXISTS private.distance_band_for(double precision);
DROP TYPE     IF EXISTS public.distance_band;

COMMIT;

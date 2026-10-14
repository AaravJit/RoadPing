-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK for migration 20261001000013_voice_transmissions.sql
--
-- Not a migration: run by hand (SQL editor or psql) only to recover from an
-- outage. FIRST redeploy the previous voice Edge Functions (or leave the new
-- voice-* / ptt-token functions undeployed): they call the RPCs this drops.
-- Afterwards, delete the 013 row from supabase_migrations.schema_migrations if
-- the CLI should re-apply it later.
--
-- Returns exactly to the post-012 state: end_live_session gets its 005 body
-- and expire_stale_sessions its 012 body, both keeping owner and grants.
-- Dropping the private tables discards transient voice state only (open
-- transmissions, PTT tokens, voice contexts); no user data lives there.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── end_live_session: migration 005 body ───────────────────────────────────
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

-- ── expire_stale_sessions: migration 012 body ──────────────────────────────
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

COMMENT ON COLUMN public.profiles.dnd_mode IS
  'Do Not Disturb. User still appears on radar but is_speaking flag is suppressed.';

DROP FUNCTION IF EXISTS public.voice_set_context(uuid, uuid);
DROP FUNCTION IF EXISTS public.voice_begin_transmission(uuid, uuid);
DROP FUNCTION IF EXISTS public.voice_confirm_transmission(uuid, uuid);
DROP FUNCTION IF EXISTS public.voice_end_transmission(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.voice_listener_grant(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.voice_fanout_targets(uuid);
DROP FUNCTION IF EXISTS public.register_ptt_token(uuid, uuid, uuid, text, text);
DROP FUNCTION IF EXISTS public.unregister_ptt_token(uuid, uuid);
DROP FUNCTION IF EXISTS public.drop_ptt_token(text);
DROP FUNCTION IF EXISTS public.voice_block_kicks(uuid, uuid);
DROP FUNCTION IF EXISTS private.voice_end_where(uuid, uuid, uuid, text);
DROP FUNCTION IF EXISTS private.active_live_session(uuid);
DROP FUNCTION IF EXISTS private.voice_listener_uid(uuid, uuid);
DROP FUNCTION IF EXISTS private.voice_can_listen(uuid, uuid);

DROP TABLE IF EXISTS private.ptt_push_tokens;
DROP TABLE IF EXISTS private.voice_transmissions;
DROP TABLE IF EXISTS private.voice_contexts;

DROP FUNCTION IF EXISTS private.voice_hard_end();

REVOKE EXECUTE ON FUNCTION public.end_live_session(uuid, uuid, public.session_ended_reason) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_stale_sessions()                                  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.end_live_session(uuid, uuid, public.session_ended_reason) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_stale_sessions()                                  TO service_role;

COMMIT;

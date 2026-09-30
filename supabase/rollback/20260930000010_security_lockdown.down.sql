-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK for migration 20260930000010_security_lockdown.sql
--
-- Not a migration: run by hand (SQL editor or psql) only to recover from an
-- outage, then redeploy the previous Edge Functions. This restores the
-- pre-010 state exactly, including every hole 010 closed
-- (see docs/SECURITY_LOCKDOWN.md). Afterwards, delete the 010 row from
-- supabase_migrations.schema_migrations if the CLI should re-apply it later.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── Function privileges back to Postgres/Supabase defaults ──────────────────
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA extensions REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.handle_new_user()                                  TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_room()                                  TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_blocked(uuid, uuid)                             TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_room_member(uuid, uuid)                         TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_room_owner(uuid, uuid)                          TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_user_inside_private_zone(uuid, extensions.geography) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_private_zone(uuid, double precision, double precision)             TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_location_presence(uuid, uuid, double precision, double precision) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_location_heartbeat(uuid, uuid, double precision, double precision) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.end_live_session(uuid, uuid, public.session_ended_reason)                TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_sessions()                                                  TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_nearby_drivers(double precision, double precision, double precision, uuid) TO PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.get_nearby_drivers(double precision, double precision, double precision, uuid) IS
  'Returns safe driver cards within p_range_m metres of (p_lat, p_lng). '
  'Excludes self, banned, shadow-banned, mutual blocks. '
  'Distance rounded to nearest 50 m. NEVER returns raw coordinates.';

-- ── Room policies back to the public helpers ────────────────────────────────
ALTER POLICY "rooms: public visible to all; private to members only"
  ON public.rooms
  USING (NOT is_private OR is_room_member(id, auth.uid()));

ALTER POLICY "room_members: members can see fellow members"
  ON public.room_members
  USING (is_room_member(room_id, auth.uid()));

ALTER POLICY "room_members: owner can add any user to their room"
  ON public.room_members
  WITH CHECK (is_room_owner(room_id, auth.uid()));

ALTER POLICY "room_members: owner manages moderator status"
  ON public.room_members
  USING      (is_room_owner(room_id, auth.uid()))
  WITH CHECK (is_room_owner(room_id, auth.uid()));

ALTER POLICY "room_members: user leaves; owner kicks"
  ON public.room_members
  USING (auth.uid() = user_id OR is_room_owner(room_id, auth.uid()));

-- ── voice_sessions SELECT policy (world-readable open channel) ───────────────
DROP POLICY IF EXISTS "voice_sessions: own, room members, nearby open-channel" ON public.voice_sessions;

CREATE POLICY "voice_sessions: user reads own + room members + open-channel"
  ON public.voice_sessions
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR (room_id IS NOT NULL AND is_room_member(room_id, auth.uid()))
    OR room_id IS NULL
  );

-- ── Direct client write policies + table grants ─────────────────────────────
GRANT ALL ON public.live_sessions, public.location_presence, public.voice_sessions TO anon, authenticated;

CREATE POLICY "live_sessions: user starts own session"
  ON public.live_sessions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND status = 'active' AND ended_at IS NULL);

CREATE POLICY "live_sessions: user heartbeats and ends own session"
  ON public.live_sessions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "location_presence: user inserts own presence"
  ON public.location_presence FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.live_sessions
      WHERE id = session_id AND user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "location_presence: user updates own presence (heartbeat)"
  ON public.location_presence FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "location_presence: user deletes own presence on stop"
  ON public.location_presence FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "voice_sessions: user creates own"
  ON public.voice_sessions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "voice_sessions: user updates own (toggle speaking)"
  ON public.voice_sessions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "voice_sessions: user can end own"
  ON public.voice_sessions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ── Function bodies from migration 005 ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.upsert_location_presence(
  p_user_id uuid, p_session_id uuid, p_lat double precision, p_lng double precision
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expires_at timestamptz := now() + INTERVAL '25 seconds';
BEGIN
  INSERT INTO public.location_presence (user_id, session_id, location, expires_at)
  VALUES (
    p_user_id, p_session_id,
    extensions.ST_SetSRID(extensions.ST_MakePoint(p_lng, p_lat), 4326)::extensions.geography,
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

CREATE OR REPLACE FUNCTION public.update_location_heartbeat(
  p_user_id uuid, p_session_id uuid, p_lat double precision, p_lng double precision
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expires_at timestamptz := now() + INTERVAL '25 seconds';
BEGIN
  UPDATE public.location_presence SET
    location   = extensions.ST_SetSRID(extensions.ST_MakePoint(p_lng, p_lat), 4326)::extensions.geography,
    updated_at = now(),
    expires_at = v_expires_at
  WHERE user_id = p_user_id AND session_id = p_session_id;

  UPDATE public.live_sessions SET
    last_heartbeat_at = now(),
    expires_at        = v_expires_at
  WHERE id = p_session_id AND user_id = p_user_id AND status = 'active';

  RETURN v_expires_at;
END;
$$;

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
  WITH updated AS (
    UPDATE public.voice_sessions SET is_speaking = false, ended_at = now()
    WHERE is_speaking = true AND ended_at IS NULL
      AND expires_at IS NOT NULL AND expires_at < now()
    RETURNING id
  )
  SELECT COUNT(*) INTO v_expired_voice FROM updated;

  WITH deleted AS (
    DELETE FROM public.location_presence WHERE expires_at < now() RETURNING user_id
  )
  SELECT COUNT(*) INTO v_deleted_presence FROM deleted;

  WITH updated AS (
    UPDATE public.live_sessions SET status = 'expired', ended_at = now(), ended_reason = 'expired'
    WHERE status = 'active' AND expires_at < now()
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

-- Restoring a function body keeps existing grants, but be explicit.
GRANT EXECUTE ON FUNCTION public.upsert_location_presence(uuid, uuid, double precision, double precision) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_location_heartbeat(uuid, uuid, double precision, double precision) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_sessions()                                                  TO PUBLIC, anon, authenticated;

-- ── New objects ─────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_nearby_drivers_v2(uuid, integer);
DROP FUNCTION IF EXISTS public.consume_rate_limit(uuid, text, integer, integer);
DROP SCHEMA IF EXISTS private CASCADE;

ALTER TABLE public.location_presence
  DROP COLUMN IF EXISTS location_accepted_at,
  DROP COLUMN IF EXISTS pending_location,
  DROP COLUMN IF EXISTS pending_count,
  DROP COLUMN IF EXISTS pending_since;

COMMIT;

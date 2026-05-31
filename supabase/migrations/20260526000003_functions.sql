-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 003: Helper functions and triggers
-- All sensitive functions use SECURITY DEFINER + SET search_path = public
-- to prevent search-path injection attacks.
-- ─────────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. set_updated_at()
-- Generic trigger function — auto-sets updated_at to now() on every UPDATE.
-- Applied to all tables that have an updated_at column.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ── Attach to all tables with updated_at ──────────────────────────────────

CREATE OR REPLACE TRIGGER tr_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER tr_vehicles_updated_at
  BEFORE UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER tr_private_zones_updated_at
  BEFORE UPDATE ON public.private_zones
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER tr_reports_updated_at
  BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER tr_rooms_updated_at
  BEFORE UPDATE ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER tr_location_presence_updated_at
  BEFORE UPDATE ON public.location_presence
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER tr_push_tokens_updated_at
  BEFORE UPDATE ON public.push_tokens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. handle_new_user()
-- Auto-creates a profile row when a new auth.users row is inserted.
-- Sources display_name from OAuth metadata or falls back to email prefix.
-- SECURITY DEFINER: runs as the function owner so it can write to profiles
-- even before the user's JWT exists.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    -- Priority: OAuth display_name → OAuth full_name → email prefix → fallback
    LEFT(
      COALESCE(
        NULLIF(TRIM(NEW.raw_user_meta_data ->> 'display_name'), ''),
        NULLIF(TRIM(NEW.raw_user_meta_data ->> 'full_name'),    ''),
        NULLIF(TRIM(split_part(COALESCE(NEW.email, ''), '@', 1)), ''),
        'driver'
      ),
      40  -- truncate to satisfy CHECK constraint
    ),
    NULLIF(TRIM(NEW.raw_user_meta_data ->> 'avatar_url'), '')
  )
  ON CONFLICT (id) DO NOTHING;  -- idempotent; ignore if profile already exists
  RETURN NEW;
END;
$$;

-- Fire after every new signup / OAuth login
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. handle_new_room()
-- Auto-adds the room's owner as the first member with moderator status.
-- Without this, the owner would not appear in room_members and the
-- is_room_member() / is_room_owner() helpers would diverge.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_new_room()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.room_members (room_id, user_id, is_moderator)
  VALUES (NEW.id, NEW.owner_id, true)
  ON CONFLICT (room_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_room_created
  AFTER INSERT ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_room();


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. is_blocked(a uuid, b uuid) → boolean
-- Returns TRUE if EITHER direction of a block exists between the two users.
-- Used in RLS policies and the get_nearby_drivers RPC to enforce mutual
-- invisibility without exposing the blocks table to clients.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_blocked(a uuid, b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.blocks
    WHERE (blocker_id = a AND blocked_id = b)
       OR (blocker_id = b AND blocked_id = a)
  );
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. is_room_member(p_room uuid, p_user uuid) → boolean
-- Returns TRUE if p_user is in room_members for p_room.
-- Used in RLS policies to gate room and room_members SELECT.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_room_member(p_room uuid, p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.room_members
    WHERE room_id = p_room
      AND user_id = p_user
  );
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 6. is_room_owner(p_room uuid, p_user uuid) → boolean
-- Returns TRUE if p_user is the owner of p_room.
-- Separate from is_room_member for explicit moderator-management policies.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_room_owner(p_room uuid, p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.rooms
    WHERE id       = p_room
      AND owner_id = p_user
  );
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 7. is_user_inside_private_zone(p_user uuid, p_point extensions.geography) → boolean
-- Returns TRUE if the geography point falls inside any private zone owned
-- by p_user. Called server-side before starting a live session.
-- Uses PostGIS ST_DWithin with the GIST index for O(log n) performance.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_user_inside_private_zone(
  p_user  uuid,
  p_point extensions.geography
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.private_zones
    WHERE owner_id = p_user
      -- ST_DWithin uses the GIST index on center — efficient
      AND extensions.ST_DWithin(center, p_point, radius_m)
  );
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 8. expire_stale_sessions() → void
-- Safety-net cleanup called by the pg_cron job every minute.
-- Step 1: delete location_presence rows whose expires_at has passed.
-- Step 2: mark live_sessions as 'expired' whose expires_at has passed.
-- Note: CASCADE on location_presence.session_id would handle step 1 too,
-- but explicit deletion is faster and more predictable in logs.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.expire_stale_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_presence  int;
  v_expired_sessions  int;
BEGIN
  -- Step 1: Remove stale location presence rows
  WITH deleted AS (
    DELETE FROM public.location_presence
    WHERE expires_at < now()
    RETURNING user_id
  )
  SELECT COUNT(*) INTO v_deleted_presence FROM deleted;

  -- Step 2: Mark stale active sessions as expired
  WITH updated AS (
    UPDATE public.live_sessions
    SET
      status       = 'expired',
      ended_at     = now(),
      ended_reason = 'expired'
    WHERE
      status     = 'active'
      AND expires_at < now()
    RETURNING id
  )
  SELECT COUNT(*) INTO v_expired_sessions FROM updated;

  -- Log for visibility (shows in Supabase Database logs)
  IF v_deleted_presence > 0 OR v_expired_sessions > 0 THEN
    RAISE LOG 'expire_stale_sessions: removed % presence rows, expired % sessions',
      v_deleted_presence, v_expired_sessions;
  END IF;
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 9. get_nearby_drivers(radius_m float) → SETOF NearbyDriverCard
-- ⚠️  STUB — Phase 4 will implement the full PostGIS proximity query.
--
-- Final column signature (do not change between phases):
--   user_id                uuid       -- profile id
--   display_name           text
--   avatar_url             text
--   vehicle_type           vehicle_type
--   vehicle_label          text
--   vehicle_color          text
--   approximate_distance_m float      -- rounded to nearest 50 m for privacy
--   is_speaking            boolean
--   session_id             uuid
--
-- Phase 4 implementation contract:
--   1. Read caller's location from location_presence (bypasses RLS — SECURITY DEFINER)
--   2. extensions.ST_DWithin(location, caller_location, radius_m) — uses GIST index
--   3. Exclude: self, is_blocked(), is_banned, is_shadow_banned
--   4. Round distance: ROUND(raw_m / 50) * 50 — never expose exact coordinates
--   5. NEVER return raw lat/lng in any column
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_nearby_drivers(
  radius_m float DEFAULT 5000
)
RETURNS TABLE (
  user_id                uuid,
  display_name           text,
  avatar_url             text,
  vehicle_type           public.vehicle_type,
  vehicle_label          text,
  vehicle_color          text,
  approximate_distance_m float,
  is_speaking            boolean,
  session_id             uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Phase 4 stub: returns empty result set.
  -- The function signature and SECURITY DEFINER are final.
  -- Phase 4 will replace the body with the full PostGIS query.
  RETURN;
END;
$$;

COMMENT ON FUNCTION public.get_nearby_drivers(float) IS
  'Returns safe driver cards within radius_m. NEVER returns raw coordinates. Phase 4 stub.';

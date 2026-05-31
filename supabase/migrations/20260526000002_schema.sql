-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 002: Enum types + all tables + indexes
-- RoadPing — Supabase Postgres + PostGIS schema
--
-- Privacy rules baked into the schema:
--   • location_presence.location (geography) is NEVER in any SELECT RLS policy
--   • private_zones.center / radius_m are only accessible to the owner
--   • All proximity queries go through the get_nearby_drivers() SECURITY DEFINER RPC
--   • Raw lat/lng is never returned to any client
-- ─────────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
-- ENUM TYPES
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TYPE public.session_status AS ENUM (
  'active',
  'ended',
  'expired'
);

-- Reason a live session was terminated; helps analytics + anti-abuse.
CREATE TYPE public.session_ended_reason AS ENUM (
  'user_stopped',    -- user tapped Stop
  'expired',         -- heartbeat timeout
  'entered_zone',    -- user drove into their own private zone
  'banned',          -- account banned mid-session
  'app_background',  -- OS killed the app
  'logout'           -- user signed out
);

-- Coarse vehicle category (used for map icons / filtering)
CREATE TYPE public.vehicle_type AS ENUM (
  'car',
  'motorcycle',
  'truck',
  'van',
  'bicycle',
  'other'
);

-- Fine-grained body style (used for detailed profile cards)
CREATE TYPE public.body_type AS ENUM (
  'sedan',
  'coupe',
  'hatchback',
  'wagon',
  'suv',
  'pickup',
  'van',
  'crossover',
  'sports_car',   -- maps to TypeScript 'sportsCar' — use toSnakeCase when bridging
  'supercar',
  'motorcycle'
);

CREATE TYPE public.report_reason AS ENUM (
  'harassment',
  'inappropriate_content',
  'spam',
  'impersonation',
  'dangerous_driving',
  'other'
);

-- Where in the app the report was filed
CREATE TYPE public.report_context AS ENUM (
  'map',      -- nearby driver radar
  'room',     -- drive room
  'voice',    -- voice session
  'profile'   -- profile screen
);

-- Moderation workflow state
CREATE TYPE public.report_status AS ENUM (
  'open',
  'reviewing',
  'actioned',
  'dismissed'
);

CREATE TYPE public.platform_type AS ENUM (
  'ios',
  'android'
);

CREATE TYPE public.moderation_action_type AS ENUM (
  'warn',
  'shadow_ban',
  'ban',
  'dismiss'
);


-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE: profiles
-- One row per auth.users entry. Created automatically by handle_new_user().
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.profiles (
  id               uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name     text        NOT NULL
                               CHECK (char_length(display_name) BETWEEN 1 AND 40),
  avatar_url       text,
  bio              text        CHECK (bio IS NULL OR char_length(bio) <= 160),
  -- Bans are set by moderators only (service role). Clients cannot change these.
  is_banned        boolean     NOT NULL DEFAULT false,
  is_shadow_banned boolean     NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profiles IS
  'One row per authenticated user. Mirrors auth.users(id). Auto-created by trigger.';
COMMENT ON COLUMN public.profiles.is_shadow_banned IS
  'Shadow-banned users appear normally to themselves but are excluded from all nearby queries.';


-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE: vehicles
-- One or more vehicles per user. Only one is_active = true at a time.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.vehicles (
  id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid         NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  label        text         NOT NULL CHECK (char_length(label) BETWEEN 1 AND 50),
  vehicle_type public.vehicle_type NOT NULL,
  body_type    public.body_type,
  make         text         CHECK (make  IS NULL OR char_length(make)  <= 80),
  model        text         CHECK (model IS NULL OR char_length(model) <= 80),
  color        text         CHECK (color IS NULL OR char_length(color) <= 40),
  -- First commercially available car was 1886 (Benz Patent-Motorwagen).
  year         int          CHECK (year IS NULL OR (year >= 1886 AND year <= 2100)),
  is_active    boolean      NOT NULL DEFAULT true,
  created_at   timestamptz  NOT NULL DEFAULT now(),
  updated_at   timestamptz  NOT NULL DEFAULT now()
);

-- Enforce: one active vehicle per user at a time.
CREATE UNIQUE INDEX IF NOT EXISTS vehicles_one_active_per_user
  ON public.vehicles (user_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS vehicles_user_id_idx ON public.vehicles (user_id);

COMMENT ON TABLE public.vehicles IS
  'User-owned vehicles. Only one may have is_active = true per user.';


-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE: private_zones
-- Owner-defined geofences. When a user is inside one of their own zones they
-- are invisible to others (no live session starts / presence upserted).
-- ⚠️  center and radius_m MUST NOT be returned to any client directly.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.private_zones (
  id         uuid                   PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   uuid                   NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name       text                   NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  -- extensions.geography(Point) stores lon/lat in EPSG:4326 (WGS-84, same as GPS)
  center     extensions.geography(Point, 4326) NOT NULL,
  -- Maximum zone radius: 5 km (prevents whole-city zones)
  radius_m   float                  NOT NULL CHECK (radius_m > 0 AND radius_m <= 5000),
  created_at timestamptz            NOT NULL DEFAULT now(),
  updated_at timestamptz            NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS private_zones_owner_idx  ON public.private_zones (owner_id);
-- GIST index for ST_DWithin — critical for is_user_inside_private_zone()
CREATE INDEX IF NOT EXISTS private_zones_center_gist ON public.private_zones USING GIST (center);

COMMENT ON TABLE public.private_zones IS
  'Owner-defined no-broadcast zones (e.g. home, office). Coordinates never exposed to clients.';


-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE: live_sessions
-- One active session per user (partial unique index).
-- Heartbeat extends expires_at. Cron job calls expire_stale_sessions().
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.live_sessions (
  id                uuid                        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid                        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  vehicle_id        uuid                        REFERENCES public.vehicles(id) ON DELETE SET NULL,
  status            public.session_status       NOT NULL DEFAULT 'active',
  started_at        timestamptz                 NOT NULL DEFAULT now(),
  ended_at          timestamptz,
  last_heartbeat_at timestamptz                 NOT NULL DEFAULT now(),
  -- Heartbeat must arrive before expires_at or the session is auto-expired.
  -- Default window: 25 s (generous enough for slow networks, tight enough to drop dead sessions).
  expires_at        timestamptz                 NOT NULL DEFAULT (now() + INTERVAL '25 seconds'),
  ended_reason      public.session_ended_reason,

  -- ended_at must be set when status is ended or expired
  CONSTRAINT live_sessions_ended_consistency
    CHECK (
      (status = 'active'  AND ended_at IS NULL)
      OR (status IN ('ended', 'expired') AND ended_at IS NOT NULL)
    )
);

-- One active session per user
CREATE UNIQUE INDEX IF NOT EXISTS live_sessions_one_active_per_user
  ON public.live_sessions (user_id)
  WHERE status = 'active';

-- For the cron sweep (only needs active rows)
CREATE INDEX IF NOT EXISTS live_sessions_expires_active_idx
  ON public.live_sessions (expires_at)
  WHERE status = 'active';

COMMENT ON TABLE public.live_sessions IS
  'One active row per driving user. Expires if heartbeat stops for ~25 s.';


-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE: location_presence
-- ⚠️  HIGHEST PRIVACY SENSITIVITY TABLE IN THE DATABASE
-- One row per live user. Updated on each heartbeat.
-- The 'location' column contains raw GPS coordinates and is:
--   • NEVER in a SELECT RLS policy (clients always get zero rows)
--   • NEVER returned by any function to a client
--   • Only read by SECURITY DEFINER functions (get_nearby_drivers, etc.)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.location_presence (
  user_id    uuid                   PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_id uuid                   NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  -- ⛔ Raw GPS coordinates — only readable by SECURITY DEFINER RPCs
  location   extensions.geography(Point, 4326) NOT NULL,
  updated_at timestamptz            NOT NULL DEFAULT now(),
  expires_at timestamptz            NOT NULL DEFAULT (now() + INTERVAL '25 seconds')
);

-- ⚡ Critical for proximity queries — must exist before any get_nearby_drivers calls
CREATE INDEX IF NOT EXISTS location_presence_location_gist
  ON public.location_presence USING GIST (location);

CREATE INDEX IF NOT EXISTS location_presence_expires_idx
  ON public.location_presence (expires_at);

COMMENT ON TABLE public.location_presence IS
  '⛔ Raw GPS coordinates. NO SELECT RLS policy. Readable only by SECURITY DEFINER RPCs.';


-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE: blocks
-- Mutual block: both blocker→blocked AND blocked→blocker become invisible.
-- is_blocked(a,b) helper checks both directions.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.blocks (
  blocker_id uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT blocks_no_self_block CHECK (blocker_id != blocked_id)
);

-- Reverse-direction index for "who has blocked me?" lookups in is_blocked()
CREATE INDEX IF NOT EXISTS blocks_blocked_id_idx ON public.blocks (blocked_id);

COMMENT ON TABLE public.blocks IS
  'Mutual block relationship. Both parties become invisible to each other in all queries.';


-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE: reports
-- Silent reports — the reported user is never notified.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.reports (
  id               uuid                   PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id      uuid                   NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reported_user_id uuid                   NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason           public.report_reason   NOT NULL,
  context          public.report_context  NOT NULL,
  details          text                   CHECK (details IS NULL OR char_length(details) <= 500),
  status           public.report_status   NOT NULL DEFAULT 'open',
  created_at       timestamptz            NOT NULL DEFAULT now(),
  updated_at       timestamptz            NOT NULL DEFAULT now(),

  CONSTRAINT reports_no_self_report CHECK (reporter_id != reported_user_id)
);

CREATE INDEX IF NOT EXISTS reports_reporter_idx       ON public.reports (reporter_id);
CREATE INDEX IF NOT EXISTS reports_reported_user_idx  ON public.reports (reported_user_id);
-- Partial index for open review queue
CREATE INDEX IF NOT EXISTS reports_open_idx           ON public.reports (created_at)
  WHERE status = 'open';

COMMENT ON TABLE public.reports IS
  'Silent reports. Reported user never learns about the report. Status drives moderation workflow.';


-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE: rooms
-- Public rooms are discoverable by all authenticated users.
-- Private rooms require an invite_code (enforced by app logic; Phase 6).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.rooms (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name        text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  description text        CHECK (description IS NULL OR char_length(description) <= 300),
  is_private  boolean     NOT NULL DEFAULT false,
  invite_code text        UNIQUE
                          CHECK (invite_code IS NULL OR char_length(invite_code) BETWEEN 4 AND 32),
  max_members int         NOT NULL DEFAULT 50 CHECK (max_members BETWEEN 2 AND 200),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rooms_owner_idx     ON public.rooms (owner_id);
-- For public room browsing
CREATE INDEX IF NOT EXISTS rooms_public_idx    ON public.rooms (created_at)
  WHERE is_private = false;

COMMENT ON TABLE public.rooms IS
  'Drive rooms. Public rooms are browseable. Private rooms require an invite_code.';


-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE: room_members
-- Many-to-many rooms ↔ profiles.
-- Owner is auto-inserted as moderator by handle_new_room() trigger.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.room_members (
  room_id      uuid        NOT NULL REFERENCES public.rooms(id)    ON DELETE CASCADE,
  user_id      uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at    timestamptz NOT NULL DEFAULT now(),
  is_moderator boolean     NOT NULL DEFAULT false,
  PRIMARY KEY (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS room_members_user_idx ON public.room_members (user_id);

COMMENT ON TABLE public.room_members IS
  'Room membership. Owner is auto-added as moderator on room creation.';


-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE: voice_sessions
-- Tracks who is currently speaking. No audio is stored here or anywhere.
-- room_id = NULL  → open-channel broadcast (visible to nearby drivers)
-- room_id = uuid  → room-scoped broadcast (visible to members only)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.voice_sessions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES public.profiles(id)     ON DELETE CASCADE,
  live_session_id uuid        NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  room_id         uuid        REFERENCES public.rooms(id) ON DELETE CASCADE,
  is_speaking     boolean     NOT NULL DEFAULT false,
  started_at      timestamptz NOT NULL DEFAULT now(),
  ended_at        timestamptz
);

CREATE INDEX IF NOT EXISTS voice_sessions_user_idx ON public.voice_sessions (user_id);
CREATE INDEX IF NOT EXISTS voice_sessions_room_idx ON public.voice_sessions (room_id)
  WHERE room_id IS NOT NULL;
-- Hot index: find currently-speaking drivers (for radar live badge)
CREATE INDEX IF NOT EXISTS voice_sessions_active_speaking_idx ON public.voice_sessions (is_speaking)
  WHERE is_speaking = true AND ended_at IS NULL;

COMMENT ON TABLE public.voice_sessions IS
  'Live speaking state only. NO audio is stored. One row per push-to-talk press.';


-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE: push_tokens
-- One token per user (latest device). Upserted on each login.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.push_tokens (
  user_id    uuid                 PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  token      text                 NOT NULL CHECK (char_length(token) > 10),
  platform   public.platform_type NOT NULL,
  updated_at timestamptz          NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.push_tokens IS
  'Expo push tokens for notifications. One per user (upserted on login).';


-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE: moderation_actions
-- Append-only audit log. Zero client access — service role only.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.moderation_actions (
  id             uuid                         PRIMARY KEY DEFAULT gen_random_uuid(),
  moderator_id   uuid                         NOT NULL REFERENCES public.profiles(id),
  target_user_id uuid                         NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  report_id      uuid                         REFERENCES public.reports(id) ON DELETE SET NULL,
  action         public.moderation_action_type NOT NULL,
  reason         text                         CHECK (reason IS NULL OR char_length(reason) <= 500),
  created_at     timestamptz                  NOT NULL DEFAULT now()
  -- No updated_at — this table is append-only
);

CREATE INDEX IF NOT EXISTS moderation_target_idx ON public.moderation_actions (target_user_id);
CREATE INDEX IF NOT EXISTS moderation_report_idx ON public.moderation_actions (report_id)
  WHERE report_id IS NOT NULL;

COMMENT ON TABLE public.moderation_actions IS
  'Append-only moderation audit log. No RLS policy for any client role — service role only.';

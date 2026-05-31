-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 004: Row Level Security policies + pg_cron scheduled cleanup
--
-- Security model:
--   anon         → zero access (no policies = default deny on RLS tables)
--   authenticated → access to own data only, gated per-table below
--   service_role  → bypasses RLS (used by Edge Functions / admin tools)
--
-- Critical privacy rule:
--   location_presence has NO SELECT policy for any client role.
--   Authenticated users receive zero rows on direct SELECT.
--   Raw GPS coordinates are only accessible inside SECURITY DEFINER functions.
-- ─────────────────────────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════════════════════
-- Enable RLS on every table
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.private_zones      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_sessions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_presence  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_members       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_tokens        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_actions ENABLE ROW LEVEL SECURITY;


-- ═══════════════════════════════════════════════════════════════════════════
-- profiles
-- Own row only. Bans cannot be self-set via the profile update policy.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE POLICY "profiles: user reads own row"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Users can update display_name, avatar_url, bio only.
-- The WITH CHECK subquery prevents them from unsetting their own ban by
-- asserting that the new is_banned / is_shadow_banned must equal the
-- current stored values (which only the service role can change).
CREATE POLICY "profiles: user updates own row"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    -- Guard: new ban flags must equal existing values (no self-unban)
    AND is_banned = (
      SELECT is_banned FROM public.profiles WHERE id = auth.uid()
    )
    AND is_shadow_banned = (
      SELECT is_shadow_banned FROM public.profiles WHERE id = auth.uid()
    )
  );

-- No INSERT policy — handled by handle_new_user() SECURITY DEFINER trigger.
-- No DELETE policy — service role only.


-- ═══════════════════════════════════════════════════════════════════════════
-- vehicles — owner full CRUD
-- ═══════════════════════════════════════════════════════════════════════════

CREATE POLICY "vehicles: owner full access"
  ON public.vehicles
  FOR ALL
  TO authenticated
  USING    (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ═══════════════════════════════════════════════════════════════════════════
-- private_zones — owner full CRUD, zero cross-user visibility
-- ═══════════════════════════════════════════════════════════════════════════

CREATE POLICY "private_zones: owner full access"
  ON public.private_zones
  FOR ALL
  TO authenticated
  USING    (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);


-- ═══════════════════════════════════════════════════════════════════════════
-- live_sessions
-- Own rows only. Separate policies per command for explicit audit trail.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE POLICY "live_sessions: user reads own"
  ON public.live_sessions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Only valid new sessions: status=active, ended_at=NULL, user_id=self
CREATE POLICY "live_sessions: user starts own session"
  ON public.live_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND status   = 'active'
    AND ended_at IS NULL
  );

-- Heartbeat updates + manual session end (status → 'ended')
CREATE POLICY "live_sessions: user heartbeats and ends own session"
  ON public.live_sessions
  FOR UPDATE
  TO authenticated
  USING    (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- No DELETE — sessions are ended (status change), never deleted by clients.


-- ═══════════════════════════════════════════════════════════════════════════
-- location_presence
-- ⛔ NO SELECT POLICY — clients receive zero rows on direct SELECT.
-- Write/delete own row only. The session_id must belong to the same user
-- and be in 'active' status so a compromised client cannot spoof presence.
-- ═══════════════════════════════════════════════════════════════════════════

-- !! Intentionally NO SELECT policy for any role. Do not add one. !!

CREATE POLICY "location_presence: user inserts own presence"
  ON public.location_presence
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    -- session_id must be an active session owned by this user
    AND EXISTS (
      SELECT 1 FROM public.live_sessions
      WHERE id      = session_id
        AND user_id = auth.uid()
        AND status  = 'active'
    )
  );

CREATE POLICY "location_presence: user updates own presence (heartbeat)"
  ON public.location_presence
  FOR UPDATE
  TO authenticated
  USING    (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "location_presence: user deletes own presence on stop"
  ON public.location_presence
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);


-- ═══════════════════════════════════════════════════════════════════════════
-- blocks
-- Blocker sees and manages their own blocks. Blocked user is unaware.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE POLICY "blocks: blocker reads own"
  ON public.blocks
  FOR SELECT
  TO authenticated
  USING (auth.uid() = blocker_id);

CREATE POLICY "blocks: user can block another user"
  ON public.blocks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = blocker_id
    AND auth.uid() != blocked_id    -- cannot block yourself
  );

CREATE POLICY "blocks: blocker can unblock"
  ON public.blocks
  FOR DELETE
  TO authenticated
  USING (auth.uid() = blocker_id);


-- ═══════════════════════════════════════════════════════════════════════════
-- reports
-- Reporter sees own reports; cannot see other reporters' reports.
-- Reports are silent — reported user has zero access.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE POLICY "reports: reporter reads own"
  ON public.reports
  FOR SELECT
  TO authenticated
  USING (auth.uid() = reporter_id);

CREATE POLICY "reports: authenticated files a report"
  ON public.reports
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = reporter_id
    AND auth.uid() != reported_user_id    -- cannot report yourself
  );

-- No UPDATE / DELETE for clients.
-- Moderation team updates status via service role (Edge Functions).


-- ═══════════════════════════════════════════════════════════════════════════
-- rooms
-- Public rooms: visible to all authenticated users.
-- Private rooms: visible only to members.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE POLICY "rooms: public visible to all; private to members only"
  ON public.rooms
  FOR SELECT
  TO authenticated
  USING (
    NOT is_private
    OR is_room_member(id, auth.uid())
  );

CREATE POLICY "rooms: authenticated can create a room"
  ON public.rooms
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "rooms: owner updates room settings"
  ON public.rooms
  FOR UPDATE
  TO authenticated
  USING    (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "rooms: owner can delete room"
  ON public.rooms
  FOR DELETE
  TO authenticated
  USING (auth.uid() = owner_id);


-- ═══════════════════════════════════════════════════════════════════════════
-- room_members
-- Members can see who is in a room they belong to.
-- Two INSERT policies (OR'd by Postgres): self-join public, or owner adds.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE POLICY "room_members: members can see fellow members"
  ON public.room_members
  FOR SELECT
  TO authenticated
  USING (is_room_member(room_id, auth.uid()));

-- Self-join: user inserts their own row into a public room
CREATE POLICY "room_members: user can join a public room"
  ON public.room_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND NOT (SELECT r.is_private FROM public.rooms r WHERE r.id = room_id)
  );

-- Owner-add: room owner inserts any user into their room (private invite)
CREATE POLICY "room_members: owner can add any user to their room"
  ON public.room_members
  FOR INSERT
  TO authenticated
  WITH CHECK (is_room_owner(room_id, auth.uid()));

-- Promote/demote moderator (owner only)
CREATE POLICY "room_members: owner manages moderator status"
  ON public.room_members
  FOR UPDATE
  TO authenticated
  USING    (is_room_owner(room_id, auth.uid()))
  WITH CHECK (is_room_owner(room_id, auth.uid()));

-- Self-leave OR owner-kick
CREATE POLICY "room_members: user leaves; owner kicks"
  ON public.room_members
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR is_room_owner(room_id, auth.uid())
  );


-- ═══════════════════════════════════════════════════════════════════════════
-- voice_sessions
-- Own sessions always visible to self.
-- Room-scoped sessions visible to room members (for speaking indicators).
-- Open-channel sessions (room_id = NULL) visible to all authenticated users
-- — this enables the nearby radar live badge without a separate RPC.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE POLICY "voice_sessions: user reads own + room members + open-channel"
  ON public.voice_sessions
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id                                         -- own sessions
    OR (room_id IS NOT NULL AND is_room_member(room_id, auth.uid()))  -- room members
    OR room_id IS NULL                                           -- open-channel speaking state
  );

CREATE POLICY "voice_sessions: user creates own"
  ON public.voice_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "voice_sessions: user updates own (toggle speaking)"
  ON public.voice_sessions
  FOR UPDATE
  TO authenticated
  USING    (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "voice_sessions: user can end own"
  ON public.voice_sessions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);


-- ═══════════════════════════════════════════════════════════════════════════
-- push_tokens — owner full CRUD
-- ═══════════════════════════════════════════════════════════════════════════

CREATE POLICY "push_tokens: owner full access"
  ON public.push_tokens
  FOR ALL
  TO authenticated
  USING    (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ═══════════════════════════════════════════════════════════════════════════
-- moderation_actions — NO client policies (service role only)
-- ═══════════════════════════════════════════════════════════════════════════
-- RLS is enabled (ALTER TABLE above), but zero policies are created for
-- the 'authenticated' or 'anon' roles.
-- Default RLS behaviour = DENY all. Only service_role bypasses RLS.
-- This means:
--   SELECT * FROM moderation_actions; → 0 rows for any JWT-authenticated client


-- ═══════════════════════════════════════════════════════════════════════════
-- pg_cron: scheduled session cleanup
-- Runs expire_stale_sessions() every minute as a safety net.
-- The mobile client should explicitly end sessions on stop/logout/background.
-- If pg_cron is not yet enabled: Dashboard → Database → Extensions → pg_cron
-- ═══════════════════════════════════════════════════════════════════════════

SELECT cron.schedule(
  'roadping-expire-stale-sessions',         -- unique job name
  '* * * * *',                               -- every minute (pg_cron minimum)
  $$SELECT public.expire_stale_sessions();$$ -- job body
);

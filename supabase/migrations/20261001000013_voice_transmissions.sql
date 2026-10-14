-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 013: Server-authorized push-to-talk transmissions (Phase 3)
--
-- Design, threat model and rollout: docs/PHASE3_VOICE_PTT.md
-- Rollback: supabase/rollback/20261001000013_voice_transmissions.down.sql
--
-- There is no shared nearby or room audio channel. Every press of the talk
-- button creates one transmission with its own unguessable Agora channel.
-- The server decides, per listener and per token, who may join it:
--
-- 1. private.voice_contexts: the one voice context of a live session
--    (no row = Nearby, a row with room_id = that Room)
-- 2. private.voice_transmissions: one row per press; opaque channel name,
--    random speaker uid, 70 s hard end, idempotent per (speaker, client id)
-- 3. private.ptt_push_tokens: Apple PushToTalk ephemeral APNs tokens, bound
--    to one live session and deleted when it ends
-- 4. private.voice_can_listen(listener, transmission): the single listener
--    predicate. Nearby uses private.nearby_pair_band (Phase 2), so audio
--    never reaches anyone the nearby list would omit
-- 5. Service-role RPCs used by the voice Edge Functions
-- 6. end_live_session also ends transmissions, PTT tokens and the context
-- 7. expire_stale_sessions also sweeps transmissions, tokens and contexts
--
-- Nothing here is callable by anon or authenticated. Every function uses
-- SET search_path = '' and schema-qualifies what it touches. No audio, no
-- coordinates and no distance are stored.
-- ─────────────────────────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Voice context: Nearby (no row) or one Room
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS private.voice_contexts (
  live_session_id uuid        PRIMARY KEY REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL    REFERENCES public.profiles(id)      ON DELETE CASCADE,
  room_id         uuid        NOT NULL    REFERENCES public.rooms(id)         ON DELETE CASCADE,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS voice_contexts_room_idx ON private.voice_contexts (room_id);

ALTER TABLE private.voice_contexts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.voice_contexts FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE private.voice_contexts IS
  'The single voice context of a live session. No row means Nearby; a row means '
  'that Room. A user hears and talks in exactly one context. No client access.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Transmissions
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION private.voice_hard_end()
RETURNS interval
LANGUAGE sql
IMMUTABLE
SET search_path = ''
-- 60 s maximum hold (enforced on the device) plus 10 s for arming.
AS $$ SELECT INTERVAL '70 seconds' $$;

CREATE TABLE IF NOT EXISTS private.voice_transmissions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  speaker_id       uuid        NOT NULL REFERENCES public.profiles(id)      ON DELETE CASCADE,
  live_session_id  uuid        NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  room_id          uuid                 REFERENCES public.rooms(id)         ON DELETE CASCADE,
  client_tx_id     uuid        NOT NULL,
  channel_name     text        NOT NULL UNIQUE CHECK (channel_name ~ '^rpt_[0-9a-f]{32}$'),
  speaker_uid      integer     NOT NULL CHECK (speaker_uid BETWEEN 1 AND 1073741823),
  state            text        NOT NULL DEFAULT 'arming'
                               CHECK (state IN ('arming', 'live', 'ended')),
  voice_session_id uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  confirmed_at     timestamptz,
  hard_end_at      timestamptz NOT NULL,
  ended_at         timestamptz,
  ended_reason     text,
  CONSTRAINT voice_transmissions_ended_consistency
    CHECK ((state = 'ended') = (ended_at IS NOT NULL)),
  CONSTRAINT voice_transmissions_client_tx_unique UNIQUE (speaker_id, client_tx_id)
);

-- At most one open transmission per speaker.
CREATE UNIQUE INDEX IF NOT EXISTS voice_transmissions_one_open_per_speaker
  ON private.voice_transmissions (speaker_id)
  WHERE state <> 'ended';
CREATE INDEX IF NOT EXISTS voice_transmissions_open_hard_end_idx
  ON private.voice_transmissions (hard_end_at)
  WHERE state <> 'ended';
CREATE INDEX IF NOT EXISTS voice_transmissions_session_idx
  ON private.voice_transmissions (live_session_id);
CREATE INDEX IF NOT EXISTS voice_transmissions_ended_at_idx
  ON private.voice_transmissions (ended_at)
  WHERE state = 'ended';

ALTER TABLE private.voice_transmissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.voice_transmissions FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE private.voice_transmissions IS
  'One row per push-to-talk press. channel_name is an opaque random Agora '
  'channel used by this press only. No audio is stored. Ended rows are purged '
  'after an hour. No client access.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Apple PushToTalk ephemeral tokens
-- ═══════════════════════════════════════════════════════════════════════════
-- The system issues a PTT token after the app joins a PushToTalk channel and
-- it stays usable only while the device is in that channel. RoadPing joins
-- the channel when the user goes live, so a token is bound to that live
-- session and deleted when the session ends, expires, or the user logs out.

CREATE TABLE IF NOT EXISTS private.ptt_push_tokens (
  user_id          uuid        NOT NULL REFERENCES public.profiles(id)      ON DELETE CASCADE,
  installation_id  uuid        NOT NULL,
  live_session_id  uuid        NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  token            text        NOT NULL UNIQUE
                               CHECK (token ~ '^[0-9a-f]+$' AND char_length(token) BETWEEN 64 AND 512),
  apns_environment text        NOT NULL CHECK (apns_environment IN ('development', 'production')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL,
  PRIMARY KEY (user_id, installation_id)
);

CREATE INDEX IF NOT EXISTS ptt_push_tokens_session_idx ON private.ptt_push_tokens (live_session_id);
CREATE INDEX IF NOT EXISTS ptt_push_tokens_expires_idx ON private.ptt_push_tokens (expires_at);

ALTER TABLE private.ptt_push_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.ptt_push_tokens FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE private.ptt_push_tokens IS
  'Apple PushToTalk ephemeral APNs tokens (hex), one per (user, installation), '
  'bound to the live session they were issued in. Deleted when that session '
  'ends. No client access.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. The listener predicate
-- ═══════════════════════════════════════════════════════════════════════════
-- TRUE when p_listener may receive transmission p_tx right now:
--   • the transmission is open and before its hard end
--   • the speaker is still in the live session that started it, and is not
--     banned or shadow-banned
--   • the listener is live, not banned, not in Do Not Disturb, not the
--     speaker, and not transmitting (half-duplex)
--   • the listener's voice context equals the transmission's
--   • no block in either direction
--   • Nearby: private.nearby_pair_band(listener, speaker) is not NULL, the
--     exact Phase 2 visibility rule (mutual stepped range on the quantized grid)
--   • Room: both are members of the room
-- Not SECURITY DEFINER and not client-executable: reached only through the
-- SECURITY DEFINER RPCs below, owned by the migration role.

CREATE OR REPLACE FUNCTION private.voice_can_listen(p_listener uuid, p_tx uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM private.voice_transmissions t
    JOIN public.live_sessions ss
      ON  ss.id         = t.live_session_id
      AND ss.user_id    = t.speaker_id
      AND ss.status     = 'active'
      AND ss.expires_at > now()
    JOIN public.profiles sp
      ON  sp.id               = t.speaker_id
      AND sp.is_banned        = false
      AND sp.is_shadow_banned = false
    JOIN public.live_sessions ls
      ON  ls.user_id    = p_listener
      AND ls.status     = 'active'
      AND ls.expires_at > now()
    JOIN public.profiles lp
      ON  lp.id        = p_listener
      AND lp.is_banned = false
      AND lp.dnd_mode  = false
    LEFT JOIN private.voice_contexts sc
      ON  sc.live_session_id = ss.id
    LEFT JOIN private.voice_contexts lc
      ON  lc.live_session_id = ls.id
    WHERE t.id          = p_tx
      AND t.state      <> 'ended'
      AND t.hard_end_at > now()
      AND p_listener   <> t.speaker_id
      AND sc.room_id IS NOT DISTINCT FROM t.room_id
      AND lc.room_id IS NOT DISTINCT FROM t.room_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.blocks b
        WHERE (b.blocker_id = p_listener  AND b.blocked_id = t.speaker_id)
           OR (b.blocker_id = t.speaker_id AND b.blocked_id = p_listener)
      )
      AND NOT EXISTS (
        SELECT 1
        FROM private.voice_transmissions mine
        WHERE mine.speaker_id   = p_listener
          AND mine.state       <> 'ended'
          AND mine.hard_end_at  > now()
      )
      AND CASE
            WHEN t.room_id IS NULL THEN
              private.nearby_pair_band(p_listener, t.speaker_id) IS NOT NULL
            ELSE
              EXISTS (SELECT 1 FROM public.room_members m
                      WHERE m.room_id = t.room_id AND m.user_id = p_listener)
              AND EXISTS (SELECT 1 FROM public.room_members m
                          WHERE m.room_id = t.room_id AND m.user_id = t.speaker_id)
          END
  )
$$;

-- Listener uid for one (transmission, listener): stable for renewals, never
-- in the speaker uid range [1, 2^30), and not the user id hash older builds use.
CREATE OR REPLACE FUNCTION private.voice_listener_uid(p_tx uuid, p_listener uuid)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT ((hashtextextended(p_tx::text || ':' || p_listener::text, 0) & 1073741823) + 1073741824)::integer
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Service-role RPCs
-- ═══════════════════════════════════════════════════════════════════════════
-- Expected denials return {"ok": false, "error": "<code>"} so the Edge
-- Functions can map them without parsing exception text.

-- ── Active live session of a user (helper) ─────────────────────────────────
CREATE OR REPLACE FUNCTION private.active_live_session(p_user uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT ls.id
  FROM public.live_sessions ls
  JOIN public.profiles p ON p.id = ls.user_id AND p.is_banned = false
  WHERE ls.user_id    = p_user
    AND ls.status     = 'active'
    AND ls.expires_at > now()
$$;

-- ── End transmissions (helper; also closes the speaking-state row) ─────────
CREATE OR REPLACE FUNCTION private.voice_end_where(
  p_speaker uuid,
  p_tx      uuid,
  p_session uuid,
  p_reason  text
)
RETURNS integer
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH ended AS (
    UPDATE private.voice_transmissions t SET
      state        = 'ended',
      ended_at     = now(),
      ended_reason = p_reason
    WHERE t.state <> 'ended'
      AND (p_speaker IS NULL OR t.speaker_id      = p_speaker)
      AND (p_tx      IS NULL OR t.id              = p_tx)
      AND (p_session IS NULL OR t.live_session_id = p_session)
    RETURNING t.voice_session_id
  ), closed AS (
    UPDATE public.voice_sessions vs SET
      is_speaking = false,
      ended_at    = now()
    FROM ended e
    WHERE vs.id       = e.voice_session_id
      AND vs.ended_at IS NULL
    RETURNING vs.id
  )
  SELECT COUNT(*) INTO v_count FROM ended;
  RETURN v_count;
END;
$$;

-- ── Set the voice context ──────────────────────────────────────────────────
-- p_room_id NULL = Nearby. Switching context ends the caller's open
-- transmission. Joining a Room context requires membership.
CREATE OR REPLACE FUNCTION public.voice_set_context(p_user_id uuid, p_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session uuid;
  v_current uuid;
BEGIN
  v_session := private.active_live_session(p_user_id);
  IF v_session IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_live');
  END IF;

  IF p_room_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.room_members m WHERE m.room_id = p_room_id AND m.user_id = p_user_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_member');
  END IF;

  SELECT c.room_id INTO v_current FROM private.voice_contexts c WHERE c.live_session_id = v_session;

  IF v_current IS DISTINCT FROM p_room_id THEN
    PERFORM private.voice_end_where(p_user_id, NULL, NULL, 'context_changed');
  END IF;

  IF p_room_id IS NULL THEN
    DELETE FROM private.voice_contexts WHERE live_session_id = v_session;
  ELSE
    INSERT INTO private.voice_contexts (live_session_id, user_id, room_id, updated_at)
    VALUES (v_session, p_user_id, p_room_id, now())
    ON CONFLICT (live_session_id) DO UPDATE SET
      room_id    = EXCLUDED.room_id,
      updated_at = now();
  END IF;

  RETURN jsonb_build_object('ok', true, 'room_id', p_room_id);
END;
$$;

-- ── Begin a transmission ───────────────────────────────────────────────────
-- Idempotent on (speaker, client_tx_id): a retried request returns the same
-- transmission. A new press ends the speaker's previous open transmission.
CREATE OR REPLACE FUNCTION public.voice_begin_transmission(p_user_id uuid, p_client_tx_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session uuid;
  v_room    uuid;
  v_tx      private.voice_transmissions%ROWTYPE;
  v_created boolean := false;
BEGIN
  IF p_user_id IS NULL OR p_client_tx_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid');
  END IF;

  -- Serialize presses of one speaker.
  PERFORM pg_advisory_xact_lock(hashtextextended('roadping.voice.' || p_user_id::text, 0));

  v_session := private.active_live_session(p_user_id);
  IF v_session IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_live');
  END IF;

  SELECT * INTO v_tx
  FROM private.voice_transmissions t
  WHERE t.speaker_id = p_user_id AND t.client_tx_id = p_client_tx_id;

  IF FOUND THEN
    IF v_tx.state = 'ended' OR v_tx.hard_end_at <= now() OR v_tx.live_session_id <> v_session THEN
      RETURN jsonb_build_object('ok', false, 'error', 'transmission_ended');
    END IF;
  ELSE
    SELECT c.room_id INTO v_room FROM private.voice_contexts c WHERE c.live_session_id = v_session;

    IF v_room IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.room_members m WHERE m.room_id = v_room AND m.user_id = p_user_id
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_member');
    END IF;

    PERFORM private.voice_end_where(p_user_id, NULL, NULL, 'superseded');

    INSERT INTO private.voice_transmissions
      (speaker_id, live_session_id, room_id, client_tx_id, channel_name, speaker_uid, hard_end_at)
    VALUES (
      p_user_id,
      v_session,
      v_room,
      p_client_tx_id,
      'rpt_' || replace(gen_random_uuid()::text, '-', ''),
      1 + floor(random() * 1073741822)::integer,
      now() + private.voice_hard_end()
    )
    RETURNING * INTO v_tx;
    v_created := true;
  END IF;

  RETURN jsonb_build_object(
    'ok',              true,
    'transmission_id', v_tx.id,
    'channel',         v_tx.channel_name,
    'speaker_uid',     v_tx.speaker_uid,
    'room_id',         v_tx.room_id,
    'state',           v_tx.state,
    'hard_end_at',     v_tx.hard_end_at,
    -- TRUE only for the request that created the row: the Edge Function
    -- fans out PTT pushes once, never on a retry or a token renewal.
    'created',         v_created
  );
END;
$$;

-- ── Confirm: the speaker is publishing audio ───────────────────────────────
-- Only now does the public speaking state (voice_sessions) turn on, so
-- nobody is shown as talking before audio can actually be heard.
CREATE OR REPLACE FUNCTION public.voice_confirm_transmission(p_user_id uuid, p_transmission_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tx      private.voice_transmissions%ROWTYPE;
  v_session uuid;
  v_vs      uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('roadping.voice.' || p_user_id::text, 0));

  SELECT * INTO v_tx
  FROM private.voice_transmissions t
  WHERE t.id = p_transmission_id AND t.speaker_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  v_session := private.active_live_session(p_user_id);
  IF v_tx.state = 'ended' OR v_tx.hard_end_at <= now() OR v_session IS DISTINCT FROM v_tx.live_session_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'transmission_ended');
  END IF;

  IF v_tx.state = 'live' THEN
    RETURN jsonb_build_object('ok', true, 'voice_session_id', v_tx.voice_session_id,
                              'hard_end_at', v_tx.hard_end_at);
  END IF;

  -- One speaking row per user, as start-voice-session did.
  UPDATE public.voice_sessions SET is_speaking = false, ended_at = now()
  WHERE user_id = p_user_id AND ended_at IS NULL;

  INSERT INTO public.voice_sessions (user_id, live_session_id, room_id, is_speaking, expires_at)
  VALUES (p_user_id, v_tx.live_session_id, v_tx.room_id, true, v_tx.hard_end_at)
  RETURNING id INTO v_vs;

  UPDATE private.voice_transmissions SET
    state            = 'live',
    confirmed_at     = now(),
    voice_session_id = v_vs
  WHERE id = v_tx.id;

  RETURN jsonb_build_object('ok', true, 'voice_session_id', v_vs, 'hard_end_at', v_tx.hard_end_at);
END;
$$;

-- ── End: one transmission, or every open one of the speaker ────────────────
CREATE OR REPLACE FUNCTION public.voice_end_transmission(
  p_user_id         uuid,
  p_transmission_id uuid,
  p_reason          text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN 0;
  END IF;
  RETURN private.voice_end_where(
    p_user_id, p_transmission_id, NULL,
    CASE WHEN p_reason IN ('released', 'max_hold', 'failed', 'interrupted', 'aborted')
         THEN p_reason ELSE 'released' END
  );
END;
$$;

-- ── Listener grant ─────────────────────────────────────────────────────────
-- Re-evaluated on every join and every token renewal. Accepts a
-- transmission id (from a PTT push) or the voice_sessions id a foreground
-- listener saw through Realtime. Returns what the Edge Function needs to mint
-- a subscriber token, never the speaker's location or distance.
CREATE OR REPLACE FUNCTION public.voice_listener_grant(
  p_listener_id      uuid,
  p_transmission_id  uuid,
  p_voice_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tx private.voice_transmissions%ROWTYPE;
BEGIN
  IF p_listener_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'denied');
  END IF;

  IF p_transmission_id IS NOT NULL THEN
    SELECT * INTO v_tx FROM private.voice_transmissions t WHERE t.id = p_transmission_id;
  ELSIF p_voice_session_id IS NOT NULL THEN
    SELECT * INTO v_tx FROM private.voice_transmissions t WHERE t.voice_session_id = p_voice_session_id;
  END IF;

  -- One answer for "does not exist" and "not allowed": a probe learns nothing.
  IF v_tx.id IS NULL OR NOT private.voice_can_listen(p_listener_id, v_tx.id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'denied');
  END IF;

  RETURN jsonb_build_object(
    'ok',              true,
    'transmission_id', v_tx.id,
    'channel',         v_tx.channel_name,
    'speaker_id',      v_tx.speaker_id,
    'speaker_uid',     v_tx.speaker_uid,
    'listener_uid',    private.voice_listener_uid(v_tx.id, p_listener_id),
    'room_id',         v_tx.room_id,
    'hard_end_at',     v_tx.hard_end_at
  );
END;
$$;

-- ── Fan-out targets for PTT pushes ─────────────────────────────────────────
-- Devices with a PTT token from their current live session that pass
-- private.voice_can_listen. Capped; the cap is documented as a residual risk.
CREATE OR REPLACE FUNCTION public.voice_fanout_targets(p_transmission_id uuid)
RETURNS TABLE (
  listener_id      uuid,
  listener_uid     integer,
  token            text,
  apns_environment text,
  channel          text,
  speaker_uid      integer,
  hard_end_at      timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_tx    private.voice_transmissions%ROWTYPE;
  v_where extensions.geography;
BEGIN
  SELECT * INTO v_tx FROM private.voice_transmissions t
  WHERE t.id = p_transmission_id AND t.state <> 'ended' AND t.hard_end_at > now();
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_tx.room_id IS NULL THEN
    SELECT lp.location INTO v_where
    FROM public.location_presence lp
    WHERE lp.user_id = v_tx.speaker_id AND lp.expires_at > now();
    IF v_where IS NULL THEN
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
  SELECT pt.user_id,
         private.voice_listener_uid(v_tx.id, pt.user_id),
         pt.token,
         pt.apns_environment,
         v_tx.channel_name,
         v_tx.speaker_uid,
         v_tx.hard_end_at
  FROM private.ptt_push_tokens pt
  JOIN public.live_sessions ls
    ON  ls.id         = pt.live_session_id
    AND ls.user_id    = pt.user_id
    AND ls.status     = 'active'
    AND ls.expires_at > now()
  WHERE pt.expires_at > now()
    AND pt.user_id   <> v_tx.speaker_id
    AND (
      CASE
        WHEN v_tx.room_id IS NULL THEN
          -- Index-assisted superset (largest range + grid margin);
          -- voice_can_listen decides.
          EXISTS (
            SELECT 1 FROM public.location_presence op
            WHERE op.user_id = pt.user_id
              AND op.expires_at > now()
              AND extensions.ST_DWithin(op.location, v_where,
                    4800 + private.proximity_prefilter_margin_m())
          )
        ELSE
          EXISTS (SELECT 1 FROM public.room_members m
                  WHERE m.room_id = v_tx.room_id AND m.user_id = pt.user_id)
      END
    )
    AND private.voice_can_listen(pt.user_id, v_tx.id)
  ORDER BY pt.created_at
  LIMIT 200;
END;
$$;

-- ── Agora kick targets after a block ──────────────────────────────────────
-- For each open transmission where one of the pair speaks, the channel and
-- the other one's listener uid, so block-user can ask Agora to remove that
-- listener at once instead of waiting for the token to lapse (<= 45 s).
CREATE OR REPLACE FUNCTION public.voice_block_kicks(p_a uuid, p_b uuid)
RETURNS TABLE (channel text, listener_uid integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT t.channel_name,
         private.voice_listener_uid(t.id, CASE WHEN t.speaker_id = p_a THEN p_b ELSE p_a END)
  FROM private.voice_transmissions t
  WHERE t.state <> 'ended'
    AND t.hard_end_at > now()
    AND t.speaker_id IN (p_a, p_b)
$$;

-- ── PTT token registration ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.register_ptt_token(
  p_user_id          uuid,
  p_installation_id  uuid,
  p_live_session_id  uuid,
  p_token            text,
  p_apns_environment text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_token text := lower(p_token);
BEGIN
  IF p_user_id IS NULL OR p_installation_id IS NULL
     OR v_token IS NULL OR v_token !~ '^[0-9a-f]+$'
     OR char_length(v_token) NOT BETWEEN 64 AND 512
     OR p_apns_environment NOT IN ('development', 'production') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid');
  END IF;

  IF private.active_live_session(p_user_id) IS DISTINCT FROM p_live_session_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_live');
  END IF;

  -- A token belongs to one device; if it moved accounts, the old row goes.
  DELETE FROM private.ptt_push_tokens
  WHERE token = v_token AND (user_id, installation_id) <> (p_user_id, p_installation_id);

  INSERT INTO private.ptt_push_tokens
    (user_id, installation_id, live_session_id, token, apns_environment, created_at, expires_at)
  VALUES
    (p_user_id, p_installation_id, p_live_session_id, v_token, p_apns_environment, now(), now() + INTERVAL '12 hours')
  ON CONFLICT (user_id, installation_id) DO UPDATE SET
    live_session_id  = EXCLUDED.live_session_id,
    token            = EXCLUDED.token,
    apns_environment = EXCLUDED.apns_environment,
    created_at       = now(),
    expires_at       = EXCLUDED.expires_at;

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.unregister_ptt_token(p_user_id uuid, p_installation_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH d AS (
    DELETE FROM private.ptt_push_tokens
    WHERE user_id = p_user_id
      AND (p_installation_id IS NULL OR installation_id = p_installation_id)
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM d;
  RETURN v_count;
END;
$$;

-- APNs said the token is unregistered / bad: forget it.
CREATE OR REPLACE FUNCTION public.drop_ptt_token(p_token text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  DELETE FROM private.ptt_push_tokens WHERE token = lower(p_token)
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 6. end_live_session: also transmissions, PTT tokens and context
-- ═══════════════════════════════════════════════════════════════════════════
-- Same signature, return type and grants as migration 005/010. Order kept
-- (voice rows, presence, session), new steps appended.

CREATE OR REPLACE FUNCTION public.end_live_session(
  p_session_id uuid,
  p_user_id    uuid,
  p_reason     public.session_ended_reason
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.voice_sessions SET
    is_speaking = false,
    ended_at    = now()
  WHERE live_session_id = p_session_id
    AND ended_at        IS NULL;

  DELETE FROM public.location_presence
  WHERE user_id = p_user_id;

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

  PERFORM private.voice_end_where(NULL, NULL, p_session_id, 'live_ended');

  DELETE FROM private.ptt_push_tokens WHERE live_session_id = p_session_id;
  DELETE FROM private.voice_contexts  WHERE live_session_id = p_session_id;
END;
$$;

COMMENT ON FUNCTION public.end_live_session(uuid, uuid, public.session_ended_reason) IS
  'Atomically ends a live session: closes voice sessions and transmissions, '
  'deletes location presence, PTT push tokens and the voice context, and marks '
  'the session ended/expired. Service role only.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Cleanup job: also transmissions, PTT tokens and contexts
-- ═══════════════════════════════════════════════════════════════════════════
-- Steps 0-5 identical to migration 012; steps 6-9 new and after step 2, so a
-- session expired in this run is swept in this run.

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
  v_ended_tx         int;
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

  -- Step 6: End open transmissions past their hard end or whose live
  -- session is no longer active
  WITH ended AS (
    UPDATE private.voice_transmissions t SET
      state        = 'ended',
      ended_at     = now(),
      ended_reason = 'expired'
    WHERE t.state <> 'ended'
      AND (
        t.hard_end_at < now()
        OR NOT EXISTS (
          SELECT 1 FROM public.live_sessions ls
          WHERE ls.id = t.live_session_id AND ls.status = 'active'
        )
      )
    RETURNING t.voice_session_id
  ), closed AS (
    UPDATE public.voice_sessions vs SET
      is_speaking = false,
      ended_at    = now()
    FROM ended e
    WHERE vs.id = e.voice_session_id
      AND vs.ended_at IS NULL
    RETURNING vs.id
  )
  SELECT COUNT(*) INTO v_ended_tx FROM ended;

  -- Step 7: PTT tokens that expired or whose live session is over
  DELETE FROM private.ptt_push_tokens pt
  WHERE pt.expires_at < now()
     OR NOT EXISTS (
       SELECT 1 FROM public.live_sessions ls
       WHERE ls.id = pt.live_session_id AND ls.status = 'active'
     );

  -- Step 8: Voice contexts of sessions that are over
  DELETE FROM private.voice_contexts c
  WHERE NOT EXISTS (
    SELECT 1 FROM public.live_sessions ls
    WHERE ls.id = c.live_session_id AND ls.status = 'active'
  );

  -- Step 9: No transmission history — drop ended rows after an hour
  DELETE FROM private.voice_transmissions
  WHERE state = 'ended'
    AND ended_at < now() - INTERVAL '1 hour';

  IF v_expired_voice > 0 OR v_deleted_presence > 0 OR v_expired_sessions > 0 OR v_purged_voice > 0 OR v_ended_tx > 0 THEN
    RAISE LOG
      'expire_stale_sessions: closed % voice sessions, removed % presence rows, expired % live sessions, purged % voice rows, ended % transmissions',
      v_expired_voice, v_deleted_presence, v_expired_sessions, v_purged_voice, v_ended_tx;
  END IF;
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 8. Do Not Disturb meaning (documentation only)
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON COLUMN public.profiles.dnd_mode IS
  'Do Not Disturb. The user stays visible and may still talk deliberately, but '
  'receives no incoming voice: private.voice_can_listen excludes them, so no '
  'PTT push and no listener token is issued.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 9. EXECUTE privileges
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE ALL ON FUNCTION public.voice_set_context(uuid, uuid)                       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.voice_begin_transmission(uuid, uuid)                FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.voice_confirm_transmission(uuid, uuid)              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.voice_end_transmission(uuid, uuid, text)            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.voice_listener_grant(uuid, uuid, uuid)              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.voice_fanout_targets(uuid)                          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.register_ptt_token(uuid, uuid, uuid, text, text)    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.unregister_ptt_token(uuid, uuid)                    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.drop_ptt_token(text)                                FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.voice_block_kicks(uuid, uuid)                       FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.voice_set_context(uuid, uuid)                    TO service_role;
GRANT EXECUTE ON FUNCTION public.voice_begin_transmission(uuid, uuid)             TO service_role;
GRANT EXECUTE ON FUNCTION public.voice_confirm_transmission(uuid, uuid)           TO service_role;
GRANT EXECUTE ON FUNCTION public.voice_end_transmission(uuid, uuid, text)         TO service_role;
GRANT EXECUTE ON FUNCTION public.voice_listener_grant(uuid, uuid, uuid)           TO service_role;
GRANT EXECUTE ON FUNCTION public.voice_fanout_targets(uuid)                       TO service_role;
GRANT EXECUTE ON FUNCTION public.register_ptt_token(uuid, uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.unregister_ptt_token(uuid, uuid)                 TO service_role;
GRANT EXECUTE ON FUNCTION public.drop_ptt_token(text)                             TO service_role;
GRANT EXECUTE ON FUNCTION public.voice_block_kicks(uuid, uuid)                    TO service_role;

REVOKE ALL ON FUNCTION private.voice_hard_end()                         FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.voice_can_listen(uuid, uuid)             FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.voice_listener_uid(uuid, uuid)           FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.active_live_session(uuid)                FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.voice_end_where(uuid, uuid, uuid, text)  FROM PUBLIC, anon, authenticated, service_role;

-- Unchanged from 010, restated after the replacement.
REVOKE EXECUTE ON FUNCTION public.end_live_session(uuid, uuid, public.session_ended_reason) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_stale_sessions()                                  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.end_live_session(uuid, uuid, public.session_ended_reason) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_stale_sessions()                                  TO service_role;

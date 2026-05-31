/**
 * useHoldToTalk — press-and-hold voice button state machine.
 *
 * Visual states: 'idle' | 'arming' | 'speaking' | 'releasing'
 *
 * On first press: requests mic permission via expo-audio. If denied, silently
 * returns to idle (no button state shown to avoid confusion). Subsequent
 * presses check the cached permission status instantly.
 *
 * Audio transport (Phase 15):
 *  • ROOM target (roomId provided) on an EAS/dev build → real Agora audio.
 *    The hook joins the room's Agora channel (muted) for the duration so the
 *    user can HEAR others, then unmutes the mic only while the button is held.
 *    DND mutes incoming playback. Leaves the channel on release-of-context,
 *    unmount, or app background.
 *  • NEARBY target (no roomId) OR Expo Go → speaking-indicator only. The state
 *    machine drives voice_sessions.is_speaking on the server; no audio flows.
 *    (Real geo-grouped nearby audio is deferred — see create-agora-token.)
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  MAX_HOLD_MS,
  createAgoraToken,
  getMicPermissionStatus,
  requestMicPermission,
  startTalking,
  stopTalking,
} from '@/services/voice';
import {
  isAgoraAvailable,
  joinChannel,
  leaveChannel,
  setMicMuted,
  setRemoteMuted,
} from '@/services/agoraVoice';

export type HoldState = 'idle' | 'arming' | 'speaking' | 'releasing';

export interface UseHoldToTalkResult {
  state: HoldState;
  /** Currently active voice session ID, or null. */
  voiceSessionId: string | null;
  onPressIn: () => void;
  onPressOut: () => void;
  /** True when the button is disabled (e.g. no live session). */
  isDisabled: boolean;
  /**
   * True if the mic permission was explicitly denied.
   * The caller can use this to show an explanation to the user.
   */
  micPermissionDenied: boolean;
  /**
   * True when a real Agora audio channel is joined (room target on a native
   * build). False means indicator-only mode (Expo Go, nearby, or join failed).
   */
  voiceConnected: boolean;
}

export interface UseHoldToTalkOptions {
  /** Must be a valid live session id; null disables the button. */
  liveSessionId: string | null;
  /** Hold the button while the live session is active, not always. */
  enabled: boolean;
  /**
   * When provided, voice is scoped to this room — members share a real Agora
   * audio channel (native builds) and only room members see the indicator.
   * Omit for open-channel nearby (indicator-only).
   */
  roomId?: string | null;
  /**
   * Do Not Disturb — when true, incoming room audio playback is muted locally.
   */
  dnd?: boolean;
}

export function useHoldToTalk(opts: UseHoldToTalkOptions): UseHoldToTalkResult {
  const [state, setState] = useState<HoldState>('idle');
  const [voiceSessionId, setVoiceSessionId] = useState<string | null>(null);
  const [micPermissionDenied, setMicPermissionDenied] = useState(false);
  const [voiceConnected, setVoiceConnected] = useState(false);
  const [rejoinTick, setRejoinTick] = useState(0);
  const autoReleaseRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heldRef = useRef(false);

  // Real Agora audio applies to room voice on a native build only.
  const useAgora =
    opts.roomId != null && opts.enabled && isAgoraAvailable();

  const clearAutoRelease = () => {
    if (autoReleaseRef.current !== null) {
      clearTimeout(autoReleaseRef.current);
      autoReleaseRef.current = null;
    }
  };

  const release = useCallback(async () => {
    heldRef.current = false;
    clearAutoRelease();
    if (state === 'idle') return;
    setState('releasing');
    // Stop transmitting immediately; we stay joined to keep receiving.
    if (useAgora) void setMicMuted(true);
    try {
      await stopTalking();
    } catch {
      // Swallow stop errors — server session will expire naturally.
    } finally {
      setVoiceSessionId(null);
      setState('idle');
    }
  }, [state, useAgora]);

  useEffect(() => {
    return () => {
      clearAutoRelease();
    };
  }, []);

  // ── Agora channel lifecycle (room voice, native build) ─────────────────────
  // Join the room's audio channel (muted) so the user can hear others for the
  // whole time they're in the room + live. Leave on disable / unmount / rejoin.
  useEffect(() => {
    if (!useAgora || opts.liveSessionId === null || opts.roomId == null) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        // Best-effort mic permission up front so PTT is instant; listening
        // works even if this is denied (we just can't transmit).
        await requestMicPermission();
        const tok = await createAgoraToken({
          target: 'room',
          room_id: opts.roomId!,
        });
        if (cancelled) return;
        await joinChannel({
          appId: tok.appId,
          channelName: tok.channelName,
          token: tok.token,
          uid: tok.uid,
        });
        if (cancelled) {
          await leaveChannel();
          return;
        }
        await setRemoteMuted(!!opts.dnd);
        setVoiceConnected(true);
      } catch {
        // Token/join failure → indicator-only fallback. Do not crash the room.
        setVoiceConnected(false);
      }
    })();
    return () => {
      cancelled = true;
      setVoiceConnected(false);
      void leaveChannel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useAgora, opts.liveSessionId, opts.roomId, rejoinTick]);

  // ── DND → mute/unmute incoming playback while connected ────────────────────
  useEffect(() => {
    if (!useAgora || !voiceConnected) return;
    void setRemoteMuted(!!opts.dnd);
  }, [opts.dnd, voiceConnected, useAgora]);

  // ── App background → release PTT + leave channel; rejoin on return ─────────
  useEffect(() => {
    if (!useAgora) return;
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'background' || next === 'inactive') {
        if (state !== 'idle') void release();
        setVoiceConnected(false);
        void leaveChannel();
      } else if (next === 'active') {
        // Re-run the join effect.
        setRejoinTick((t) => t + 1);
      }
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useAgora, state, release]);

  // If the live session ends mid-hold, release immediately.
  useEffect(() => {
    if (!opts.enabled || opts.liveSessionId === null) {
      if (state !== 'idle') {
        void release();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.enabled, opts.liveSessionId]);

  const onPressIn = useCallback(() => {
    if (!opts.enabled || opts.liveSessionId === null) return;
    if (state !== 'idle') return;
    heldRef.current = true;

    void (async () => {
      // ── 1. Mic permission gate ────────────────────────────────────────────
      // getMicPermissionStatus() is instant after the first check.
      // requestMicPermission() shows the OS dialog only when undetermined.
      let perm = await getMicPermissionStatus();
      if (perm !== 'granted') {
        perm = await requestMicPermission();
      }
      if (perm !== 'granted') {
        heldRef.current = false;
        setMicPermissionDenied(true);
        return;
      }
      setMicPermissionDenied(false);

      // ── 2. Arm + haptic ──────────────────────────────────────────────────
      setState('arming');
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

      // ── 3. Start transmitting (unmute mic) + mark speaking ────────────────
      try {
        // Unmute the Agora mic first so audio starts flowing the instant the
        // indicator goes up (no-op in indicator-only mode).
        if (useAgora) void setMicMuted(false);

        const resp = await startTalking({
          live_session_id: opts.liveSessionId!,
          ...(opts.roomId != null ? { room_id: opts.roomId } : {}),
        });

        // Did the user release while the request was in flight?
        if (!heldRef.current) {
          if (useAgora) void setMicMuted(true);
          try { await stopTalking(); } catch { /* ignore */ }
          return;
        }

        setVoiceSessionId(resp.voice_session_id);
        setState('speaking');

        // Hard ceiling — auto-release at MAX_HOLD_MS.
        autoReleaseRef.current = setTimeout(() => {
          void release();
        }, MAX_HOLD_MS);
      } catch {
        if (useAgora) void setMicMuted(true);
        setState('idle');
        heldRef.current = false;
      }
    })();
  }, [opts.enabled, opts.liveSessionId, opts.roomId, release, state, useAgora]);

  const onPressOut = useCallback(() => {
    if (!heldRef.current && state === 'idle') return;
    void Haptics.selectionAsync().catch(() => {});
    void release();
  }, [release, state]);

  return {
    state,
    voiceSessionId,
    onPressIn,
    onPressOut,
    isDisabled: !opts.enabled || opts.liveSessionId === null,
    micPermissionDenied,
    voiceConnected,
  };
}

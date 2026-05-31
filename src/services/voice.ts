/**
 * VoiceService — speaking-state management for RoadPing hold-to-talk.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  EXPO GO MODE  (what runs today)                                        │
 * │                                                                         │
 * │  • requestMicPermission() — calls expo-audio                            │
 * │    requestRecordingPermissionsAsync(). The OS mic-permission dialog is  │
 * │    shown correctly in Expo Go.                                          │
 * │  • startTalking() / stopTalking() — call the start/stop-voice-session   │
 * │    Edge Functions. This sets is_speaking = true/false in voice_sessions.│
 * │  • subscribeToSpeakingState() — Supabase Realtime subscription.         │
 * │    Nearby users see the speaking indicator update in ~1 s.              │
 * │                                                                         │
 * │  NO AUDIO IS CAPTURED OR TRANSMITTED. The "talking" signal is a        │
 * │  presence flag only — like a CB radio squelch light, not audio.        │
 * │  No recordings. No transcripts. No audio files.                         │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │  PHASE 15 — REAL AUDIO via AGORA (EAS / TestFlight builds)              │
 * │                                                                         │
 * │  Real audio transport uses Agora (react-native-agora), a native module  │
 * │  that does NOT run in Expo Go — an EAS development build is required.    │
 * │                                                                         │
 * │  • createAgoraToken() — calls the create-agora-token Edge Function,     │
 * │    which mints a short-lived RTC token after verifying the live session │
 * │    (nearby) or room membership (room). The App Certificate stays server-│
 * │    side; only appId/channel/token/uid reach the client.                 │
 * │  • src/services/agoraVoice.ts owns the engine: join/leave/mute. PTT      │
 * │    unmutes the mic while held; release re-mutes.                        │
 * │                                                                         │
 * │  Honest status (see Phase 15 notes / docs):                             │
 * │    • ROOM voice  → real grouped audio: all members share one channel.   │
 * │    • NEARBY voice → speaking-indicator only. Real geo-grouped nearby     │
 * │      audio needs server-side channel assignment and is deferred; the    │
 * │      token endpoint supports it but the client does not join yet.       │
 * │                                                                         │
 * │  Either way: NO recordings, NO files, NO transcripts, NO uploads.       │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
import {
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
} from 'expo-audio';
import { supabase } from './supabase';
import { edgeFnUrl } from './api';
import type {
  CreateAgoraTokenRequest,
  CreateAgoraTokenResponse,
  StartVoiceSessionRequest,
  StartVoiceSessionResponse,
  StopVoiceSessionResponse,
} from './api';

// ─── Public types ─────────────────────────────────────────────────────────────

export type MicPermissionStatus = 'granted' | 'denied' | 'undetermined';

export type VoiceTarget = {
  live_session_id: string;
  room_id?: string;
};

export type SpeakingChange = {
  user_id: string;
  is_speaking: boolean;
};

/** Maximum continuous hold duration — matches voice_sessions.expires_at (60 s). */
export const MAX_HOLD_MS = 60_000;

// ─── Module-level state ───────────────────────────────────────────────────────

let _speakingState: 'idle' | 'speaking' = 'idle';
let _micPermissionStatus: MicPermissionStatus = 'undetermined';

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function accessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  if (data.session === null) throw new Error('Not authenticated.');
  return data.session.access_token;
}

async function post<Req, Res>(name: string, body: Req): Promise<Res> {
  const token = await accessToken();
  const res = await fetch(edgeFnUrl(name), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { error?: string } & Res;
  if (!res.ok) {
    throw new Error(json.error ?? `Server error (${res.status})`);
  }
  return json;
}

// ─── Permission ───────────────────────────────────────────────────────────────

/**
 * Returns the cached mic permission status without triggering a dialog.
 * Safe to call before every press — instant after the first check.
 */
export async function getMicPermissionStatus(): Promise<MicPermissionStatus> {
  const { status } = await getRecordingPermissionsAsync();
  _micPermissionStatus = status as MicPermissionStatus;
  return _micPermissionStatus;
}

/**
 * Requests mic permission if not already granted.
 * Shows the OS permission dialog on first call; returns immediately on
 * subsequent calls once the user has made a choice.
 *
 * Works correctly in Expo Go on both iOS and Android.
 */
export async function requestMicPermission(): Promise<MicPermissionStatus> {
  const current = await getMicPermissionStatus();
  if (current === 'granted') return 'granted';

  const { status } = await requestRecordingPermissionsAsync();
  _micPermissionStatus = status as MicPermissionStatus;
  return _micPermissionStatus;
}

// ─── Agora RTC token ──────────────────────────────────────────────────────────

/**
 * Requests a short-lived Agora RTC token for the given voice target.
 *
 * The server verifies the caller owns an active live session (nearby) or is a
 * room member (room) before minting. Throws on auth/permission/server errors —
 * callers should fall back to indicator-only behavior.
 */
export async function createAgoraToken(
  req: CreateAgoraTokenRequest,
): Promise<CreateAgoraTokenResponse> {
  return post<CreateAgoraTokenRequest, CreateAgoraTokenResponse>(
    'create-agora-token',
    req,
  );
}

// ─── Speaking state ───────────────────────────────────────────────────────────

/**
 * Returns the current local speaking state. Useful for guards — the
 * authoritative state is on the server (voice_sessions.is_speaking).
 */
export function getCurrentVoiceState(): 'idle' | 'speaking' {
  return _speakingState;
}

/**
 * Signals to the server that this user has started speaking.
 *
 * Expo Go: sets is_speaking = true in voice_sessions; no audio captured.
 * Native:  additionally starts audio capture + WebRTC broadcast.
 *
 * target.room_id scopes the voice session to a room; omit for open-channel.
 */
export async function startTalking(
  target: VoiceTarget,
): Promise<StartVoiceSessionResponse> {
  const resp = await post<StartVoiceSessionRequest, StartVoiceSessionResponse>(
    'start-voice-session',
    target,
  );
  _speakingState = 'speaking';
  return resp;
}

/**
 * Signals to the server that this user has stopped speaking.
 *
 * Expo Go: sets is_speaking = false; no audio to stop.
 * Native:  additionally stops audio capture + WebRTC broadcast.
 */
export async function stopTalking(): Promise<StopVoiceSessionResponse> {
  const resp = await post<Record<string, never>, StopVoiceSessionResponse>(
    'stop-voice-session',
    {},
  );
  _speakingState = 'idle';
  return resp;
}

// ─── Realtime speaking indicators ─────────────────────────────────────────────

/**
 * Subscribes to speaking-state changes from other users via Supabase Realtime.
 *
 * • roomId = null  → open-channel (all nearby, room_id IS NULL in voice_sessions)
 * • roomId = uuid  → room-scoped session only
 *
 * Returns an unsubscribe function — call it in the useEffect cleanup.
 *
 * Requires: voice_sessions added to supabase_realtime publication
 * (migration 20260527000008_voice_realtime.sql).
 *
 * Updates arrive in ~1 s vs. up to 5 s with polling alone.
 */
export function subscribeToSpeakingState(
  roomId: string | null,
  onChange: (change: SpeakingChange) => void,
): () => void {
  // Append a unique suffix so every call creates a fresh channel object.
  // supabase.channel(name) returns the *same* cached instance when the name
  // is reused — attaching .on() after .subscribe() throws the
  // "cannot add postgres_changes callbacks … after subscribe()" error.
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const channelName =
    roomId !== null ? `voice-room-${roomId}-${suffix}` : `voice-open-${suffix}`;
  const filter =
    roomId !== null ? `room_id=eq.${roomId}` : 'room_id=is.null';

  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'voice_sessions',
        filter,
      },
      (payload) => {
        if (payload.eventType === 'DELETE') {
          // Row deleted = session ended, mark silent.
          const old = payload.old as { user_id?: string } | undefined;
          if (old?.user_id) onChange({ user_id: old.user_id, is_speaking: false });
          return;
        }
        const record = payload.new as {
          user_id: string;
          is_speaking: boolean;
          ended_at: string | null;
        };
        // ended_at non-null means the session was closed server-side.
        const speaking = record.is_speaking && record.ended_at === null;
        onChange({ user_id: record.user_id, is_speaking: speaking });
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

// ─── Backward-compatible aliases (used by useHoldToTalk) ─────────────────────
// These keep the hook import unchanged while the new API surface is available.

export const startVoice = startTalking;
export const stopVoice = stopTalking;

/**
 * agoraVoice — thin wrapper around the Agora RTC engine for RoadPing's
 * live-only push-to-talk audio transport.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  WHERE THIS RUNS                                                          │
 * │                                                                          │
 * │  Agora is a NATIVE module (react-native-agora). It does NOT work in      │
 * │  Expo Go. It requires an EAS development build / TestFlight build.       │
 * │  In Expo Go, isAgoraAvailable() returns false and every call is a no-op  │
 * │  — the app falls back to speaking-indicator-only behavior (voice.ts).    │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │  PRIVACY                                                                 │
 * │                                                                          │
 * │  Audio is live transport only. We never start a recording, never write  │
 * │  a file, never upload a clip, never transcribe. PTT = unmute the mic     │
 * │  while held; release = mute. Leaving the channel ends transport.         │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
import type {
  IRtcEngine,
  IRtcEngineEventHandler,
  RtcConnection,
  AudioVolumeInfo,
} from 'react-native-agora';
import { IS_EXPO_GO, DISABLE_AGORA } from './env';

// ─── Public types ───────────────────────────────────────────────────────────

export interface AgoraJoinParams {
  appId: string;
  channelName: string;
  token: string;
  uid: number;
}

/** Fired with the set of remote uids currently speaking (volume over threshold). */
export type RemoteSpeakingListener = (speakingUids: number[]) => void;

/** Fired on a fatal Agora error code so the UI can recover/notify. */
export type AgoraErrorListener = (code: number) => void;

// ─── Native module loader (lazy + Expo-Go-safe) ───────────────────────────────

// We require() the native module lazily so merely importing this file never
// touches native code in Expo Go. The types above are erased at build time.
type AgoraModule = typeof import('react-native-agora');
let _mod: AgoraModule | null = null;
let _disabledLogged = false;

function loadAgora(): AgoraModule | null {
  // Kill switch: never touch the native module when explicitly disabled.
  // This guarantees no require('react-native-agora') and no
  // createAgoraRtcEngine() can ever run in a diagnostic build.
  if (DISABLE_AGORA) {
    if (!_disabledLogged) {
      _disabledLogged = true;
      // eslint-disable-next-line no-console
      console.log('[RoadPing] Agora disabled by env flag');
    }
    return null;
  }
  if (IS_EXPO_GO) return null;
  if (_mod) return _mod;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    _mod = require('react-native-agora') as AgoraModule;
    return _mod;
  } catch {
    return null;
  }
}

/** True only when the native Agora SDK can actually run (EAS/dev build, not Expo Go). */
export function isAgoraAvailable(): boolean {
  return loadAgora() !== null;
}

// ─── uid mapping ──────────────────────────────────────────────────────────────

/**
 * Deterministic 32-bit Agora uid for a Supabase user id.
 *
 * MUST stay byte-for-byte identical to agoraUid() in
 * supabase/functions/create-agora-token/index.ts so the client can map remote
 * audio (which carries the Agora uid) back to a known member.
 */
export function agoraUidForUser(userId: string): number {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < userId.length; i++) {
    hash ^= userId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV prime
  }
  return (hash >>> 1 || 1) >>> 0;
}

// ─── Engine state ─────────────────────────────────────────────────────────────

let _engine: IRtcEngine | null = null;
let _handler: IRtcEngineEventHandler | null = null;
let _channel: string | null = null;
let _micMuted = true;

let _remoteSpeakingListener: RemoteSpeakingListener | null = null;
let _errorListener: AgoraErrorListener | null = null;

/** Volume (0–255) above which a participant counts as "speaking". */
const SPEAKING_VOLUME_THRESHOLD = 5;

function ensureEngine(appId: string): IRtcEngine | null {
  const mod = loadAgora();
  if (!mod) return null;
  if (_engine) return _engine;

  const { createAgoraRtcEngine, ChannelProfileType } = mod;
  const engine = createAgoraRtcEngine();
  engine.initialize({
    appId,
    // Live broadcast profile is Agora's recommended choice for PTT.
    channelProfile: ChannelProfileType.ChannelProfileLiveBroadcasting,
  });
  engine.enableAudio();
  // Report speaker volumes every 300 ms so we can drive speaking indicators.
  engine.enableAudioVolumeIndication(300, 3, false);
  // Route audio to the loudspeaker (hands-free while driving), not the earpiece.
  engine.setEnableSpeakerphone(true);

  _handler = {
    onError: (errCode: number) => {
      _errorListener?.(errCode);
    },
    onAudioVolumeIndication: (
      _conn: RtcConnection,
      speakers: AudioVolumeInfo[],
    ) => {
      if (!_remoteSpeakingListener) return;
      // uid === 0 is the local user in this report; ignore it here.
      const remote = speakers
        .filter((s) => (s.uid ?? 0) !== 0 && (s.volume ?? 0) >= SPEAKING_VOLUME_THRESHOLD)
        .map((s) => s.uid as number);
      _remoteSpeakingListener(remote);
    },
  };
  engine.registerEventHandler(_handler);

  _engine = engine;
  return _engine;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Joins (or re-joins) the given channel. The mic always starts MUTED — joining
 * is for receiving; the caller unmutes via setMicMuted(false) on PTT press.
 *
 * No-op (resolves) when Agora is unavailable (Expo Go).
 */
export async function joinChannel(params: AgoraJoinParams): Promise<void> {
  const engine = ensureEngine(params.appId);
  if (!engine) return; // Expo Go fallback — speaking indicators still work.

  const mod = loadAgora()!;
  const { ClientRoleType, ChannelProfileType } = mod;

  // If already in a different channel, leave it first.
  if (_channel !== null && _channel !== params.channelName) {
    engine.leaveChannel();
  }

  _micMuted = true;
  engine.setClientRole(ClientRoleType.ClientRoleBroadcaster);
  engine.joinChannel(params.token, params.channelName, params.uid, {
    channelProfile: ChannelProfileType.ChannelProfileLiveBroadcasting,
    clientRoleType: ClientRoleType.ClientRoleBroadcaster,
    // Subscribe to everyone's audio (receive), but do NOT publish the mic until
    // the user holds PTT.
    autoSubscribeAudio: true,
    publishMicrophoneTrack: false,
  });
  // Belt-and-braces: ensure the mic stream is muted right after joining.
  engine.muteLocalAudioStream(true);
  _channel = params.channelName;
}

/** Leaves the current channel (stops all transport). Safe to call when not joined. */
export async function leaveChannel(): Promise<void> {
  const engine = _engine;
  if (!engine || _channel === null) {
    _channel = null;
    return;
  }
  engine.muteLocalAudioStream(true);
  engine.leaveChannel();
  _channel = null;
  _micMuted = true;
}

/**
 * PTT: false = transmitting (publish mic), true = silent.
 * No-op when Agora is unavailable or not joined.
 */
export async function setMicMuted(muted: boolean): Promise<void> {
  const engine = _engine;
  if (!engine || _channel === null) return;
  if (_micMuted === muted) return;
  _micMuted = muted;
  engine.muteLocalAudioStream(muted);
}

/**
 * DND: mute/unmute ALL incoming audio playback locally.
 * Used to suppress incoming voice when Do Not Disturb is on.
 */
export async function setRemoteMuted(muted: boolean): Promise<void> {
  const engine = _engine;
  if (!engine) return;
  engine.muteAllRemoteAudioStreams(muted);
}

/** Register a listener for remote speaking changes. Returns an unsubscribe fn. */
export function setRemoteSpeakingListener(
  listener: RemoteSpeakingListener | null,
): () => void {
  _remoteSpeakingListener = listener;
  return () => {
    if (_remoteSpeakingListener === listener) _remoteSpeakingListener = null;
  };
}

/** Register a listener for fatal Agora error codes. Returns an unsubscribe fn. */
export function setErrorListener(listener: AgoraErrorListener | null): () => void {
  _errorListener = listener;
  return () => {
    if (_errorListener === listener) _errorListener = null;
  };
}

/** The channel currently joined, or null. */
export function currentChannel(): string | null {
  return _channel;
}

/**
 * Fully tears down the engine. Call on logout / app teardown.
 * After this, the next joinChannel() re-initializes from scratch.
 */
export async function destroyEngine(): Promise<void> {
  const engine = _engine;
  if (!engine) return;
  try {
    if (_channel !== null) engine.leaveChannel();
    if (_handler) engine.unregisterEventHandler(_handler);
    engine.release();
  } finally {
    _engine = null;
    _handler = null;
    _channel = null;
    _micMuted = true;
    _remoteSpeakingListener = null;
    _errorListener = null;
  }
}

/**
 * agoraVoice — the Agora RTC engine as RoadPing's audio transport.
 *
 * Phase 3 topology (docs/PHASE3_VOICE_PTT.md): every press is its own
 * opaque channel ("rpt_<random>") that the server created. The speaker joins
 * it as the only publisher; each authorized listener joins it as an audience
 * member with a token the server minted for that listener alone. There is no
 * shared Nearby or room channel and no client-side filtering of who to hear.
 * One engine holds several connections (joinChannelEx) so a driver can hear
 * a few people at once.
 *
 * Tokens live at most 45 s. Before one expires the engine reports it and
 * voiceController asks the server again; if the server refuses, the
 * connection is left (fail closed). Agora's own token-expiry and banned
 * states also end the connection.
 *
 * Audio session:
 *  • 'ptt' mode: Apple's PushToTalk framework owns and activates the audio
 *    session. Agora is told not to touch it at all
 *    (AudioSessionOperationRestrictionAll).
 *  • 'direct' mode (foreground, no PushToTalk): Agora manages it with the
 *    loudspeaker as the DEFAULT route only, so Bluetooth, CarPlay and wired
 *    headsets still take over when connected. setEnableSpeakerphone(true),
 *    which forced the built-in speaker, is no longer used.
 *
 * Where it runs: a native module, so not in Expo Go; and never touched when
 * the kill switch EXPO_PUBLIC_DISABLE_AGORA is "true".
 *
 * Privacy: live transport only. Nothing is recorded, stored or transcribed.
 */
import type { IRtcEngineEx, IRtcEngineEventHandler, RtcConnection } from 'react-native-agora';
import { IS_EXPO_GO, DISABLE_AGORA } from './env';

type AgoraModule = typeof import('react-native-agora');
let _mod: AgoraModule | null = null;
let _disabledLogged = false;

function loadAgora(): AgoraModule | null {
  // Kill switch: never require the native module when explicitly disabled.
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

/** True only when the native Agora SDK can run (EAS build, kill switch off). */
export function isAgoraAvailable(): boolean {
  return loadAgora() !== null;
}

// ─── Public types ────────────────────────────────────────────────────────────

export type AudioMode = 'ptt' | 'direct';

export type ConnectionRole = 'speaker' | 'listener';

export type AgoraConnectionEvent =
  /** Speaker: joined and publishing the microphone. */
  | { type: 'published'; channel: string }
  /** Listener: the speaker's audio is playing. */
  | { type: 'audio_started'; channel: string }
  /** The token for this connection expires in about 30 s. */
  | { type: 'token_will_expire'; channel: string }
  /** The speaker left the channel (listener side). */
  | { type: 'speaker_left'; channel: string }
  /** The connection can no longer carry audio; it has been left. */
  | { type: 'failed'; channel: string; reason: 'token_expired' | 'invalid_token' | 'banned' | 'rejected' | 'join_failed' | 'mic_failed' };

export type AgoraEventListener = (e: AgoraConnectionEvent) => void;

interface Connection {
  channel: string;
  uid: number;
  role: ConnectionRole;
  /** Listener only: the one uid this connection may play. */
  speakerUid: number | null;
}

// ─── Engine state ────────────────────────────────────────────────────────────

let _engine: IRtcEngineEx | null = null;
let _handler: IRtcEngineEventHandler | null = null;
let _appId: string | null = null;
let _mode: AudioMode = 'direct';
const _connections = new Map<string, Connection>();
const _listeners = new Set<AgoraEventListener>();

function emit(e: AgoraConnectionEvent) {
  for (const l of _listeners) {
    try {
      l(e);
    } catch {
      // A listener error must not break the engine callbacks.
    }
  }
}

function rtc(c: Connection): RtcConnection {
  return { channelId: c.channel, localUid: c.uid };
}

function failAndLeave(channel: string, reason: Extract<AgoraConnectionEvent, { type: 'failed' }>['reason']) {
  const c = _connections.get(channel);
  if (!c) return;
  _connections.delete(channel);
  try {
    _engine?.leaveChannelEx(rtc(c));
  } catch {
    // already gone
  }
  emit({ type: 'failed', channel, reason });
}

function applyMode(engine: IRtcEngineEx, mod: AgoraModule) {
  if (_mode === 'ptt') {
    engine.setAudioSessionOperationRestriction(
      mod.AudioSessionOperationRestriction.AudioSessionOperationRestrictionAll,
    );
  } else {
    engine.setAudioSessionOperationRestriction(
      mod.AudioSessionOperationRestriction.AudioSessionOperationRestrictionNone,
    );
    // Default route only: a connected Bluetooth / CarPlay / wired route wins.
    engine.setDefaultAudioRouteToSpeakerphone(true);
  }
}

function ensureEngine(appId: string): IRtcEngineEx | null {
  const mod = loadAgora();
  if (!mod) return null;
  if (_engine && _appId === appId) return _engine;
  if (_engine) destroyEngineSync();

  const engine = mod.createAgoraRtcEngine() as IRtcEngineEx;
  engine.initialize({
    appId,
    channelProfile: mod.ChannelProfileType.ChannelProfileLiveBroadcasting,
    audioScenario: mod.AudioScenarioType.AudioScenarioChatroom,
  });
  engine.enableAudio();
  engine.disableVideo();
  applyMode(engine, mod);

  const S = mod.ConnectionStateType;
  const R = mod.ConnectionChangedReasonType;
  _handler = {
    onJoinChannelSuccess: (conn: RtcConnection) => {
      const c = conn.channelId ? _connections.get(conn.channelId) : undefined;
      if (c?.role === 'speaker') emit({ type: 'published', channel: c.channel });
    },
    onRemoteAudioStateChanged: (conn: RtcConnection, remoteUid: number, state: number) => {
      const c = conn.channelId ? _connections.get(conn.channelId) : undefined;
      if (c?.role !== 'listener' || remoteUid !== c.speakerUid) return;
      if (state === mod.RemoteAudioState.RemoteAudioStateDecoding) {
        emit({ type: 'audio_started', channel: c.channel });
      }
    },
    onUserOffline: (conn: RtcConnection, remoteUid: number) => {
      const c = conn.channelId ? _connections.get(conn.channelId) : undefined;
      if (c?.role === 'listener' && remoteUid === c.speakerUid) {
        emit({ type: 'speaker_left', channel: c.channel });
      }
    },
    onTokenPrivilegeWillExpire: (conn: RtcConnection) => {
      if (conn.channelId && _connections.has(conn.channelId)) {
        emit({ type: 'token_will_expire', channel: conn.channelId });
      }
    },
    onRequestToken: (conn: RtcConnection) => {
      if (conn.channelId) failAndLeave(conn.channelId, 'token_expired');
    },
    onLocalAudioStateChanged: (conn: RtcConnection, state: number) => {
      if (state !== mod.LocalAudioStreamState.LocalAudioStreamStateFailed) return;
      for (const c of _connections.values()) {
        if (c.role === 'speaker' && (!conn.channelId || conn.channelId === c.channel)) {
          failAndLeave(c.channel, 'mic_failed');
        }
      }
    },
    onConnectionStateChanged: (conn: RtcConnection, state: number, reason: number) => {
      if (!conn.channelId) return;
      if (state !== S.ConnectionStateFailed && state !== S.ConnectionStateDisconnected) return;
      const why =
        reason === R.ConnectionChangedTokenExpired
          ? 'token_expired'
          : reason === R.ConnectionChangedInvalidToken
            ? 'invalid_token'
            : reason === R.ConnectionChangedBannedByServer
              ? 'banned'
              : reason === R.ConnectionChangedRejectedByServer
                ? 'rejected'
                : reason === R.ConnectionChangedJoinFailed
                  ? 'join_failed'
                  : null;
      if (why) failAndLeave(conn.channelId, why);
    },
  };
  engine.registerEventHandler(_handler);
  _engine = engine;
  _appId = appId;
  return engine;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Subscribes to connection events. Returns an unsubscribe function. */
export function onAgoraEvent(listener: AgoraEventListener): () => void {
  _listeners.add(listener);
  return () => {
    _listeners.delete(listener);
  };
}

/**
 * Who owns the audio session. Switch only while no connection is open
 * (voiceController switches when the app changes foreground state between
 * presses).
 */
export function setAudioMode(mode: AudioMode): void {
  _mode = mode;
  const mod = loadAgora();
  if (_engine && mod) applyMode(_engine, mod);
}

export function audioMode(): AudioMode {
  return _mode;
}

/** Speaker: join the press's channel and publish the microphone. */
export function publish(args: { appId: string; channel: string; uid: number; token: string }): boolean {
  const engine = ensureEngine(args.appId);
  const mod = loadAgora();
  if (!engine || !mod) return false;
  if (_connections.has(args.channel)) return true;
  const c: Connection = { channel: args.channel, uid: args.uid, role: 'speaker', speakerUid: null };
  _connections.set(args.channel, c);
  const rc = engine.joinChannelEx(args.token, rtc(c), {
    channelProfile: mod.ChannelProfileType.ChannelProfileLiveBroadcasting,
    clientRoleType: mod.ClientRoleType.ClientRoleBroadcaster,
    publishMicrophoneTrack: true,
    publishCameraTrack: false,
    autoSubscribeAudio: false,
    autoSubscribeVideo: false,
  });
  if (rc < 0) {
    _connections.delete(args.channel);
    return false;
  }
  return true;
}

/**
 * Listener: join a press's channel as audience and play only the speaker's
 * uid. The server already decided this listener may hear this press.
 */
export function listen(args: {
  appId: string;
  channel: string;
  uid: number;
  token: string;
  speakerUid: number;
  muted: boolean;
}): boolean {
  const engine = ensureEngine(args.appId);
  const mod = loadAgora();
  if (!engine || !mod) return false;
  if (_connections.has(args.channel)) return true;
  const c: Connection = { channel: args.channel, uid: args.uid, role: 'listener', speakerUid: args.speakerUid };
  _connections.set(args.channel, c);
  const rc = engine.joinChannelEx(args.token, rtc(c), {
    channelProfile: mod.ChannelProfileType.ChannelProfileLiveBroadcasting,
    clientRoleType: mod.ClientRoleType.ClientRoleAudience,
    publishMicrophoneTrack: false,
    publishCameraTrack: false,
    autoSubscribeAudio: true,
    autoSubscribeVideo: false,
  });
  if (rc < 0) {
    _connections.delete(args.channel);
    return false;
  }
  engine.setSubscribeAudioAllowlistEx([args.speakerUid], 1, rtc(c));
  if (args.muted) engine.muteAllRemoteAudioStreamsEx(true, rtc(c));
  return true;
}

/** Hands a freshly server-minted token to an open connection. */
export function renewToken(channel: string, token: string): boolean {
  const c = _connections.get(channel);
  if (!c || !_engine) return false;
  return _engine.updateChannelMediaOptionsEx({ token }, rtc(c)) >= 0;
}

/** Leaves one connection. Safe for unknown channels. */
export function leave(channel: string): void {
  const c = _connections.get(channel);
  if (!c) return;
  _connections.delete(channel);
  try {
    _engine?.leaveChannelEx(rtc(c));
  } catch {
    // already gone
  }
}

/** Leaves every connection (go offline, mode switch, logout). */
export function leaveAll(): void {
  for (const ch of [..._connections.keys()]) leave(ch);
}

/** Mutes playback on every listener connection (used for Do Not Disturb). */
export function setPlaybackMuted(muted: boolean): void {
  if (!_engine) return;
  for (const c of _connections.values()) {
    if (c.role === 'listener') _engine.muteAllRemoteAudioStreamsEx(muted, rtc(c));
  }
}

export function openChannels(): string[] {
  return [..._connections.keys()];
}

function destroyEngineSync() {
  const engine = _engine;
  _engine = null;
  _appId = null;
  _connections.clear();
  if (!engine) return;
  try {
    engine.leaveChannel();
    if (_handler) engine.unregisterEventHandler(_handler);
    engine.release();
  } catch {
    // ignore
  } finally {
    _handler = null;
  }
}

/** Fully tears down the engine (logout). The next call re-initializes. */
export async function destroyEngine(): Promise<void> {
  destroyEngineSync();
}

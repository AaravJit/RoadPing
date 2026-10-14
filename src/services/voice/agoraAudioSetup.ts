/**
 * Order-sensitive Agora audio setup (Phase 3, B5), kept pure so Node tests
 * can drive it with a fake engine. agoraVoice.ts passes the real engine and
 * the react-native-agora enum values.
 *
 *  • 'ptt': Apple's PushToTalk framework owns the audio session. Agora must be
 *    told not to touch it (restriction All) BEFORE enableAudio(), so the audio
 *    module never configures or activates the session on its own.
 *  • 'direct' (foreground, no PushToTalk): Agora manages the session
 *    (restriction None) with the loudspeaker as the default route only, so
 *    Bluetooth, CarPlay and wired routes still win when connected.
 *
 * Join options are built here too, so tests can pin down that a listener
 * connection can never publish the microphone, whatever route is connected.
 */

export type AudioMode = 'ptt' | 'direct';

export interface AudioSetupEngine {
  setAudioSessionOperationRestriction(restriction: number): unknown;
  setDefaultAudioRouteToSpeakerphone(defaultToSpeaker: boolean): unknown;
  enableAudio(): unknown;
  disableVideo(): unknown;
}

export interface AudioSetupConstants {
  restrictionAll: number;
  restrictionNone: number;
}

/** Who owns the audio session; safe to call again between connections. */
export function applyAudioMode(engine: AudioSetupEngine, c: AudioSetupConstants, mode: AudioMode): void {
  if (mode === 'ptt') {
    engine.setAudioSessionOperationRestriction(c.restrictionAll);
  } else {
    engine.setAudioSessionOperationRestriction(c.restrictionNone);
    // Default route only: a connected Bluetooth / CarPlay / wired route wins.
    engine.setDefaultAudioRouteToSpeakerphone(true);
  }
}

/**
 * Right after initialize(): session ownership first, then the audio module.
 * Calling enableAudio() first would let Agora set its own category before
 * the PushToTalk restriction applies.
 */
export function prepareEngineAudio(engine: AudioSetupEngine, c: AudioSetupConstants, mode: AudioMode): void {
  applyAudioMode(engine, c, mode);
  engine.disableVideo();
  engine.enableAudio();
}

export interface JoinRoleConstants {
  channelProfileLiveBroadcasting: number;
  clientRoleBroadcaster: number;
  clientRoleAudience: number;
}

/** Speaker: the only connection that publishes the microphone. */
export function speakerJoinOptions(c: JoinRoleConstants) {
  return {
    channelProfile: c.channelProfileLiveBroadcasting,
    clientRoleType: c.clientRoleBroadcaster,
    publishMicrophoneTrack: true,
    publishCameraTrack: false,
    autoSubscribeAudio: false,
    autoSubscribeVideo: false,
  };
}

/** Listener: audience role, never publishes, plays only allowlisted audio. */
export function listenerJoinOptions(c: JoinRoleConstants) {
  return {
    channelProfile: c.channelProfileLiveBroadcasting,
    clientRoleType: c.clientRoleAudience,
    publishMicrophoneTrack: false,
    publishCameraTrack: false,
    autoSubscribeAudio: true,
    autoSubscribeVideo: false,
  };
}

/**
 * JavaScript side of the RoadPing native module (iOS only).
 *
 * The module is absent in Expo Go, on the web and in any build made before
 * Phase 3; every helper here degrades to "unavailable" instead of throwing,
 * and the app falls back to foreground-only voice and location.
 */

import { requireOptionalNativeModule } from 'expo';

interface EventSubscription {
  remove(): void;
}

export type PttAvailability = 'initializing' | 'ready' | 'unavailable' | 'unsupported';

export interface PttState {
  availability: PttAvailability;
  joined: boolean;
  transmitting: boolean;
  restoredAndLeft: boolean;
  incoming: string[];
  token?: string;
}

/** Payload RoadPing's server puts in a PushToTalk push (key "rp", v1). */
export interface PttIncomingPayload {
  v: number;
  tx: string;
  ch: string;
  uid: number;
  suid: number;
  sid: string;
  name: string;
  room: string | null;
  tok: string;
  exp: number;
  end: number;
  app: string;
}

export interface LiveActivityState {
  status: 'live' | 'talking' | 'receiving' | 'reconnecting' | 'voice_off';
  speakerName: string | null;
  contextName: string;
  doNotDisturb: boolean;
}

export interface NativeEvents {
  pttAvailability: (e: { availability: PttAvailability; error?: string }) => void;
  pttJoined: () => void;
  pttJoinFailed: (e: { error: string; code: number }) => void;
  pttLeft: (e: { reason: 'user' | 'app' | 'system' | 'unknown' }) => void;
  pttRestoredAndLeft: () => void;
  pttToken: (e: { token: string; environment: 'development' | 'production' }) => void;
  pttTransmitBegan: (e: { source: 'system_ui' | 'app' | 'handsfree' | 'unknown' }) => void;
  pttTransmitEnded: (e: { source: 'system_ui' | 'app' | 'handsfree' | 'unknown' }) => void;
  pttTransmitFailed: (e: { error: string; code: number }) => void;
  pttAudioActivated: (e: { route: string }) => void;
  pttAudioDeactivated: () => void;
  pttIncoming: (e: PttIncomingPayload) => void;
  pttRemoteExpired: (e: { tx: string }) => void;
  pttError: (e: { op: string; error: string }) => void;
  liveLocationTick: (e: {
    at: number;
    lat?: number;
    lng?: number;
    accuracy?: number;
    ageMs?: number;
    heading?: number;
    speed?: number;
  }) => void;
  liveLocationError: (e: { code: string }) => void;
  liveActivityError: (e: { error: string }) => void;
  liveActivityEndedAtLaunch: (e: { count: number }) => void;
}

interface NativeModuleShape {
  addListener<K extends keyof NativeEvents>(name: K, listener: NativeEvents[K]): EventSubscription;
  pttState(): PttState;
  apnsEnvironment(): 'development' | 'production';
  pttJoin(name: string): Promise<void>;
  pttLeave(): Promise<void>;
  pttBeginTransmitting(): Promise<void>;
  pttStopTransmitting(): Promise<void>;
  pttSetServiceStatus(status: 'ready' | 'connecting' | 'unavailable'): Promise<void>;
  pttSetChannelName(name: string): Promise<void>;
  pttShowRemote(tx: string, name: string, hardEndEpochMs: number): Promise<void>;
  pttRemoteEnded(tx: string): Promise<void>;
  pttClearAllRemote(): Promise<void>;
  locationAuthorization(): Promise<string>;
  locationStart(intervalSeconds: number): Promise<string>;
  locationStop(): Promise<void>;
  locationHasBackgroundMode(): boolean;
  liveActivitySupported(): boolean;
  liveActivityStart(startedAtMs: number, state: LiveActivityState): Promise<boolean>;
  liveActivityUpdate(state: LiveActivityState): Promise<void>;
  liveActivityEnd(finalStatus: string): Promise<void>;
  liveActivityEndAll(): Promise<number>;
}

const native = requireOptionalNativeModule<NativeModuleShape>('RoadPingNative');

/** The native module, or null in Expo Go / pre-Phase-3 builds. */
export const RoadPingNative: NativeModuleShape | null = native ?? null;

export function addNativeListener<K extends keyof NativeEvents>(
  name: K,
  listener: NativeEvents[K],
): { remove(): void } {
  if (!native) return { remove() {} };
  return native.addListener(name, listener);
}

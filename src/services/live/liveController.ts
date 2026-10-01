/**
 * liveController — the single owner of a driver's live session.
 *
 * Phase 3 replaces "leaving the app ends the session" (useAppLifecycleCleanup)
 * with a background live session the driver explicitly started:
 *
 *  • Only Go Live starts a session. A cold launch NEVER resumes or starts
 *    one: recoverAfterLaunch() ends any session a previous run left behind
 *    and tells the driver. There is no automatic "go live while driving".
 *  • Location authorization stays When In Use. Background updates come from
 *    the native module's own CLLocationManager (allowsBackgroundLocationUpdates
 *    + the "location" background mode + the blue location indicator), which
 *    iOS permits under When In Use for a session started in the foreground.
 *    expo-location's background API is not used: it requires Always.
 *  • Heartbeats keep the server-side private-zone check running; a
 *    'session_ended' answer ends everything locally (session, voice, Live
 *    Activity) with the private-zone notice.
 *  • If native background location is unavailable (Expo Go, a build without
 *    the module), the session ends when the app goes to the background, as
 *    before, so a driver never looks live while not reporting.
 *  • A Live Activity shows the session on the Lock Screen, Dynamic Island and
 *    CarPlay; it is ended on stop, private zone, expiry, logout and at launch,
 *    and turns stale on its own if the app stops refreshing it.
 */
import { AppState, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { RoadPingNative, addNativeListener, type LiveActivityState } from '../../../modules/roadping-native';
import { HEARTBEAT_INTERVAL_MS, SESSION_EXPIRY_SECONDS, startLiveSession, stopLiveSession, updateLiveLocation } from '../liveSession';
import { getCurrentCoords, getLocationPermissionStatus, requestLocationPermission, type Coords } from '../location';
import { broadcastRangeFor } from '../units';
import { voiceController, type VoiceSnapshot } from '../voice/voiceController';

export type LiveStatus = 'offline' | 'starting' | 'live' | 'stopping';

export type StopReason = 'user_stopped' | 'app_background' | 'logout';

/** Why the last session ended when the driver did not end it. */
export type EndNotice = 'private_zone' | 'expired' | 'location_off' | 'ended_at_launch' | 'ptt_left' | null;

export interface LiveSnapshot {
  status: LiveStatus;
  sessionId: string | null;
  startedAt: number | null;
  lastHeartbeatAt: number | null;
  /** True while heartbeats are failing (server may soon expire the session). */
  reconnecting: boolean;
  /** True when the session keeps running with the app in the background. */
  backgroundCapable: boolean;
  rangeM: number;
  error: string | null;
  hiddenInZone: boolean;
  endNotice: EndNotice;
  userCoords: Coords | null;
}

const STORAGE_KEY = 'roadping.liveSession.v1';
const HEARTBEAT_SECONDS = HEARTBEAT_INTERVAL_MS / 1000;
/** Re-send the Live Activity this often while live (its stale date is +180 s). */
const ACTIVITY_REFRESH_MS = 60_000;

type Listener = (s: LiveSnapshot) => void;

class LiveController {
  private s: LiveSnapshot = {
    status: 'offline',
    sessionId: null,
    startedAt: null,
    lastHeartbeatAt: null,
    reconnecting: false,
    backgroundCapable: false,
    rangeM: 0,
    error: null,
    hiddenInZone: false,
    endNotice: null,
    userCoords: null,
  };
  private listeners = new Set<Listener>();
  private subs: { remove(): void }[] = [];
  private jsTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatInFlight = false;
  private recovered = false;
  private userId: string | null = null;
  private dnd = false;
  private activityState: LiveActivityState | null = null;
  private activityPushedAt = 0;
  private voiceUnsub: (() => void) | null = null;

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    l(this.s);
    return () => {
      this.listeners.delete(l);
    };
  }

  get snapshot(): LiveSnapshot {
    return this.s;
  }

  private set(patch: Partial<LiveSnapshot>) {
    this.s = { ...this.s, ...patch };
    for (const l of this.listeners) {
      try {
        l(this.s);
      } catch {
        // ignore
      }
    }
  }

  setRangeM(m: number) {
    if (this.s.status === 'offline') this.set({ rangeM: m });
  }

  clearNotices() {
    this.set({ error: null, hiddenInZone: false, endNotice: null });
  }

  /** Profile DND changed (Settings or the Drive toggle). */
  setDnd(dnd: boolean) {
    this.dnd = dnd;
    voiceController.setDnd(dnd);
    this.refreshActivity();
  }

  // ── Cold launch ───────────────────────────────────────────────────────────

  /**
   * Once per process, after auth is known: end whatever live session a
   * previous run left behind. Never resumes it. The native side has already
   * ended any Live Activity and left any restored PushToTalk channel.
   */
  async recoverAfterLaunch(): Promise<void> {
    if (this.recovered) return;
    this.recovered = true;
    let stored: { sessionId?: string } | null = null;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      stored = raw ? (JSON.parse(raw) as { sessionId?: string }) : null;
    } catch {
      stored = null;
    }
    void RoadPingNative?.liveActivityEndAll().catch(() => {});
    if (!stored?.sessionId || this.s.status !== 'offline') return;
    try {
      await stopLiveSession({ session_id: stored.sessionId, reason: 'app_background' });
    } catch {
      // The server expires it within SESSION_EXPIRY_SECONDS anyway.
    }
    await this.clearStored();
    this.set({ endNotice: 'ended_at_launch' });
  }

  private async clearStored() {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  // ── Start ────────────────────────────────────────────────────────────────

  async start(args: { userId: string; vehicleId: string | null; dnd: boolean; rangeM?: number }): Promise<void> {
    if (this.s.status === 'starting' || this.s.status === 'live') return;
    const rangeM = args.rangeM ?? this.s.rangeM;
    this.set({ error: null, hiddenInZone: false, endNotice: null, rangeM });
    const range = broadcastRangeFor(rangeM);
    if (range === null) {
      this.set({ error: 'Ranges now start at ½ mile. Pick a range to go live.' });
      return;
    }
    this.userId = args.userId;
    this.dnd = args.dnd;
    this.set({ status: 'starting' });

    try {
      // When In Use only. RoadPing never asks for Always.
      let perm = await getLocationPermissionStatus();
      if (perm !== 'granted') perm = await requestLocationPermission();
      if (perm !== 'granted') {
        this.set({ status: 'offline', error: 'RoadPing needs location while you are live to show nearby live drivers.' });
        return;
      }

      const coords = await getCurrentCoords();
      this.set({ userCoords: coords });

      const resp = await startLiveSession({
        ...(args.vehicleId ? { vehicle_id: args.vehicleId } : {}),
        range_m: range,
        lat: coords.lat,
        lng: coords.lng,
        ...(coords.heading !== undefined ? { heading: coords.heading } : {}),
        ...(coords.speedMps !== undefined ? { speed_mps: coords.speedMps } : {}),
        ...(coords.accuracyM !== undefined ? { accuracy_m: coords.accuracyM } : {}),
      });

      const now = Date.now();
      try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ sessionId: resp.session_id, startedAt: now }));
      } catch {
        // Without it a crash leaves the session to server expiry (25 s).
      }

      const backgroundCapable = this.startLocation();
      this.set({
        status: 'live',
        sessionId: resp.session_id,
        startedAt: now,
        lastHeartbeatAt: now,
        reconnecting: false,
        backgroundCapable,
      });
      this.wire();
      this.startActivity(now);
      void voiceController.goLive({
        userId: args.userId,
        liveSessionId: resp.session_id,
        dnd: args.dnd,
        roomId: null,
        contextName: 'Nearby',
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to start RoadPing.';
      const inZone = msg.toLowerCase().includes('private zone');
      this.set({ status: 'offline', hiddenInZone: inZone, error: inZone ? null : msg });
    }
  }

  /** Native background-capable location when available, else a JS timer. */
  private startLocation(): boolean {
    const native = RoadPingNative;
    if (native) {
      try {
        // Not awaited by the caller's UI: the result arrives quickly and the
        // JS timer covers the gap.
        void native.locationStart(HEARTBEAT_SECONDS).then((r) => {
          if (r !== 'started' && r !== 'background_unavailable') {
            void this.endLocally('location_off');
            return;
          }
          // Native ticks drive heartbeats from here on (foreground-only when
          // the build lacks the location background mode).
          this.stopJsTimer();
          if (r === 'started') this.set({ backgroundCapable: true });
        }, () => {
          // Native start failed: the JS timer keeps heartbeats going.
        });
        // The JS timer covers the moment until the native result arrives.
        this.startJsTimer();
        return native.locationHasBackgroundMode();
      } catch {
        // fall through to the JS timer
      }
    }
    this.startJsTimer();
    return false;
  }

  private startJsTimer() {
    this.stopJsTimer();
    this.jsTimer = setInterval(() => {
      void (async () => {
        try {
          const fix = await getCurrentCoords();
          await this.heartbeat(fix);
        } catch {
          this.markHeartbeatFailure();
        }
      })();
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopJsTimer() {
    if (this.jsTimer) clearInterval(this.jsTimer);
    this.jsTimer = null;
  }

  private wire() {
    if (this.subs.length > 0) return;
    this.subs.push(
      addNativeListener('liveLocationTick', (e) => {
        if (this.s.status !== 'live') return;
        if (typeof e.lat !== 'number' || typeof e.lng !== 'number') {
          this.markHeartbeatFailure();
          return;
        }
        void this.heartbeat({
          lat: e.lat,
          lng: e.lng,
          ...(typeof e.accuracy === 'number' && e.accuracy > 0 ? { accuracyM: e.accuracy } : {}),
          ...(typeof e.heading === 'number' ? { heading: e.heading } : {}),
          ...(typeof e.speed === 'number' ? { speedMps: e.speed } : {}),
        });
      }),
      addNativeListener('liveLocationError', () => {
        if (this.s.status === 'live') void this.endLocally('location_off');
      }),
      AppState.addEventListener('change', (next: AppStateStatus) => this.onAppState(next)),
    );
    voiceController.onPttLeftByUser(() => {
      if (this.s.status === 'live') void this.stop('user_stopped', 'ptt_left');
    });
    this.voiceUnsub = voiceController.subscribe((v) => this.onVoice(v));
  }

  private unwire() {
    for (const s of this.subs) s.remove();
    this.subs = [];
    this.voiceUnsub?.();
    this.voiceUnsub = null;
    voiceController.onPttLeftByUser(null);
  }

  private onAppState(next: AppStateStatus) {
    if (this.s.status !== 'live') return;
    // iOS 'inactive' (Control Center, a call banner) is not background.
    if (next === 'background' && !this.s.backgroundCapable) {
      void this.stop('app_background');
    }
    if (next === 'active') this.refreshActivity();
  }

  // ── Heartbeat ────────────────────────────────────────────────────────────

  private async heartbeat(fix: Coords) {
    if (this.s.status !== 'live' || this.heartbeatInFlight) return;
    this.heartbeatInFlight = true;
    try {
      this.set({ userCoords: fix });
      const hb = await updateLiveLocation({
        lat: fix.lat,
        lng: fix.lng,
        ...(fix.heading !== undefined ? { heading: fix.heading } : {}),
        ...(fix.speedMps !== undefined ? { speed_mps: fix.speedMps } : {}),
        ...(fix.accuracyM !== undefined ? { accuracy_m: fix.accuracyM } : {}),
      });
      if (this.s.status !== 'live') return;
      if (hb.status === 'session_ended') {
        await this.endLocally('private_zone');
        return;
      }
      const wasReconnecting = this.s.reconnecting;
      this.set({ lastHeartbeatAt: Date.now(), reconnecting: false });
      // Keep the Live Activity's stale date ahead while healthy.
      if (wasReconnecting || Date.now() - this.activityPushedAt > ACTIVITY_REFRESH_MS) this.refreshActivity();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'No active session' || msg === 'Account suspended') {
        await this.endLocally('expired');
      } else {
        this.markHeartbeatFailure();
      }
    } finally {
      this.heartbeatInFlight = false;
    }
  }

  private markHeartbeatFailure() {
    if (this.s.status !== 'live' || this.s.lastHeartbeatAt === null) return;
    const since = Date.now() - this.s.lastHeartbeatAt;
    // The server expires a session SESSION_EXPIRY_SECONDS after its last
    // heartbeat; show "reconnecting" well before that.
    if (!this.s.reconnecting && since > HEARTBEAT_INTERVAL_MS * 1.5) {
      this.set({ reconnecting: true });
      this.refreshActivity();
    }
    if (since > SESSION_EXPIRY_SECONDS * 1000 * 8) {
      // Long outage (several minutes): the server has ended it; stop pretending.
      void this.endLocally('expired');
    }
  }

  // ── Stop ─────────────────────────────────────────────────────────────────

  /** Driver-initiated (or logout / foreground-only background) stop. */
  async stop(reason: StopReason = 'user_stopped', notice: EndNotice = null): Promise<void> {
    if (this.s.status === 'offline' || this.s.status === 'stopping') return;
    const sessionId = this.s.sessionId;
    this.set({ status: 'stopping', hiddenInZone: false });
    await this.teardown('ended');
    try {
      await stopLiveSession(sessionId ? { session_id: sessionId, reason } : { reason });
    } catch {
      // Always go offline locally; the server expires the session.
    }
    await this.clearStored();
    this.set({ ...this.offlinePatch(), endNotice: notice });
  }

  /** The server or the OS ended it (private zone, expiry, location off). */
  private async endLocally(notice: Exclude<EndNotice, null>) {
    if (this.s.status === 'offline') return;
    const sessionId = this.s.sessionId;
    await this.teardown(notice === 'private_zone' ? 'private_zone' : 'ended');
    if (notice !== 'private_zone' && sessionId) {
      // Location off / expired: make sure the server has it ended too.
      stopLiveSession({ session_id: sessionId, reason: 'app_background' }).catch(() => {});
    }
    await this.clearStored();
    this.set({ ...this.offlinePatch(), hiddenInZone: notice === 'private_zone', endNotice: notice });
  }

  private offlinePatch(): Partial<LiveSnapshot> {
    // userCoords is kept so the map stays where it was.
    return { status: 'offline', sessionId: null, startedAt: null, lastHeartbeatAt: null, reconnecting: false, backgroundCapable: false };
  }

  private async teardown(finalStatus: string) {
    this.stopJsTimer();
    this.unwire();
    try {
      await RoadPingNative?.locationStop();
    } catch {
      // ignore
    }
    void RoadPingNative?.liveActivityEnd(finalStatus).catch(() => {});
    this.activityState = null;
    await voiceController.goOffline();
  }

  /** Sign-out: end live, remove PushToTalk tokens, end the Live Activity. */
  async onLogout(): Promise<void> {
    await this.stop('logout');
    await voiceController.forgetAllTokens();
    void RoadPingNative?.liveActivityEndAll().catch(() => {});
    await this.clearStored();
  }

  // ── Live Activity ────────────────────────────────────────────────────────

  private startActivity(startedAt: number) {
    const native = RoadPingNative;
    if (!native || !native.liveActivitySupported()) return;
    const st = this.activityContent(voiceController.snapshot());
    this.activityState = st;
    this.activityPushedAt = Date.now();
    void native.liveActivityStart(startedAt, st).catch(() => {});
  }

  private activityContent(v: VoiceSnapshot): LiveActivityState {
    let status: LiveActivityState['status'] = 'live';
    let speakerName: string | null = null;
    if (this.s.reconnecting) status = 'reconnecting';
    else if (v.tx.phase !== 'idle') status = 'talking';
    else if (v.incoming.length > 0) {
      status = 'receiving';
      speakerName = v.incoming[0]?.speakerName ?? null;
    } else if (v.mode === 'indicator') status = 'voice_off';
    return { status, speakerName, contextName: v.contextName, doNotDisturb: this.dnd };
  }

  private onVoice(v: VoiceSnapshot) {
    if (this.s.status !== 'live' || this.activityState === null) return;
    this.pushActivity(this.activityContent(v));
  }

  private refreshActivity() {
    if (this.s.status !== 'live' || this.activityState === null) return;
    // Re-send even if unchanged: it moves the stale date forward.
    this.activityState = null;
    this.pushActivity(this.activityContent(voiceController.snapshot()));
  }

  private pushActivity(next: LiveActivityState) {
    const prev = this.activityState;
    if (
      prev &&
      prev.status === next.status &&
      prev.speakerName === next.speakerName &&
      prev.contextName === next.contextName &&
      prev.doNotDisturb === next.doNotDisturb
    ) {
      return;
    }
    this.activityState = next;
    this.activityPushedAt = Date.now();
    void RoadPingNative?.liveActivityUpdate(next).catch(() => {});
  }
}

export const liveController = new LiveController();

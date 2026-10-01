/**
 * voiceController — the single owner of RoadPing voice while a driver is live.
 *
 * One active voice context at a time: Nearby, or the one room whose screen is
 * open. The server keeps the same context (voice_set_context) and decides on
 * every press who may hear it; this controller never chooses listeners.
 *
 * Transport modes (decided when the driver goes live):
 *  • 'ptt'      Apple PushToTalk channel joined. Talking and hearing work with
 *               the app in the background, from the Lock Screen / Dynamic
 *               Island system UI, a headset button and CarPlay. The system
 *               owns the audio session; Agora never configures it.
 *  • 'direct'   PushToTalk unavailable (older iOS, simulator, join refused):
 *               voice works only while RoadPing is in the foreground, with
 *               Agora managing the audio session.
 *  • 'indicator' No audio transport (Expo Go or the Agora kill switch): the
 *               button shows a "talking" status only, as before Phase 3.
 *
 * Speaking: transmissionMachine.ts (pure) decides; this file runs its effects.
 * Hearing:  a PushToTalk push (any app state) or, in the foreground, the
 *           Realtime voice_sessions insert, leads to a server listener grant
 *           for that one press. Up to MAX_CONCURRENT_INCOMING at once.
 */
import { AppState, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { RoadPingNative, addNativeListener, type PttIncomingPayload } from '../../../modules/roadping-native';
import * as agora from '../agoraVoice';
import { supabase } from '../supabase';
import { startTalking, stopTalking } from '../voice';
import {
  type PressSource,
  type ReleaseReason,
  type TransportMode,
  type TxEffect,
  type TxEvent,
  type TxState,
  initialTxState,
  reduceTx,
} from './transmissionMachine';
import {
  VoiceApiError,
  beginTransmission,
  confirmTransmission,
  endTransmission,
  listenerGrant,
  registerPttToken,
  setVoiceContext,
  unregisterPttToken,
  type ListenerGrant,
} from './voiceApi';

/** More than this many simultaneous incoming presses are not joined. */
export const MAX_CONCURRENT_INCOMING = 3;
/** A joined incoming press that produces no audio within this is dropped. */
export const NO_AUDIO_TIMEOUT_MS = 10_000;

const INSTALLATION_KEY = 'roadping.installationId';

export type PttChannelStatus = 'off' | 'joining' | 'ready' | 'unavailable';

/** User-facing degraded / error conditions (shown as notices, never silent). */
export type VoiceIssue =
  | 'voice_unavailable' // server has no voice configured, or kill switch
  | 'background_voice_off' // direct mode: voice pauses while the app is in the background
  | 'ptt_unavailable' // PushToTalk could not be joined; foreground-only voice
  | 'not_member' // room voice refused: no longer a member
  | 'network' // a voice request failed
  | 'busy_receiving' // pressed while someone else was talking (half-duplex)
  | 'mic_failed'; // microphone could not start

export interface IncomingVoice {
  transmissionId: string;
  speakerId: string | null;
  speakerName: string | null;
  roomId: string | null;
  status: 'connecting' | 'playing';
}

export interface VoiceSnapshot {
  live: boolean;
  mode: TransportMode;
  ptt: PttChannelStatus;
  roomId: string | null;
  contextName: string;
  dnd: boolean;
  tx: TxState;
  incoming: IncomingVoice[];
  issue: VoiceIssue | null;
}

interface IncomingEntry extends IncomingVoice {
  channel: string | null;
  appId: string | null;
  hardEndAt: number;
  viaPtt: boolean;
  pending: { appId: string; channel: string; uid: number; speakerUid: number; token: string } | null;
  timers: ReturnType<typeof setTimeout>[];
}

type Listener = (s: VoiceSnapshot) => void;
type NameResolver = (userId: string) => string | null;

function uuidv4(): string {
  const bytes = new Uint8Array(16);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const h = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

async function installationId(): Promise<string> {
  try {
    const existing = await AsyncStorage.getItem(INSTALLATION_KEY);
    if (existing) return existing;
    const id = uuidv4();
    await AsyncStorage.setItem(INSTALLATION_KEY, id);
    return id;
  } catch {
    return uuidv4();
  }
}

function codeOf(e: unknown): string {
  return e instanceof VoiceApiError ? e.code : 'network';
}

class VoiceController {
  // Mode is decided at goLive(); nothing native is touched at import time.
  private tx: TxState = initialTxState('indicator');
  private live = false;
  private userId: string | null = null;
  private liveSessionId: string | null = null;
  private roomId: string | null = null;
  private contextName = 'Nearby';
  private dnd = false;
  private ptt: PttChannelStatus = 'off';
  private issue: VoiceIssue | null = null;
  private appActive = AppState.currentState === 'active';
  private incoming = new Map<string, IncomingEntry>();
  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<Listener>();
  private subs: { remove(): void }[] = [];
  private realtime: RealtimeChannel | null = null;
  private pttToken: { token: string; environment: 'development' | 'production' } | null = null;
  private registeredToken: string | null = null;
  private nameResolver: NameResolver = () => null;
  private pttLeftByUserHandler: (() => void) | null = null;
  private wired = false;

  // ── Subscription ──────────────────────────────────────────────────────────

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    l(this.snapshot());
    return () => {
      this.listeners.delete(l);
    };
  }

  snapshot(): VoiceSnapshot {
    return {
      live: this.live,
      mode: this.tx.mode,
      ptt: this.ptt,
      roomId: this.roomId,
      contextName: this.contextName,
      dnd: this.dnd,
      tx: this.tx,
      incoming: [...this.incoming.values()].map(({ transmissionId, speakerId, speakerName, roomId, status }) => ({
        transmissionId,
        speakerId,
        speakerName,
        roomId,
        status,
      })),
      issue: this.issue,
    };
  }

  private notify() {
    const s = this.snapshot();
    for (const l of this.listeners) {
      try {
        l(s);
      } catch {
        // ignore listener errors
      }
    }
  }

  setNameResolver(r: NameResolver) {
    this.nameResolver = r;
  }

  /** Called when the driver leaves the channel from the system PushToTalk UI. */
  onPttLeftByUser(handler: (() => void) | null) {
    this.pttLeftByUserHandler = handler;
  }

  // ── Wiring (native + Agora + AppState), once ──────────────────────────────

  private wire() {
    if (this.wired) return;
    this.wired = true;
    this.subs.push(
      AppState.addEventListener('change', (s: AppStateStatus) => this.onAppState(s)),
      { remove: agora.onAgoraEvent((e) => this.onAgora(e)) },
      addNativeListener('pttJoined', () => {
        this.ptt = 'ready';
        this.setMode('ptt');
        if (this.issue === 'ptt_unavailable' || this.issue === 'background_voice_off') this.issue = null;
        this.notify();
      }),
      addNativeListener('pttJoinFailed', () => this.pttFallback()),
      addNativeListener('pttLeft', (e) => {
        const wasReady = this.ptt === 'ready';
        this.ptt = 'off';
        if (!this.live || !wasReady) return this.notify();
        if (e.reason === 'user') {
          // "Leave" in the system UI means stop going live.
          this.pttLeftByUserHandler?.();
        } else if (e.reason !== 'app') {
          this.pttFallback();
        }
      }),
      addNativeListener('pttToken', (e) => {
        this.pttToken = e;
        void this.registerToken();
      }),
      addNativeListener('pttTransmitBegan', (e) => {
        const source: PressSource = e.source === 'app' ? 'app' : e.source === 'handsfree' ? 'handsfree' : e.source === 'system_ui' ? 'system_ui' : 'unknown';
        this.dispatch({ type: 'SYSTEM_BEGAN', source, clientTxId: uuidv4(), now: Date.now() });
      }),
      addNativeListener('pttTransmitEnded', () => this.dispatch({ type: 'SYSTEM_ENDED' })),
      addNativeListener('pttTransmitFailed', (e) => this.dispatch({ type: 'SYSTEM_FAILED', error: e.error })),
      addNativeListener('pttAudioActivated', () => {
        this.dispatch({ type: 'AUDIO_ACTIVATED' });
        this.joinPendingIncoming();
      }),
      addNativeListener('pttAudioDeactivated', () => {
        this.dispatch({ type: 'AUDIO_DEACTIVATED' });
        for (const id of [...this.incoming.keys()]) this.endIncoming(id, false);
      }),
      addNativeListener('pttIncoming', (p) => this.onPush(p)),
      addNativeListener('pttRemoteExpired', (e) => this.endIncoming(e.tx, false)),
    );
  }

  private pttFallback() {
    this.ptt = RoadPingNative ? 'unavailable' : 'off';
    if (this.tx.mode === 'ptt') this.setMode('direct');
    if (this.live && this.tx.mode === 'direct') this.issue = 'ptt_unavailable';
    void this.unregisterToken();
    this.notify();
  }

  // ── Live lifecycle ────────────────────────────────────────────────────────

  /** Called by liveController after the live session started. */
  async goLive(args: { userId: string; liveSessionId: string; dnd: boolean; roomId: string | null; contextName: string }) {
    this.wire();
    this.live = true;
    this.userId = args.userId;
    this.liveSessionId = args.liveSessionId;
    this.dnd = args.dnd;
    this.roomId = args.roomId;
    this.contextName = args.contextName;
    this.issue = null;
    this.incoming.clear();

    if (!agora.isAgoraAvailable()) {
      this.setMode('indicator');
      this.notify();
      return;
    }
    this.setMode('direct');
    this.subscribeRealtime();
    if (args.roomId !== null) void this.pushContext();

    const native = RoadPingNative;
    const availability = native?.pttState().availability;
    if (native && (availability === 'ready' || availability === 'initializing')) {
      this.ptt = 'joining';
      this.notify();
      try {
        await native.pttJoin(this.channelTitle());
        // pttJoined switches the mode; the token may already be known.
        const st = native.pttState();
        if (st.token && !this.pttToken) {
          this.pttToken = { token: st.token, environment: native.apnsEnvironment() };
        }
        void this.registerToken();
      } catch {
        this.pttFallback();
      }
    } else {
      this.ptt = native ? 'unavailable' : 'off';
      this.notify();
    }
  }

  /** Called by liveController when live ends for any reason. */
  async goOffline() {
    if (!this.live && this.ptt === 'off') return;
    this.live = false;
    this.dispatch({ type: 'RESET' });
    for (const id of [...this.incoming.keys()]) this.endIncoming(id, false);
    agora.leaveAll();
    this.unsubscribeRealtime();
    const native = RoadPingNative;
    if (native && this.ptt !== 'off') {
      try {
        await native.pttLeave();
      } catch {
        // already left
      }
    }
    this.ptt = 'off';
    await this.unregisterToken();
    this.liveSessionId = null;
    this.roomId = null;
    this.contextName = 'Nearby';
    this.issue = null;
    this.setMode('indicator');
    this.notify();
  }

  /** The one active voice context. null = Nearby. */
  async setContext(roomId: string | null, contextName: string) {
    const changed = roomId !== this.roomId;
    this.roomId = roomId;
    this.contextName = contextName;
    if (changed) {
      // Talking into the old context stops; incoming from the old one ends.
      this.dispatch({ type: 'RELEASE', reason: 'interrupted' });
      for (const [id, e] of this.incoming) if (e.roomId !== roomId) this.endIncoming(id, false);
      this.subscribeRealtime();
    }
    if (this.issue === 'not_member') this.issue = null;
    this.notify();
    void RoadPingNative?.pttSetChannelName(this.channelTitle()).catch(() => {});
    if (this.live && changed) await this.pushContext();
  }

  private async pushContext() {
    if (this.tx.mode === 'indicator') return;
    try {
      await setVoiceContext(this.roomId);
    } catch (e) {
      if (codeOf(e) === 'not_member') this.issue = 'not_member';
      this.notify();
    }
  }

  private channelTitle() {
    return this.roomId === null ? 'RoadPing Nearby' : `RoadPing · ${this.contextName}`.slice(0, 60);
  }

  /** Do Not Disturb: no incoming voice. The server excludes this driver too. */
  setDnd(dnd: boolean) {
    if (this.dnd === dnd) return;
    this.dnd = dnd;
    if (dnd) for (const id of [...this.incoming.keys()]) this.endIncoming(id, false);
    this.notify();
  }

  clearIssue() {
    this.issue = null;
    this.notify();
  }

  // ── Talking ───────────────────────────────────────────────────────────────

  press(source: PressSource = 'app') {
    if (!this.live) return;
    if (this.tx.mode === 'direct' && !this.appActive) return;
    this.dispatch({ type: 'PRESS', source, clientTxId: uuidv4(), now: Date.now() });
  }

  release(reason: ReleaseReason = 'released') {
    this.dispatch({ type: 'RELEASE', reason });
  }

  private setMode(mode: TransportMode) {
    this.dispatch({ type: 'SET_MODE', mode });
    if (mode !== 'indicator') agora.setAudioMode(mode === 'ptt' ? 'ptt' : 'direct');
  }

  private dispatch(e: TxEvent) {
    const prev = this.tx;
    const { state, effects } = reduceTx(this.tx, e);
    this.tx = state;
    if (state.error === 'busy_receiving' && prev.error !== 'busy_receiving') this.issue = 'busy_receiving';
    for (const fx of effects) this.run(fx);
    if (state !== prev || effects.length > 0) this.notify();
  }

  private run(fx: TxEffect) {
    const native = RoadPingNative;
    switch (fx.type) {
      case 'ptt.requestBegin':
        if (!native) return this.dispatch({ type: 'SYSTEM_FAILED', error: 'no_native' });
        native.pttBeginTransmitting().catch((err: unknown) =>
          this.dispatch({ type: 'SYSTEM_FAILED', error: String(err) }),
        );
        return;
      case 'ptt.stop':
        void native?.pttStopTransmitting().catch(() => {});
        return;
      case 'server.begin': {
        const id = fx.clientTxId;
        beginTransmission(id).then(
          (grant) => this.dispatch({ type: 'SERVER_BEGAN', clientTxId: id, grant }),
          (err: unknown) => {
            this.noteServerError(err);
            this.dispatch({ type: 'SERVER_FAILED', clientTxId: id, error: codeOf(err) });
          },
        );
        return;
      }
      case 'server.renew': {
        const id = fx.clientTxId;
        beginTransmission(id).then(
          (grant) => this.dispatch({ type: 'TOKEN_RENEWED', clientTxId: id, grant }),
          (err: unknown) => this.dispatch({ type: 'RENEW_FAILED', clientTxId: id, error: codeOf(err) }),
        );
        return;
      }
      case 'server.confirm': {
        const clientTxId = this.tx.clientTxId;
        confirmTransmission(fx.transmissionId).catch((err: unknown) => {
          if (clientTxId) this.dispatch({ type: 'SERVER_FAILED', clientTxId, error: codeOf(err) });
        });
        return;
      }
      case 'server.end':
        endTransmission(fx.transmissionId, fx.reason).catch(() => {
          // The server ends every press at its hard end regardless.
        });
        return;
      case 'indicator.begin':
        if (!this.liveSessionId) return;
        startTalking({
          live_session_id: this.liveSessionId,
          ...(this.roomId !== null ? { room_id: this.roomId } : {}),
        }).catch(() => this.dispatch({ type: 'RELEASE', reason: 'failed' }));
        return;
      case 'indicator.end':
        stopTalking().catch(() => {});
        return;
      case 'agora.publish': {
        const ok = agora.publish({
          appId: fx.grant.appId,
          channel: fx.grant.channel,
          uid: fx.grant.uid,
          token: fx.grant.token,
        });
        if (!ok) this.dispatch({ type: 'AUDIO_FAILED', error: 'join_failed' });
        return;
      }
      case 'agora.renew':
        if (!agora.renewToken(fx.grant.channel, fx.grant.token)) {
          this.dispatch({ type: 'AUDIO_FAILED', error: 'renew_failed' });
        }
        return;
      case 'agora.unpublish':
        agora.leave(fx.channel);
        return;
      case 'timer.start': {
        if (this.holdTimer) clearTimeout(this.holdTimer);
        const id = fx.clientTxId;
        this.holdTimer = setTimeout(() => this.dispatch({ type: 'MAX_HOLD', clientTxId: id }), fx.ms);
        return;
      }
      case 'timer.clear':
        if (this.holdTimer) clearTimeout(this.holdTimer);
        this.holdTimer = null;
        return;
      case 'feedback.denied':
        this.issue = 'busy_receiving';
        return;
    }
  }

  private noteServerError(err: unknown) {
    const code = codeOf(err);
    if (code === 'voice_unavailable') this.issue = 'voice_unavailable';
    else if (code === 'not_member') this.issue = 'not_member';
    else if (code === 'network' || code === 'server') this.issue = 'network';
  }

  // ── Agora events ──────────────────────────────────────────────────────────

  private onAgora(e: agora.AgoraConnectionEvent) {
    const g = this.tx.grant;
    if (g && e.channel === g.channel) {
      if (e.type === 'published') this.dispatch({ type: 'PUBLISHING', transmissionId: g.transmissionId });
      else if (e.type === 'token_will_expire') this.dispatch({ type: 'TOKEN_WILL_EXPIRE' });
      else if (e.type === 'failed') {
        if (e.reason === 'mic_failed') this.issue = 'mic_failed';
        this.dispatch({ type: 'AUDIO_FAILED', error: e.reason });
      }
      return;
    }
    const entry = [...this.incoming.values()].find((x) => x.channel === e.channel);
    if (!entry) return;
    if (e.type === 'audio_started') {
      entry.status = 'playing';
      this.notify();
    } else if (e.type === 'token_will_expire') {
      void this.renewIncoming(entry.transmissionId);
    } else if (e.type === 'speaker_left' || e.type === 'failed') {
      this.endIncoming(entry.transmissionId, true);
    }
  }

  // ── Hearing ───────────────────────────────────────────────────────────────

  private canHear(): boolean {
    return this.live && !this.dnd && this.tx.mode !== 'indicator' && this.incoming.size < MAX_CONCURRENT_INCOMING;
  }

  /** A PushToTalk push for one press (any app state). */
  private onPush(p: PttIncomingPayload) {
    if (this.incoming.has(p.tx)) return;
    if (!this.canHear() || p.room !== this.roomId || p.end * 1000 <= Date.now()) {
      void RoadPingNative?.pttRemoteEnded(p.tx).catch(() => {});
      return;
    }
    this.addIncoming({
      transmissionId: p.tx,
      speakerId: p.sid,
      speakerName: p.name,
      roomId: p.room,
      hardEndAt: p.end * 1000,
      viaPtt: true,
      pending: { appId: p.app, channel: p.ch, uid: p.uid, speakerUid: p.suid, token: p.tok },
    });
    // The native side already made this press the active remote participant,
    // so iOS activates audio; join now if it is already active.
    if (this.tx.audioActive) this.joinPendingIncoming();
  }

  /** Foreground path: Realtime saw a new speaking row in this context. */
  private async onRealtimeSpeaking(row: { id: string; user_id: string; room_id: string | null }) {
    if (!this.canHear() || !this.appActive || row.user_id === this.userId) return;
    if (row.room_id !== this.roomId) return;
    for (const e of this.incoming.values()) if (e.speakerId === row.user_id) return; // push got there first
    let g: ListenerGrant;
    try {
      g = await listenerGrant({ voiceSessionId: row.id });
    } catch {
      return; // denied is normal (out of range, blocked, indicator-only speaker)
    }
    if (this.incoming.has(g.transmissionId) || !this.canHear() || g.roomId !== this.roomId) return;
    const name = this.nameResolver(g.speakerId);
    const viaPtt = this.tx.mode === 'ptt';
    this.addIncoming({
      transmissionId: g.transmissionId,
      speakerId: g.speakerId,
      speakerName: name,
      roomId: g.roomId,
      hardEndAt: Date.parse(g.hardEndAt),
      viaPtt,
      pending: { appId: g.appId, channel: g.channel, uid: g.uid, speakerUid: g.speakerUid, token: g.token },
    });
    if (viaPtt) {
      // Make iOS show the speaker and activate the audio session.
      void RoadPingNative?.pttShowRemote(g.transmissionId, name ?? 'Driver', Date.parse(g.hardEndAt)).catch(() =>
        this.endIncoming(g.transmissionId, false),
      );
      if (this.tx.audioActive) this.joinPendingIncoming();
    } else {
      this.joinPendingIncoming();
    }
  }

  private addIncoming(e: Omit<IncomingEntry, 'status' | 'channel' | 'appId' | 'timers'>) {
    const entry: IncomingEntry = { ...e, status: 'connecting', channel: null, appId: null, timers: [] };
    const untilEnd = Math.max(0, e.hardEndAt - Date.now());
    entry.timers.push(setTimeout(() => this.endIncoming(e.transmissionId, true), untilEnd));
    this.incoming.set(e.transmissionId, entry);
    this.dispatch({ type: 'RECEIVING', count: this.incoming.size });
    this.notify();
  }

  private joinPendingIncoming() {
    for (const entry of this.incoming.values()) {
      if (!entry.pending) continue;
      const p = entry.pending;
      entry.pending = null;
      const ok = agora.listen({ ...p, muted: this.dnd });
      if (!ok) {
        this.endIncoming(entry.transmissionId, true);
        continue;
      }
      entry.channel = p.channel;
      entry.appId = p.appId;
      entry.timers.push(
        setTimeout(() => {
          if (entry.status !== 'playing') this.endIncoming(entry.transmissionId, true);
        }, NO_AUDIO_TIMEOUT_MS),
      );
    }
  }

  private async renewIncoming(txId: string) {
    try {
      const g = await listenerGrant({ transmissionId: txId });
      const entry = this.incoming.get(txId);
      if (!entry || entry.channel !== g.channel || !agora.renewToken(g.channel, g.token)) {
        this.endIncoming(txId, true);
      }
    } catch {
      // Refused (blocked, moved out of range, DND, press over): fail closed.
      this.endIncoming(txId, true);
    }
  }

  private endIncoming(txId: string, tellSystem: boolean) {
    const entry = this.incoming.get(txId);
    if (!entry) return;
    this.incoming.delete(txId);
    for (const t of entry.timers) clearTimeout(t);
    if (entry.channel) agora.leave(entry.channel);
    if (entry.viaPtt && tellSystem) void RoadPingNative?.pttRemoteEnded(txId).catch(() => {});
    this.dispatch({ type: 'RECEIVING', count: this.incoming.size });
    this.notify();
  }

  // ── Realtime (foreground listener path) ───────────────────────────────────

  private subscribeRealtime() {
    this.unsubscribeRealtime();
    if (!this.live || this.tx.mode === 'indicator' || !this.appActive) return;
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    this.realtime = supabase
      .channel(`voice-ctl-${suffix}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'voice_sessions',
          filter: this.roomId !== null ? `room_id=eq.${this.roomId}` : 'room_id=is.null',
        },
        (payload) => {
          const r = payload.new as { id: string; user_id: string; room_id: string | null; is_speaking: boolean; ended_at: string | null };
          if (r.is_speaking && r.ended_at === null) void this.onRealtimeSpeaking(r);
        },
      )
      .subscribe();
  }

  private unsubscribeRealtime() {
    if (this.realtime) void supabase.removeChannel(this.realtime);
    this.realtime = null;
  }

  // ── App state ─────────────────────────────────────────────────────────────

  private onAppState(s: AppStateStatus) {
    // iOS 'inactive' (Control Center, an incoming call banner) is not background.
    if (s === 'inactive') return;
    const active = s === 'active';
    if (active === this.appActive) return;
    this.appActive = active;
    if (!this.live) return;
    if (!active) {
      this.unsubscribeRealtime();
      if (this.tx.mode === 'direct') {
        // Without PushToTalk the app may not keep audio in the background
        // (RoadPing does not use the background audio mode).
        this.dispatch({ type: 'RELEASE', reason: 'interrupted' });
        for (const id of [...this.incoming.keys()]) this.endIncoming(id, false);
        agora.leaveAll();
        this.issue = 'background_voice_off';
        this.notify();
      }
    } else {
      this.subscribeRealtime();
      if (this.issue === 'background_voice_off') this.issue = null;
      this.notify();
    }
  }

  // ── PushToTalk token ──────────────────────────────────────────────────────

  private async registerToken() {
    const t = this.pttToken;
    if (!this.live || !this.liveSessionId || !t || this.ptt === 'off' || this.registeredToken === t.token) return;
    try {
      await registerPttToken({
        installationId: await installationId(),
        liveSessionId: this.liveSessionId,
        token: t.token,
        environment: t.environment,
      });
      this.registeredToken = t.token;
    } catch {
      // Without a token this driver hears others only in the foreground.
    }
  }

  private async unregisterToken() {
    if (this.registeredToken === null) return;
    this.registeredToken = null;
    try {
      await unregisterPttToken(await installationId());
    } catch {
      // The server drops tokens of ended live sessions anyway.
    }
  }

  /** Logout / account deletion: remove every token of this user. */
  async forgetAllTokens() {
    this.registeredToken = null;
    try {
      await unregisterPttToken(null);
    } catch {
      // ignore
    }
  }
}

export const voiceController = new VoiceController();

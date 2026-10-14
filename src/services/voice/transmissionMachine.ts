/**
 * The one transmission state machine for every way of talking: the in-app
 * Hold to Talk button, the system PushToTalk UI (Lock Screen, Dynamic
 * Island), a Bluetooth / wired headset button, and CarPlay.
 *
 * Pure: (state, event) → { state, effects }. voiceController runs the
 * effects (native calls, server calls, Agora). Tested by
 * scripts/client-test/transmissionMachine.test.mjs.
 *
 * Properties the tests hold it to:
 *   • Idempotent: a repeated press while talking, a release while idle, a
 *     second "system began" for the same press, or a late server answer for
 *     a released press never starts or ends anything twice.
 *   • One press at a time; a press from any source joins the same flow.
 *   • Hard maximum hold: MAX_HOLD_MS after the press it releases itself.
 *   • Half-duplex (deliberate, see docs/PHASE3_VOICE_PTT.md): no press while
 *     receiving; Apple's half-duplex PushToTalk mode enforces the same in
 *     the system UI.
 *   • Fail closed: any failure (server refusal, token renewal refused, audio
 *     error, PushToTalk failure) releases and tells the server.
 *   • Audio is published only after the server granted the press AND the
 *     audio session is active (system-activated in PushToTalk mode).
 */

/** Hard ceiling for one press. The server's hard end is 10 s later. */
export const MAX_HOLD_MS = 60_000;

/**
 * ptt:    Apple PushToTalk owns the audio session (works in the background).
 * direct: the app is in the foreground and Agora manages the session.
 * indicator: no audio transport (Expo Go, kill switch): talking status only.
 */
export type TransportMode = 'ptt' | 'direct' | 'indicator';

export type PressSource = 'app' | 'system_ui' | 'handsfree' | 'carplay' | 'unknown';

export type TxPhase = 'idle' | 'requesting' | 'connecting' | 'live';

export interface SpeakerGrant {
  transmissionId: string;
  appId: string;
  channel: string;
  uid: number;
  token: string;
  tokenExpiresAt: string;
  hardEndAt: string;
  roomId: string | null;
}

export type ReleaseReason = 'released' | 'max_hold' | 'failed' | 'interrupted' | 'aborted';

export interface TxState {
  phase: TxPhase;
  mode: TransportMode;
  clientTxId: string | null;
  source: PressSource | null;
  pressedAt: number | null;
  /** PushToTalk reported the transmission began (always true in other modes). */
  systemBegan: boolean;
  /** Audio session ready for recording (system-activated in ptt mode). */
  audioActive: boolean;
  grant: SpeakerGrant | null;
  /** Number of remote transmissions currently being received. */
  receiving: number;
  /** Last failure, cleared by the next accepted press. */
  error: string | null;
  lastRelease: ReleaseReason | null;
}

export type TxEvent =
  | { type: 'PRESS'; source: PressSource; clientTxId: string; now: number }
  | { type: 'RELEASE'; reason?: ReleaseReason }
  | { type: 'SYSTEM_BEGAN'; source: PressSource; clientTxId: string; now: number }
  | { type: 'SYSTEM_ENDED' }
  | { type: 'SYSTEM_FAILED'; error: string }
  | { type: 'AUDIO_ACTIVATED' }
  | { type: 'AUDIO_DEACTIVATED' }
  | { type: 'SERVER_BEGAN'; clientTxId: string; grant: SpeakerGrant }
  | { type: 'SERVER_FAILED'; clientTxId: string; error: string }
  | { type: 'PUBLISHING'; transmissionId: string }
  | { type: 'AUDIO_FAILED'; error: string }
  | { type: 'TOKEN_WILL_EXPIRE' }
  | { type: 'TOKEN_RENEWED'; clientTxId: string; grant: SpeakerGrant }
  | { type: 'RENEW_FAILED'; clientTxId: string; error: string }
  | { type: 'MAX_HOLD'; clientTxId: string }
  | { type: 'RECEIVING'; count: number }
  | { type: 'SET_MODE'; mode: TransportMode }
  | { type: 'RESET' };

export type TxEffect =
  | { type: 'ptt.requestBegin' }
  | { type: 'ptt.stop' }
  | { type: 'server.begin'; clientTxId: string }
  | { type: 'server.renew'; clientTxId: string }
  | { type: 'server.confirm'; transmissionId: string }
  /** transmissionId null ends every open press of this user (catch-all). */
  | { type: 'server.end'; transmissionId: string | null; reason: ReleaseReason }
  | { type: 'indicator.begin' }
  | { type: 'indicator.end' }
  | { type: 'agora.publish'; grant: SpeakerGrant }
  | { type: 'agora.renew'; grant: SpeakerGrant }
  | { type: 'agora.unpublish'; channel: string }
  | { type: 'timer.start'; clientTxId: string; ms: number }
  | { type: 'timer.clear' }
  | { type: 'feedback.denied'; reason: 'receiving' };

export interface TxResult {
  state: TxState;
  effects: TxEffect[];
}

export function initialTxState(mode: TransportMode): TxState {
  return {
    phase: 'idle',
    mode,
    clientTxId: null,
    source: null,
    pressedAt: null,
    systemBegan: false,
    audioActive: false,
    grant: null,
    receiving: 0,
    error: null,
    lastRelease: null,
  };
}

function idle(s: TxState, reason: ReleaseReason | null, error: string | null): TxState {
  return {
    ...s,
    phase: 'idle',
    clientTxId: null,
    source: null,
    pressedAt: null,
    systemBegan: false,
    audioActive: s.mode === 'ptt' ? s.audioActive && s.receiving > 0 : false,
    grant: null,
    error,
    lastRelease: reason,
  };
}

/** Effects that undo whatever a press has started so far. */
function releaseEffects(s: TxState, reason: ReleaseReason, opts: { systemAlreadyEnded: boolean }): TxEffect[] {
  const fx: TxEffect[] = [{ type: 'timer.clear' }];
  if (s.mode === 'ptt' && s.systemBegan && !opts.systemAlreadyEnded) fx.push({ type: 'ptt.stop' });
  if (s.mode === 'ptt' && !s.systemBegan && s.source === 'app' && !opts.systemAlreadyEnded) {
    // Requested but not yet begun: stopping is harmless and prevents a late begin.
    fx.push({ type: 'ptt.stop' });
  }
  if (s.mode === 'indicator') {
    fx.push({ type: 'indicator.end' });
    return fx;
  }
  if (s.grant) fx.push({ type: 'agora.unpublish', channel: s.grant.channel });
  fx.push({ type: 'server.end', transmissionId: s.grant?.transmissionId ?? null, reason });
  return fx;
}

/** Publish once the press is granted and the audio session is ready. */
function maybePublish(s: TxState): TxResult {
  if (s.phase === 'requesting' && s.grant && s.audioActive && s.systemBegan) {
    return { state: { ...s, phase: 'connecting' }, effects: [{ type: 'agora.publish', grant: s.grant }] };
  }
  return { state: s, effects: [] };
}

function startPress(s: TxState, source: PressSource, clientTxId: string, now: number, systemBegan: boolean): TxResult {
  if (s.receiving > 0) {
    return { state: { ...s, error: 'busy_receiving' }, effects: [{ type: 'feedback.denied', reason: 'receiving' }] };
  }
  const next: TxState = {
    ...s,
    phase: 'requesting',
    clientTxId,
    source,
    pressedAt: now,
    systemBegan: s.mode === 'ptt' ? systemBegan : true,
    audioActive: s.mode === 'ptt' ? s.audioActive : true,
    grant: null,
    error: null,
    lastRelease: null,
  };
  const fx: TxEffect[] = [];
  if (s.mode === 'ptt' && !systemBegan) fx.push({ type: 'ptt.requestBegin' });
  fx.push({ type: 'timer.start', clientTxId, ms: MAX_HOLD_MS });
  if (s.mode === 'indicator') {
    fx.push({ type: 'indicator.begin' });
    return { state: { ...next, phase: 'live' }, effects: fx };
  }
  fx.push({ type: 'server.begin', clientTxId });
  return { state: next, effects: fx };
}

export function reduceTx(s: TxState, e: TxEvent): TxResult {
  switch (e.type) {
    case 'PRESS':
      if (s.phase !== 'idle') return { state: s, effects: [] };
      return startPress(s, e.source, e.clientTxId, e.now, false);

    case 'SYSTEM_BEGAN':
      if (s.mode !== 'ptt') return { state: s, effects: [] };
      if (s.phase === 'idle') {
        // Started outside the app: system UI, headset, CarPlay.
        return startPress(s, e.source, e.clientTxId, e.now, true);
      }
      if (s.systemBegan) return { state: s, effects: [] };
      return maybePublish({ ...s, systemBegan: true });

    case 'AUDIO_ACTIVATED': {
      const next = { ...s, audioActive: true };
      return s.phase === 'idle' ? { state: next, effects: [] } : maybePublish(next);
    }

    case 'AUDIO_DEACTIVATED':
      if (s.mode !== 'ptt') return { state: s, effects: [] };
      if (s.phase === 'idle') return { state: { ...s, audioActive: false }, effects: [] };
      // The system took the audio session away mid-press (call, Siri, ...).
      return {
        state: idle({ ...s, audioActive: false }, 'interrupted', 'audio_interrupted'),
        effects: releaseEffects(s, 'interrupted', { systemAlreadyEnded: false }),
      };

    case 'SERVER_BEGAN':
      if (s.phase === 'idle' || e.clientTxId !== s.clientTxId) {
        // Answer for a press already released: make sure it is ended.
        return {
          state: s,
          effects: [{ type: 'server.end', transmissionId: e.grant.transmissionId, reason: 'aborted' }],
        };
      }
      if (s.grant) return { state: s, effects: [] };
      return maybePublish({ ...s, grant: e.grant });

    case 'SERVER_FAILED':
      if (s.phase === 'idle' || e.clientTxId !== s.clientTxId) return { state: s, effects: [] };
      return {
        state: idle(s, 'failed', e.error),
        effects: releaseEffects(s, 'failed', { systemAlreadyEnded: false }),
      };

    case 'PUBLISHING':
      if (s.phase !== 'connecting' || s.grant?.transmissionId !== e.transmissionId) return { state: s, effects: [] };
      return {
        state: { ...s, phase: 'live' },
        effects: [{ type: 'server.confirm', transmissionId: e.transmissionId }],
      };

    case 'AUDIO_FAILED':
      if (s.phase === 'idle') return { state: s, effects: [] };
      return {
        state: idle(s, 'failed', e.error),
        effects: releaseEffects(s, 'failed', { systemAlreadyEnded: false }),
      };

    case 'TOKEN_WILL_EXPIRE':
      if (s.phase === 'idle' || s.mode === 'indicator' || !s.clientTxId || !s.grant) return { state: s, effects: [] };
      return { state: s, effects: [{ type: 'server.renew', clientTxId: s.clientTxId }] };

    case 'TOKEN_RENEWED':
      if (s.phase === 'idle' || e.clientTxId !== s.clientTxId || !s.grant) return { state: s, effects: [] };
      return {
        state: { ...s, grant: { ...s.grant, token: e.grant.token, tokenExpiresAt: e.grant.tokenExpiresAt } },
        effects: [{ type: 'agora.renew', grant: e.grant }],
      };

    case 'RENEW_FAILED':
      if (s.phase === 'idle' || e.clientTxId !== s.clientTxId) return { state: s, effects: [] };
      return {
        state: idle(s, 'failed', e.error),
        effects: releaseEffects(s, 'failed', { systemAlreadyEnded: false }),
      };

    case 'MAX_HOLD':
      if (s.phase === 'idle' || e.clientTxId !== s.clientTxId) return { state: s, effects: [] };
      return {
        state: idle(s, 'max_hold', null),
        effects: releaseEffects(s, 'max_hold', { systemAlreadyEnded: false }),
      };

    case 'RELEASE': {
      if (s.phase === 'idle') return { state: s, effects: [] };
      const reason = e.reason ?? 'released';
      return {
        state: idle(s, reason, null),
        effects: releaseEffects(s, reason, { systemAlreadyEnded: false }),
      };
    }

    case 'SYSTEM_ENDED':
      if (s.mode !== 'ptt' || s.phase === 'idle') return { state: s, effects: [] };
      return {
        state: idle(s, 'released', null),
        effects: releaseEffects(s, 'released', { systemAlreadyEnded: true }),
      };

    case 'SYSTEM_FAILED':
      if (s.mode !== 'ptt' || s.phase === 'idle') return { state: { ...s, error: e.error }, effects: [] };
      return {
        state: idle(s, 'failed', e.error),
        effects: releaseEffects(s, 'failed', { systemAlreadyEnded: true }),
      };

    case 'RECEIVING':
      return { state: { ...s, receiving: Math.max(0, e.count) }, effects: [] };

    case 'SET_MODE':
      if (s.mode === e.mode) return { state: s, effects: [] };
      if (s.phase !== 'idle') {
        const r = reduceTx(s, { type: 'RELEASE', reason: 'interrupted' });
        return { state: { ...r.state, mode: e.mode, audioActive: e.mode !== 'ptt' }, effects: r.effects };
      }
      return { state: { ...s, mode: e.mode, audioActive: e.mode !== 'ptt' ? false : s.audioActive }, effects: [] };

    case 'RESET':
      if (s.phase === 'idle') return { state: { ...initialTxState(s.mode) }, effects: [] };
      return {
        state: { ...idle(s, 'interrupted', null), receiving: 0, audioActive: false },
        effects: releaseEffects(s, 'interrupted', { systemAlreadyEnded: false }),
      };
  }
}

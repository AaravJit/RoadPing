/**
 * Regression tests for the Phase 3 native validation fixes (B1, B2, B5, B6).
 * B4 (server voice allowlist) is covered by the Deno tests in
 * supabase/functions/voice-transmission/handler.test.ts.
 *
 * What these cannot show: that Swift compiles, that Core Location delivers a
 * fix when the distance filter is lifted, or that Agora plays audio inside a
 * PushToTalk session. Those need a native build and the two-iPhone protocol.
 *
 * Run: npm run test:client
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  FIX_MAX_ACCURACY_M,
  FIX_MAX_AGE_MS,
  FIX_MAX_FUTURE_MS,
  FIX_REFRESH_AFTER_MS,
  evaluateFix,
  heartbeatHealth,
  needsRefresh,
} from '../../src/services/live/locationFreshness.ts';
import {
  applyAudioMode,
  listenerJoinOptions,
  prepareEngineAudio,
  speakerJoinOptions,
} from '../../src/services/voice/agoraAudioSetup.ts';
import { PTT_INIT_TIMEOUT_MS, waitForPttReadiness } from '../../src/services/voice/pttReadiness.ts';

const ROOT = new URL('../../', import.meta.url).pathname;
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// Same numbers as src/services/liveSession.ts.
const HEARTBEAT_INTERVAL_MS = 12_000;
const SESSION_EXPIRY_SECONDS = 25;
const SERVER_GRACE_S = 35;

const T0 = Date.parse('2026-10-14T12:00:00Z');
const fixTick = (at, fixAt, extra = {}) => ({ at, fixAt, lat: 37.33, lng: -122.03, accuracy: 35, ...extra });

// ── B2: freshness policy ───────────────────────────────────────────────────

test('B2: a recent, accurate fix is usable and keeps its real timestamp and accuracy', () => {
  const v = evaluateFix(fixTick(T0, T0 - 3_000, { heading: 90, speed: 0 }), T0);
  assert.equal(v.ok, true);
  assert.equal(v.fix.fixAt, T0 - 3_000);
  assert.equal(v.fix.accuracyM, 35);
  assert.equal(v.fix.heading, 90);
  assert.equal(v.fix.speedMps, 0);
});

test('B2: stale coordinates are never reused, however recent the tick', () => {
  assert.deepEqual(evaluateFix(fixTick(T0, T0 - FIX_MAX_AGE_MS - 1), T0), { ok: false, reason: 'too_old' });
  assert.equal(evaluateFix(fixTick(T0, T0 - FIX_MAX_AGE_MS), T0).ok, true, 'boundary is inclusive');
  // Ten-minute-old fix delivered on a fresh tick (the old bug's shape).
  assert.deepEqual(evaluateFix(fixTick(T0, T0 - 600_000), T0), { ok: false, reason: 'too_old' });
});

test('B2: missing, inaccurate, malformed or future fixes fail closed', () => {
  assert.deepEqual(evaluateFix({ at: T0, stale: 'no_fix' }, T0), { ok: false, reason: 'no_fix' });
  assert.deepEqual(evaluateFix({ at: T0 }, T0), { ok: false, reason: 'no_fix' });
  assert.deepEqual(evaluateFix({ at: T0, fixAt: T0 + 60_000, stale: 'future' }, T0), { ok: false, reason: 'future' });
  assert.deepEqual(evaluateFix({ at: T0, fixAt: T0 - 60_000, stale: 'too_old', accuracy: 20 }, T0), { ok: false, reason: 'too_old' });
  assert.deepEqual(evaluateFix(fixTick(T0, T0, { accuracy: FIX_MAX_ACCURACY_M + 1 }), T0), { ok: false, reason: 'inaccurate' });
  assert.equal(evaluateFix(fixTick(T0, T0, { accuracy: FIX_MAX_ACCURACY_M }), T0).ok, true);
  assert.deepEqual(evaluateFix(fixTick(T0, T0, { accuracy: 0 }), T0), { ok: false, reason: 'invalid' });
  assert.deepEqual(evaluateFix(fixTick(T0, T0, { accuracy: undefined }), T0), { ok: false, reason: 'invalid' });
  assert.deepEqual(evaluateFix(fixTick(T0, T0, { lat: 91 }), T0), { ok: false, reason: 'invalid' });
  assert.deepEqual(evaluateFix(fixTick(T0, T0, { lng: Number.NaN }), T0), { ok: false, reason: 'invalid' });
  assert.deepEqual(evaluateFix(fixTick(T0, undefined), T0), { ok: false, reason: 'invalid' });
  assert.deepEqual(evaluateFix(fixTick(T0, T0 + FIX_MAX_FUTURE_MS + 1), T0), { ok: false, reason: 'future' });
});

test('B2: refresh starts well before a fix becomes unusable', () => {
  assert.ok(FIX_REFRESH_AFTER_MS + HEARTBEAT_INTERVAL_MS < FIX_MAX_AGE_MS, 'one tick of slack after a refresh starts');
  assert.ok(FIX_MAX_AGE_MS < (SESSION_EXPIRY_SECONDS + SERVER_GRACE_S) * 1000, 'stale cut-off is inside server expiry');
  assert.equal(needsRefresh(null), true, 'no fix yet');
  assert.equal(needsRefresh(FIX_REFRESH_AFTER_MS), false);
  assert.equal(needsRefresh(FIX_REFRESH_AFTER_MS + 1), true);
});

/**
 * A model of the native loop (RoadPingLiveLocation.swift): a tick every 12 s;
 * Core Location delivers a fix only after moving 50 m, or while the distance
 * filter is lifted (if `deliversWhenRefreshing`). Returns heartbeat times the
 * client would send. This checks the policy's arithmetic, not iOS itself.
 */
function simulate({ minutes, moving = () => false, deliversWhenRefreshing = () => true }) {
  let lastFixAt = T0;
  let refreshing = false;
  const heartbeats = [T0];
  let lastHeartbeat = T0;
  const health = [];
  const onTick = (now) => {
    const v = evaluateFix(fixTick(now, lastFixAt), now);
    if (v.ok) {
      heartbeats.push(now);
      lastHeartbeat = now;
    }
    health.push(heartbeatHealth(now - lastHeartbeat, HEARTBEAT_INTERVAL_MS, SESSION_EXPIRY_SECONDS));
    if (needsRefresh(now - lastFixAt)) refreshing = true;
  };
  for (let t = T0 + HEARTBEAT_INTERVAL_MS; t <= T0 + minutes * 60_000; t += HEARTBEAT_INTERVAL_MS) {
    onTick(t);
    const deliveryAt = t + 1_000;
    if (moving(t) || (refreshing && deliversWhenRefreshing(t))) {
      lastFixAt = deliveryAt;
      if (refreshing) {
        refreshing = false;
        onTick(deliveryAt); // native reports a recovered fix at once
      }
    }
  }
  const end = T0 + minutes * 60_000;
  const gaps = [...heartbeats.slice(1), end].map((h, i) => h - heartbeats[i]);
  return { heartbeats, maxGap: Math.max(...gaps), health };
}

test('B2: a parked phone stays live for 10+ minutes on genuinely fresh fixes', () => {
  const r = simulate({ minutes: 12 });
  assert.ok(r.heartbeats.length > 50, `heartbeats: ${r.heartbeats.length}`);
  assert.ok(r.maxGap <= HEARTBEAT_INTERVAL_MS, `max gap ${r.maxGap} ms`);
  assert.ok(r.maxGap < (SESSION_EXPIRY_SECONDS + SERVER_GRACE_S) * 1000, 'never past server expiry');
  assert.ok(!r.health.includes('expired'));
});

test('B2: without the refresh (the old behavior) a parked session would lapse', () => {
  const r = simulate({ minutes: 12, deliversWhenRefreshing: () => false });
  assert.ok(r.maxGap > (SESSION_EXPIRY_SECONDS + SERVER_GRACE_S) * 1000, 'server would expire it');
  assert.ok(r.health.includes('expired'), 'client stops claiming to be live');
});

test('B2: location failure fails closed, then recovers when fixes return', () => {
  const outageStart = T0 + 3 * 60_000;
  const outageEnd = T0 + 3 * 60_000 + 90_000; // 90 s without any new fix
  const r = simulate({ minutes: 8, deliversWhenRefreshing: (t) => t < outageStart || t > outageEnd });
  const during = r.heartbeats.filter((h) => h > outageStart + FIX_MAX_AGE_MS && h < outageEnd);
  assert.equal(during.length, 0, 'no heartbeat from a stale fix');
  assert.ok(r.heartbeats.some((h) => h > outageEnd), 'heartbeats resume');
  assert.ok(r.health.includes('reconnecting'), 'shows reconnecting during the outage');
});

test('B2: heartbeat health thresholds', () => {
  const h = (ms) => heartbeatHealth(ms, HEARTBEAT_INTERVAL_MS, SESSION_EXPIRY_SECONDS);
  assert.equal(h(12_000), 'ok');
  assert.equal(h(18_001), 'reconnecting');
  assert.equal(h(200_000), 'reconnecting');
  assert.equal(h(200_001), 'expired');
});

test('B2: Swift mirrors the policy numbers and refreshes via the distance filter', () => {
  const swift = read('modules/roadping-native/ios/RoadPingLiveLocation.swift');
  const num = (name) => Number(swift.match(new RegExp(`let ${name}: [A-Za-z]+ = ([0-9.]+)`))?.[1]);
  assert.equal(num('maxFixAge') * 1000, FIX_MAX_AGE_MS);
  assert.equal(num('refreshAfter') * 1000, FIX_REFRESH_AFTER_MS);
  assert.equal(num('maxAccuracy'), FIX_MAX_ACCURACY_M);
  assert.equal(num('maxFuture') * 1000, FIX_MAX_FUTURE_MS);
  assert.match(swift, /distanceFilter = kCLDistanceFilterNone/);
  assert.match(swift, /distanceFilter = normalDistanceFilter/);
  // Apple: requestLocation() does nothing while updates are running.
  assert.ok(!/\.requestLocation\(\)/.test(swift));
  // Coordinates are attached only on the fresh-and-accurate branch.
  const tick = swift.slice(swift.indexOf('private func tick()'), swift.indexOf('private func beginRefresh()'));
  const coordsAt = tick.indexOf('body["lat"]');
  for (const why of ['"future"', '"too_old"', '"inaccurate"']) assert.ok(coordsAt > tick.indexOf(why), why);
  assert.match(tick, /body\["fixAt"\]/);
});

test('B2: liveController judges every tick with the policy before a heartbeat', () => {
  const ctl = read('src/services/live/liveController.ts');
  const listener = ctl.slice(ctl.indexOf("addNativeListener('liveLocationTick'"), ctl.indexOf("addNativeListener('liveLocationError'"));
  assert.match(listener, /evaluateFix\(e, Date\.now\(\)\)/);
  assert.ok(listener.indexOf('markHeartbeatFailure') < listener.indexOf('this.heartbeat('));
  assert.ok(!/e\.lat/.test(listener), 'never reads raw tick coordinates');
  assert.match(ctl, /heartbeatHealth\(/);
});

// ── B1: iOS availability ───────────────────────────────────────────────────

test('B1: iOS 17-only APIs are called only under an iOS 17 availability check', () => {
  const ios17 = ['setAccessoryButtonEventsEnabled', 'CLBackgroundActivitySession()'];
  const files = [
    'modules/roadping-native/ios/RoadPingPTT.swift',
    'modules/roadping-native/ios/RoadPingLiveLocation.swift',
  ];
  for (const f of files) {
    const lines = read(f).split('\n');
    lines.forEach((line, i) => {
      if (line.trim().startsWith('//')) return;
      for (const api of ios17) {
        if (!line.includes(api)) continue;
        const before = lines.slice(Math.max(0, i - 4), i).join('\n');
        assert.match(before, /#available\(iOS 17\.0, \*\)/, `${f}:${i + 1} ${api}`);
      }
    });
  }
});

// ── B5: Agora audio-session order ──────────────────────────────────────────

const C = { restrictionAll: 128, restrictionNone: 0 };
function fakeEngine() {
  const calls = [];
  return {
    calls,
    setAudioSessionOperationRestriction: (r) => calls.push(`restrict:${r}`),
    setDefaultAudioRouteToSpeakerphone: (on) => calls.push(`defaultSpeaker:${on}`),
    enableAudio: () => calls.push('enableAudio'),
    disableVideo: () => calls.push('disableVideo'),
  };
}

test('B5: PushToTalk mode restricts Agora before its audio module starts', () => {
  const e = fakeEngine();
  prepareEngineAudio(e, C, 'ptt');
  assert.deepEqual(e.calls, ['restrict:128', 'disableVideo', 'enableAudio']);
  assert.ok(!e.calls.some((c) => c.startsWith('defaultSpeaker')), 'no route change under PushToTalk');
});

test('B5: direct mode lets Agora manage the session with speaker as default route only', () => {
  const e = fakeEngine();
  prepareEngineAudio(e, C, 'direct');
  assert.deepEqual(e.calls, ['restrict:0', 'defaultSpeaker:true', 'disableVideo', 'enableAudio']);
  const agora = read('src/services/agoraVoice.ts');
  assert.ok(!/\.setEnableSpeakerphone\(/.test(agora), 'never forces the built-in speaker over Bluetooth/CarPlay');
});

test('B5: switching modes between connections re-applies ownership', () => {
  const e = fakeEngine();
  applyAudioMode(e, C, 'direct');
  applyAudioMode(e, C, 'ptt');
  assert.deepEqual(e.calls, ['restrict:0', 'defaultSpeaker:true', 'restrict:128']);
});

test('B5: agoraVoice uses the ordered setup and never enables audio itself', () => {
  const agora = read('src/services/agoraVoice.ts');
  assert.match(agora, /prepareEngineAudio\(engine, audioConstants\(mod\), _mode\)/);
  assert.ok(!/engine\.enableAudio\(\)/.test(agora));
  assert.ok(agora.indexOf('engine.initialize(') < agora.indexOf('prepareEngineAudio(engine'));
});

test('a listener connection can never publish the microphone (no accidental transmit on any route)', () => {
  const R = { channelProfileLiveBroadcasting: 1, clientRoleBroadcaster: 1, clientRoleAudience: 2 };
  const l = listenerJoinOptions(R);
  assert.equal(l.publishMicrophoneTrack, false);
  assert.equal(l.clientRoleType, R.clientRoleAudience);
  assert.equal(l.publishCameraTrack, false);
  const s = speakerJoinOptions(R);
  assert.equal(s.publishMicrophoneTrack, true);
  assert.equal(s.autoSubscribeAudio, false);
  const agora = read('src/services/agoraVoice.ts');
  const listen = agora.slice(agora.indexOf('export function listen('), agora.indexOf('export function renewToken('));
  assert.match(listen, /listenerJoinOptions\(/);
  assert.ok(!/publishMicrophoneTrack: true/.test(agora), 'only the shared builder sets publishing');
});

// ── B6: PushToTalk initialization ──────────────────────────────────────────

function fakePtt(initial) {
  let cbs = [];
  const timers = [];
  return {
    cbs: () => cbs,
    timers,
    fire: (a) => [...cbs].forEach((cb) => cb(a)),
    deps: (overrides = {}) => ({
      current: () => initial,
      onAvailability: (cb) => {
        cbs.push(cb);
        return () => {
          cbs = cbs.filter((x) => x !== cb);
        };
      },
      setTimer: (cb, ms) => {
        const t = { cb, ms, cleared: false };
        timers.push(t);
        return t;
      },
      clearTimer: (t) => {
        t.cleared = true;
      },
      ...overrides,
    }),
  };
}

test('B6: already-initialized results resolve at once, with no timer left behind', async () => {
  for (const a of ['ready', 'unavailable', 'unsupported']) {
    const f = fakePtt(a);
    assert.equal(await waitForPttReadiness(f.deps()), a);
    assert.equal(f.cbs().length, 0, 'unsubscribed');
    assert.equal(f.timers.length, 0, 'no timer');
  }
});

test('B6: Go Live during initialization waits for the native result', async () => {
  const f = fakePtt('initializing');
  const p = waitForPttReadiness(f.deps());
  assert.equal(f.timers[0]?.ms, PTT_INIT_TIMEOUT_MS);
  f.fire('initializing');
  f.fire('ready');
  assert.equal(await p, 'ready');
  assert.equal(f.timers[0].cleared, true);
  assert.equal(f.cbs().length, 0);
});

test('B6: an initialization failure is reported, not hidden', async () => {
  const f = fakePtt('initializing');
  const p = waitForPttReadiness(f.deps());
  f.fire('unavailable');
  assert.equal(await p, 'unavailable');
});

test('B6: a slow initialization times out instead of hanging', async () => {
  const f = fakePtt('initializing');
  const p = waitForPttReadiness(f.deps());
  f.timers[0].cb();
  assert.equal(await p, 'timeout');
  f.fire('ready'); // late result after the timeout changes nothing
  assert.equal(f.cbs().length, 0);
});

test('B6: a result that lands between subscribing and reading is not missed', async () => {
  const f = fakePtt('initializing');
  const p = waitForPttReadiness(
    f.deps({
      current: () => {
        f.fire('ready');
        return 'initializing';
      },
    }),
  );
  assert.equal(await p, 'ready');
  assert.equal(f.timers.length, 0);
});

test('B6: a native error reading the state counts as unavailable', async () => {
  const f = fakePtt('initializing');
  const p = waitForPttReadiness(
    f.deps({
      current: () => {
        throw new Error('bridge');
      },
    }),
  );
  assert.equal(await p, 'unavailable');
});

test('B6: voiceController claims PushToTalk only after the system confirms the join', () => {
  const vc = read('src/services/voice/voiceController.ts');
  // 'ready' is set only in the pttJoined handler.
  const readySets = [...vc.matchAll(/this\.ptt = 'ready'/g)];
  assert.equal(readySets.length, 1);
  const joined = vc.slice(vc.indexOf("addNativeListener('pttJoined'"), vc.indexOf("addNativeListener('pttJoinFailed'"));
  assert.match(joined, /this\.ptt = 'ready'/);
  assert.match(joined, /setMode\('ptt'\)/);
  // Join waits for readiness; no join on 'initializing'.
  const joinPtt = vc.slice(vc.indexOf('private async joinPtt('), vc.indexOf('private clearJoinTimer('));
  assert.ok(joinPtt.indexOf('waitForPttReadiness(') < joinPtt.indexOf('native.pttJoin('));
  assert.match(joinPtt, /readiness !== 'ready'[\s\S]*this\.pttFallback\(\)/);
  assert.match(joinPtt, /PTT_JOIN_TIMEOUT_MS/);
  assert.ok(!/availability === 'initializing'/.test(vc));
  // Tokens are registered only for a confirmed channel.
  assert.match(vc, /this\.ptt !== 'ready' \|\| this\.registeredToken === t\.token\) return;/);
  // Fallback is visible.
  const fb = vc.slice(vc.indexOf('private pttFallback()'), vc.indexOf('// ── Live lifecycle'));
  assert.match(fb, /this\.issue = 'ptt_unavailable'/);
});

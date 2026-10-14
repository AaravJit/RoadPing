/**
 * Tests for src/services/voice/transmissionMachine.ts (Phase 3).
 * Run: npm run test:client   (Node 22.18+: imports the .ts module with
 * built-in type stripping; no dependencies)
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MAX_HOLD_MS, initialTxState, reduceTx } from '../../src/services/voice/transmissionMachine.ts';

const grant = (id = 'tx-1', token = 't1') => ({
  transmissionId: id,
  appId: 'app',
  channel: `rpt_${id}`,
  uid: 7,
  token,
  tokenExpiresAt: '2026-10-01T00:00:45Z',
  hardEndAt: '2026-10-01T00:01:10Z',
  roomId: null,
});

/** Applies events in order; returns final state and all effects. */
function run(state, events) {
  const effects = [];
  for (const e of events) {
    const r = reduceTx(state, e);
    state = r.state;
    effects.push(...r.effects);
  }
  return { state, effects };
}

const types = (fx) => fx.map((f) => f.type);
const press = (id = 'c1', source = 'app') => ({ type: 'PRESS', source, clientTxId: id, now: 1000 });

// ── direct mode (foreground, Agora manages audio) ──────────────────────────

test('direct: press → server.begin + max-hold timer; grant → publish; publishing → confirm', () => {
  let { state, effects } = run(initialTxState('direct'), [press()]);
  assert.equal(state.phase, 'requesting');
  assert.deepEqual(types(effects), ['timer.start', 'server.begin']);
  assert.equal(effects[0].ms, MAX_HOLD_MS);
  assert.equal(MAX_HOLD_MS, 60_000);

  ({ state, effects } = run(state, [{ type: 'SERVER_BEGAN', clientTxId: 'c1', grant: grant() }]));
  assert.equal(state.phase, 'connecting');
  assert.deepEqual(types(effects), ['agora.publish']);

  ({ state, effects } = run(state, [{ type: 'PUBLISHING', transmissionId: 'tx-1' }]));
  assert.equal(state.phase, 'live');
  assert.deepEqual(effects, [{ type: 'server.confirm', transmissionId: 'tx-1' }]);
});

test('direct: release ends audio and the server press exactly once', () => {
  const live = run(initialTxState('direct'), [
    press(),
    { type: 'SERVER_BEGAN', clientTxId: 'c1', grant: grant() },
    { type: 'PUBLISHING', transmissionId: 'tx-1' },
  ]).state;
  const { state, effects } = run(live, [{ type: 'RELEASE' }, { type: 'RELEASE' }]);
  assert.equal(state.phase, 'idle');
  assert.deepEqual(types(effects), ['timer.clear', 'agora.unpublish', 'server.end']);
  assert.deepEqual(effects[2], { type: 'server.end', transmissionId: 'tx-1', reason: 'released' });
});

test('idempotent: a second press while talking does nothing', () => {
  const s1 = run(initialTxState('direct'), [press('c1')]).state;
  const { state, effects } = run(s1, [press('c2')]);
  assert.equal(state, s1);
  assert.deepEqual(effects, []);
});

test('idempotent: release while idle does nothing', () => {
  const s0 = initialTxState('direct');
  const { state, effects } = run(s0, [{ type: 'RELEASE' }]);
  assert.equal(state, s0);
  assert.deepEqual(effects, []);
});

test('released before the server answered: the late grant is ended as aborted, nothing publishes', () => {
  const { state, effects } = run(initialTxState('direct'), [
    press('c1'),
    { type: 'RELEASE' },
    { type: 'SERVER_BEGAN', clientTxId: 'c1', grant: grant() },
  ]);
  assert.equal(state.phase, 'idle');
  assert.ok(!types(effects).includes('agora.publish'));
  assert.deepEqual(effects.at(-1), { type: 'server.end', transmissionId: 'tx-1', reason: 'aborted' });
  // The release itself ended "any open press" because no grant was known yet.
  assert.ok(effects.some((f) => f.type === 'server.end' && f.transmissionId === null));
});

test('a grant for an older press is aborted, not used', () => {
  const { state, effects } = run(initialTxState('direct'), [
    press('c2'),
    { type: 'SERVER_BEGAN', clientTxId: 'c1', grant: grant('old') },
  ]);
  assert.equal(state.grant, null);
  assert.deepEqual(effects.at(-1), { type: 'server.end', transmissionId: 'old', reason: 'aborted' });
});

test('duplicate SERVER_BEGAN for the same press publishes once', () => {
  const { effects } = run(initialTxState('direct'), [
    press(),
    { type: 'SERVER_BEGAN', clientTxId: 'c1', grant: grant() },
    { type: 'SERVER_BEGAN', clientTxId: 'c1', grant: grant() },
  ]);
  assert.equal(types(effects).filter((t) => t === 'agora.publish').length, 1);
});

test('max hold releases with reason max_hold; a stale timer is ignored', () => {
  const s = run(initialTxState('direct'), [press('c1'), { type: 'SERVER_BEGAN', clientTxId: 'c1', grant: grant() }]).state;
  const stale = run(s, [{ type: 'MAX_HOLD', clientTxId: 'other' }]);
  assert.equal(stale.state, s);
  const { state, effects } = run(s, [{ type: 'MAX_HOLD', clientTxId: 'c1' }]);
  assert.equal(state.phase, 'idle');
  assert.equal(state.lastRelease, 'max_hold');
  assert.deepEqual(effects.at(-1), { type: 'server.end', transmissionId: 'tx-1', reason: 'max_hold' });
});

test('fail closed: server refusal, renewal refusal and audio failure all release', () => {
  for (const ev of [
    { type: 'SERVER_FAILED', clientTxId: 'c1', error: 'not_member' },
    { type: 'RENEW_FAILED', clientTxId: 'c1', error: 'denied' },
    { type: 'AUDIO_FAILED', error: 'banned' },
  ]) {
    const base =
      ev.type === 'SERVER_FAILED'
        ? run(initialTxState('direct'), [press('c1')]).state
        : run(initialTxState('direct'), [press('c1'), { type: 'SERVER_BEGAN', clientTxId: 'c1', grant: grant() }]).state;
    const { state, effects } = run(base, [ev]);
    assert.equal(state.phase, 'idle', ev.type);
    assert.equal(state.lastRelease, 'failed', ev.type);
    assert.ok(types(effects).includes('server.end'), ev.type);
  }
});

test('token renewal: will-expire asks the server; renewed token goes to Agora', () => {
  const s = run(initialTxState('direct'), [
    press('c1'),
    { type: 'SERVER_BEGAN', clientTxId: 'c1', grant: grant() },
    { type: 'PUBLISHING', transmissionId: 'tx-1' },
  ]).state;
  let r = reduceTx(s, { type: 'TOKEN_WILL_EXPIRE' });
  assert.deepEqual(r.effects, [{ type: 'server.renew', clientTxId: 'c1' }]);
  r = reduceTx(s, { type: 'TOKEN_RENEWED', clientTxId: 'c1', grant: grant('tx-1', 't2') });
  assert.equal(r.state.grant.token, 't2');
  assert.deepEqual(types(r.effects), ['agora.renew']);
  // A renewal for an old press is ignored.
  r = reduceTx(s, { type: 'TOKEN_RENEWED', clientTxId: 'zz', grant: grant('tx-1', 't3') });
  assert.equal(r.state, s);
});

// ── half duplex ────────────────────────────────────────────────────────────

test('half-duplex: a press while receiving is refused with feedback, no server call', () => {
  const s = run(initialTxState('direct'), [{ type: 'RECEIVING', count: 1 }]).state;
  const { state, effects } = run(s, [press()]);
  assert.equal(state.phase, 'idle');
  assert.equal(state.error, 'busy_receiving');
  assert.deepEqual(types(effects), ['feedback.denied']);
});

// ── PushToTalk mode ────────────────────────────────────────────────────────

test('ptt app press: asks the system first; publishes only after system began AND audio active AND grant', () => {
  let { state, effects } = run(initialTxState('ptt'), [press()]);
  assert.deepEqual(types(effects), ['ptt.requestBegin', 'timer.start', 'server.begin']);
  ({ state, effects } = run(state, [{ type: 'SERVER_BEGAN', clientTxId: 'c1', grant: grant() }]));
  assert.deepEqual(effects, []);
  ({ state, effects } = run(state, [{ type: 'SYSTEM_BEGAN', source: 'app', clientTxId: 'x', now: 1 }]));
  assert.deepEqual(effects, []);
  ({ state, effects } = run(state, [{ type: 'AUDIO_ACTIVATED' }]));
  assert.deepEqual(types(effects), ['agora.publish']);
  assert.equal(state.phase, 'connecting');
});

test('ptt press from the system UI / headset / CarPlay starts the same flow', () => {
  const { state, effects } = run(initialTxState('ptt'), [
    { type: 'SYSTEM_BEGAN', source: 'handsfree', clientTxId: 'h1', now: 5 },
  ]);
  assert.equal(state.phase, 'requesting');
  assert.equal(state.source, 'handsfree');
  assert.equal(state.systemBegan, true);
  assert.deepEqual(types(effects), ['timer.start', 'server.begin']);
});

test('ptt: system ended releases without asking the system to stop again', () => {
  const s = run(initialTxState('ptt'), [
    { type: 'SYSTEM_BEGAN', source: 'system_ui', clientTxId: 's1', now: 5 },
    { type: 'AUDIO_ACTIVATED' },
    { type: 'SERVER_BEGAN', clientTxId: 's1', grant: grant() },
  ]).state;
  const { state, effects } = run(s, [{ type: 'SYSTEM_ENDED' }]);
  assert.equal(state.phase, 'idle');
  assert.ok(!types(effects).includes('ptt.stop'));
  assert.ok(types(effects).includes('agora.unpublish'));
  assert.ok(types(effects).includes('server.end'));
});

test('ptt: app release stops the system transmission', () => {
  const s = run(initialTxState('ptt'), [press(), { type: 'SYSTEM_BEGAN', source: 'app', clientTxId: 'x', now: 1 }]).state;
  const { effects } = run(s, [{ type: 'RELEASE' }]);
  assert.ok(types(effects).includes('ptt.stop'));
});

test('ptt: losing the audio session mid-press (call, Siri) releases as interrupted', () => {
  const s = run(initialTxState('ptt'), [
    press(),
    { type: 'SYSTEM_BEGAN', source: 'app', clientTxId: 'x', now: 1 },
    { type: 'AUDIO_ACTIVATED' },
  ]).state;
  const { state, effects } = run(s, [{ type: 'AUDIO_DEACTIVATED' }]);
  assert.equal(state.phase, 'idle');
  assert.equal(state.lastRelease, 'interrupted');
  assert.ok(types(effects).includes('server.end'));
});

test('ptt: system failure to begin releases and does not call stop', () => {
  const s = run(initialTxState('ptt'), [press()]).state;
  const { state, effects } = run(s, [{ type: 'SYSTEM_FAILED', error: 'x' }]);
  assert.equal(state.phase, 'idle');
  assert.ok(!types(effects).includes('ptt.stop'));
});

test('SYSTEM_* events are ignored outside ptt mode', () => {
  const s = initialTxState('direct');
  assert.equal(reduceTx(s, { type: 'SYSTEM_BEGAN', source: 'app', clientTxId: 'a', now: 1 }).state, s);
  assert.equal(reduceTx(s, { type: 'SYSTEM_ENDED' }).state, s);
});

// ── indicator mode (no audio transport) ─────────────────────────────────────

test('indicator: press shows talking status only, no Agora, no voice-transmission call', () => {
  const { state, effects } = run(initialTxState('indicator'), [press(), { type: 'RELEASE' }]);
  assert.equal(state.phase, 'idle');
  assert.deepEqual(types(effects), ['timer.start', 'indicator.begin', 'timer.clear', 'indicator.end']);
});

// ── mode switch / reset ─────────────────────────────────────────────────────

test('switching mode mid-press releases it first', () => {
  const s = run(initialTxState('direct'), [press(), { type: 'SERVER_BEGAN', clientTxId: 'c1', grant: grant() }]).state;
  const { state, effects } = run(s, [{ type: 'SET_MODE', mode: 'ptt' }]);
  assert.equal(state.mode, 'ptt');
  assert.equal(state.phase, 'idle');
  assert.ok(types(effects).includes('server.end'));
});

test('reset (go offline) ends an open press and clears receiving', () => {
  const s = run(initialTxState('direct'), [press(), { type: 'RECEIVING', count: 0 }]).state;
  const { state, effects } = run(s, [{ type: 'RESET' }]);
  assert.equal(state.phase, 'idle');
  assert.equal(state.receiving, 0);
  assert.ok(types(effects).includes('server.end'));
});

/**
 * Adversarial tests for voice-transmission, ptt-token and the shared APNs /
 * Agora token helpers (Phase 3). Not deployed (nothing imports it). Run:
 *   deno test --config <deno.json> supabase/functions/voice-transmission/handler.test.ts
 * (see docs/PHASE3_VOICE_PTT.md → Validation for the import map).
 */

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { fanOut, handleVoiceTransmission, type VoiceDeps } from './handler.ts';
import { handlePttToken } from '../ptt-token/handler.ts';
import {
  buildPttRequest,
  classifyApnsResponse,
  providerToken,
  resetProviderTokenCache,
  signProviderToken,
} from '../_shared/apns.ts';
import { mintVoiceToken, voiceTokenTtlSeconds } from '../_shared/agoraToken.ts';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
function assertEquals(a: unknown, b: unknown, msg: string) {
  const ja = JSON.stringify(a);
  const jb = JSON.stringify(b);
  if (ja !== jb) throw new Error(`${msg}\n  actual:   ${ja}\n  expected: ${jb}`);
}

const NOW = Date.parse('2026-10-01T12:00:00Z');
const HARD_END = '2026-10-01T12:01:10+00:00';
const TX = '11111111-1111-4111-8111-111111111111';
const CLIENT_TX = '22222222-2222-4222-8222-222222222222';
const VS = '33333333-3333-4333-8333-333333333333';
const ROOM = '44444444-4444-4444-8444-444444444444';
const INST = '55555555-5555-4555-8555-555555555555';
const SESSION = '66666666-6666-4666-8666-666666666666';

interface World {
  user: { id: string } | null;
  limited: boolean;
  rpc: Record<string, (args: Record<string, unknown>) => { data: unknown; error: unknown }>;
  calls: { fn: string; args: Record<string, unknown> }[];
  background: Promise<unknown>[];
  pushes: { token: string; payload: Record<string, unknown> }[];
}

function world(over: Partial<World> = {}): World {
  return {
    user: { id: 'speaker-1' },
    limited: false,
    rpc: {
      voice_begin_transmission: () => ({
        data: {
          ok: true, transmission_id: TX, channel: 'rpt_' + 'a'.repeat(32), speaker_uid: 12345,
          room_id: null, state: 'arming', hard_end_at: HARD_END, created: true,
        },
        error: null,
      }),
      voice_confirm_transmission: () => ({ data: { ok: true, voice_session_id: VS, hard_end_at: HARD_END }, error: null }),
      voice_end_transmission: () => ({ data: 1, error: null }),
      voice_set_context: () => ({ data: { ok: true }, error: null }),
      voice_listener_grant: () => ({
        data: {
          ok: true, transmission_id: TX, channel: 'rpt_' + 'a'.repeat(32), speaker_id: 'speaker-1',
          speaker_uid: 12345, listener_uid: 1073741999, room_id: null, hard_end_at: HARD_END,
        },
        error: null,
      }),
      voice_fanout_targets: () => ({
        data: [
          { listener_id: 'l-1', listener_uid: 1073741901, token: 'a'.repeat(64), apns_environment: 'production',
            channel: 'rpt_' + 'a'.repeat(32), speaker_uid: 12345, hard_end_at: HARD_END },
          { listener_id: 'l-2', listener_uid: 1073741902, token: 'b'.repeat(64), apns_environment: 'development',
            channel: 'rpt_' + 'a'.repeat(32), speaker_uid: 12345, hard_end_at: HARD_END },
        ],
        error: null,
      }),
      drop_ptt_token: () => ({ data: null, error: null }),
      register_ptt_token: () => ({ data: { ok: true }, error: null }),
      unregister_ptt_token: () => ({ data: 1, error: null }),
    },
    calls: [],
    background: [],
    pushes: [],
    ...over,
  };
}

function fakeAdmin(w: World): SupabaseClient {
  const admin = {
    rpc(fn: string, args: Record<string, unknown>) {
      w.calls.push({ fn, args });
      const impl = w.rpc[fn];
      return Promise.resolve(impl ? impl(args) : { data: null, error: { code: 'XX' } });
    },
    from(_t: string) {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: () => Promise.resolve({ data: { display_name: 'Maya' }, error: null }),
      };
      return q;
    },
  };
  return admin as unknown as SupabaseClient;
}

const AGORA = { appId: 'a'.repeat(32), appCertificate: 'b'.repeat(32) };
const APNS = { teamId: 'TEAM123456', keyId: 'KEY1234567', privateKeyPem: '', bundleId: 'com.aarav.jit.roadping' };

function deps(w: World, over: Partial<VoiceDeps> = {}): VoiceDeps {
  return {
    getAuthUser: () => Promise.resolve(w.user as User | null),
    createAdminClient: () => fakeAdmin(w),
    isRateLimited: () => Promise.resolve(w.limited),
    agora: AGORA,
    apns: APNS,
    sendPush: (_cfg, target, payload) => {
      w.pushes.push({ token: target.token, payload });
      return Promise.resolve({ outcome: target.token.startsWith('b') ? 'drop_token' : 'sent' });
    },
    runInBackground: (p) => w.background.push(p),
    nowMs: () => NOW,
    ...over,
  };
}

function post(body: unknown): Request {
  return new Request('http://localhost/voice-transmission', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function call(w: World, body: unknown, over: Partial<VoiceDeps> = {}) {
  const res = await handleVoiceTransmission(post(body), deps(w, over));
  return { status: res.status, json: await res.json().catch(() => null) as Record<string, unknown> | null };
}

// ── Authentication and input ──────────────────────────────────────────────

Deno.test('unauthenticated requests are rejected before any RPC', async () => {
  const w = world({ user: null });
  for (const action of ['begin', 'confirm', 'end', 'grant', 'context']) {
    const r = await call(w, { action, client_tx_id: CLIENT_TX, transmission_id: TX });
    assertEquals(r.status, 401, `${action} without auth`);
  }
  assertEquals(w.calls.length, 0, 'no RPC without auth');
});

Deno.test('malformed bodies and unknown actions are rejected', async () => {
  const w = world();
  assertEquals((await call(w, 'not json')).status, 400, 'not JSON');
  assertEquals((await call(w, [1, 2])).status, 400, 'array body');
  assertEquals((await call(w, { action: 'subscribe_all' })).status, 400, 'unknown action');
  assertEquals((await call(w, { action: 'begin', client_tx_id: 'x' })).status, 400, 'bad client id');
  assertEquals((await call(w, { action: 'grant' })).status, 400, 'grant with no id');
  assertEquals((await call(w, { action: 'grant', transmission_id: TX, voice_session_id: VS })).status, 400,
    'grant with both ids');
  assertEquals((await call(w, { action: 'context', room_id: 'roadping-room-1' })).status, 400, 'bad room id');
  assertEquals(w.calls.length, 0, 'no RPC for invalid input');
});

Deno.test('the caller id comes from the JWT, never the body', async () => {
  const w = world();
  await call(w, { action: 'begin', client_tx_id: CLIENT_TX, user_id: 'victim', p_user_id: 'victim' });
  await call(w, { action: 'grant', transmission_id: TX, listener_id: 'victim' });
  await call(w, { action: 'end', transmission_id: TX, user_id: 'victim' });
  for (const c of w.calls.filter((c) => !['voice_fanout_targets', 'drop_ptt_token'].includes(c.fn))) {
    const id = c.args.p_user_id ?? c.args.p_listener_id;
    assertEquals(id, 'speaker-1', `${c.fn} uses the authenticated id`);
  }
});

// ── begin ─────────────────────────────────────────────────────────────────

Deno.test('begin returns a publisher token bounded by the hard end, and fans out once', async () => {
  const w = world();
  const r = await call(w, { action: 'begin', client_tx_id: CLIENT_TX });
  assertEquals(r.status, 200, 'status');
  assert(typeof r.json?.token === 'string' && (r.json.token as string).startsWith('007'), 'AccessToken2 token');
  assertEquals(r.json?.token_expires_at, new Date(NOW + 45_000).toISOString(), '45 s cap');
  assertEquals(r.json?.uid, 12345, 'speaker uid');
  assertEquals(w.background.length, 1, 'fan-out scheduled');
  for (const k of ['lat', 'lng', 'distance', 'distance_m', 'band', 'distance_band', 'location']) {
    assert(!(k in (r.json ?? {})), `no ${k} in begin response`);
  }

  const retry = world();
  retry.rpc.voice_begin_transmission = () => ({
    data: { ok: true, transmission_id: TX, channel: 'rpt_' + 'a'.repeat(32), speaker_uid: 12345, room_id: null,
            state: 'live', hard_end_at: HARD_END, created: false },
    error: null,
  });
  await call(retry, { action: 'begin', client_tx_id: CLIENT_TX });
  assertEquals(retry.background.length, 0, 'a retry or speaker renewal does not fan out again');
});

Deno.test('begin maps database denials to distinct statuses', async () => {
  for (const [code, status] of [['not_live', 409], ['not_member', 403], ['transmission_ended', 410], ['invalid', 400]] as const) {
    const w = world();
    w.rpc.voice_begin_transmission = () => ({ data: { ok: false, error: code }, error: null });
    const r = await call(w, { action: 'begin', client_tx_id: CLIENT_TX });
    assertEquals(r.status, status, code);
    assertEquals(w.background.length, 0, `${code}: no fan-out`);
  }
});

Deno.test('begin is rate-limited; end never is', async () => {
  const w = world({ limited: true });
  assertEquals((await call(w, { action: 'begin', client_tx_id: CLIENT_TX })).status, 429, 'begin limited');
  assertEquals((await call(w, { action: 'grant', transmission_id: TX })).status, 429, 'grant limited');
  assertEquals((await call(w, { action: 'end', transmission_id: TX })).status, 200, 'end not limited');
  assertEquals((await call(w, { action: 'end' })).status, 200, 'end-all not limited');
});

Deno.test('voice is unavailable without Agora secrets, but release still works', async () => {
  const w = world();
  assertEquals((await call(w, { action: 'begin', client_tx_id: CLIENT_TX }, { agora: null })).status, 503, 'begin');
  assertEquals((await call(w, { action: 'grant', transmission_id: TX }, { agora: null })).status, 503, 'grant');
  assertEquals((await call(w, { action: 'end' }, { agora: null })).status, 200, 'end');
});

Deno.test('a transmission past its hard end gets no token', async () => {
  const w = world();
  const late = { nowMs: () => Date.parse(HARD_END) + 1000 };
  assertEquals((await call(w, { action: 'begin', client_tx_id: CLIENT_TX }, late)).status, 410, 'begin');
  assertEquals((await call(w, { action: 'grant', transmission_id: TX }, late)).status, 403, 'grant');
});

// ── grant ─────────────────────────────────────────────────────────────────

Deno.test('grant mints a subscriber token for the listener uid only', async () => {
  const w = world({ user: { id: 'listener-1' } });
  const r = await call(w, { action: 'grant', transmission_id: TX });
  assertEquals(r.status, 200, 'status');
  assertEquals(r.json?.uid, 1073741999, 'listener uid from the database');
  assertEquals(r.json?.speaker_uid, 12345, 'speaker uid for the subscribe allowlist');
  assertEquals(w.calls[0]?.args, { p_listener_id: 'listener-1', p_transmission_id: TX, p_voice_session_id: null },
    'grant args');
  for (const k of ['lat', 'lng', 'distance', 'distance_m', 'band', 'distance_band', 'location']) {
    assert(!(k in (r.json ?? {})), `no ${k} in grant`);
  }
});

Deno.test('every denial reason looks the same to the caller', async () => {
  const bodies = new Set<string>();
  for (const code of ['denied', 'not_live', 'whatever', undefined]) {
    const w = world();
    w.rpc.voice_listener_grant = () => ({ data: { ok: false, error: code }, error: null });
    const res = await handleVoiceTransmission(post({ action: 'grant', transmission_id: TX }), deps(w));
    assertEquals(res.status, 403, `status for ${code}`);
    bodies.add(await res.text());
  }
  assertEquals(bodies.size, 1, 'identical body for every denial');
});

Deno.test('grant from a Realtime speaking row id', async () => {
  const w = world();
  await call(w, { action: 'grant', voice_session_id: VS });
  assertEquals(w.calls[0]?.args, { p_listener_id: 'speaker-1', p_transmission_id: null, p_voice_session_id: VS },
    'voice session lookup');
});

// ── end / confirm / context ───────────────────────────────────────────────

Deno.test('end only forwards known reasons', async () => {
  const w = world();
  await call(w, { action: 'end', transmission_id: TX, reason: 'max_hold' });
  await call(w, { action: 'end', transmission_id: TX, reason: "'; DROP TABLE x;--" });
  assertEquals(w.calls.map((c) => c.args.p_reason), ['max_hold', 'released'], 'reasons');
});

Deno.test('confirm and context pass through and map denials', async () => {
  const w = world();
  const c = await call(w, { action: 'confirm', transmission_id: TX });
  assertEquals(c.json?.voice_session_id, VS, 'confirm');
  const ctx = await call(w, { action: 'context', room_id: ROOM });
  assertEquals(ctx.json?.room_id, ROOM, 'context');
  const nearby = await call(w, { action: 'context', room_id: null });
  assertEquals(nearby.json?.room_id, null, 'nearby');
  w.rpc.voice_set_context = () => ({ data: { ok: false, error: 'not_member' }, error: null });
  assertEquals((await call(w, { action: 'context', room_id: ROOM })).status, 403, 'non-member');
});

// ── fan-out ───────────────────────────────────────────────────────────────

Deno.test('fan-out sends one push per device with its own token, and drops dead tokens', async () => {
  const w = world();
  const res = await fanOut(fakeAdmin(w), deps(w), 'speaker-1', TX, null);
  assertEquals(res, { sent: 1, dropped: 1, failed: 0 }, 'outcomes');
  assertEquals(w.pushes.length, 2, 'two pushes');
  const [a, b] = w.pushes.map((p) => p.payload.rp as Record<string, unknown>);
  assert(a && b, 'payloads');
  assertEquals(a.uid, 1073741901, 'first listener uid');
  assertEquals(b.uid, 1073741902, 'second listener uid');
  assert(a.tok !== b.tok, 'per-listener tokens');
  assertEquals(a.name, 'Maya', 'speaker display name');
  assertEquals(Object.keys(a).sort(), ['app', 'ch', 'end', 'exp', 'name', 'room', 'sid', 'suid', 'tok', 'tx', 'uid', 'v'],
    'payload keys: no location, distance or band');
  assert(JSON.stringify(w.pushes[0]?.payload).length < 4096, 'payload under the 4 KB APNs limit');
  assert(w.calls.some((c) => c.fn === 'drop_ptt_token' && c.args.p_token === 'b'.repeat(64)), 'dead token dropped');
});

Deno.test('fan-out does nothing without APNs secrets', async () => {
  const w = world();
  const res = await fanOut(fakeAdmin(w), deps(w, { apns: null }), 'speaker-1', TX, null);
  assertEquals(res, { sent: 0, dropped: 0, failed: 0 }, 'nothing');
  assertEquals(w.calls.length, 0, 'no RPC');
});

// ── ptt-token ─────────────────────────────────────────────────────────────

Deno.test('ptt-token validates and binds to the caller', async () => {
  const w = world();
  const d = {
    getAuthUser: () => Promise.resolve(w.user as User | null),
    createAdminClient: () => fakeAdmin(w),
    isRateLimited: () => Promise.resolve(false),
  };
  const req = (b: unknown) => new Request('http://x', { method: 'POST', body: JSON.stringify(b) });
  const good = { action: 'register', installation_id: INST, live_session_id: SESSION, token: 'AB'.repeat(32),
                 apns_environment: 'production', user_id: 'victim' };
  assertEquals((await handlePttToken(req(good), d)).status, 200, 'register');
  assertEquals(w.calls[0]?.args.p_user_id, 'speaker-1', 'JWT user');
  assertEquals((await handlePttToken(req({ ...good, token: 'xyz' }), d)).status, 400, 'non-hex');
  assertEquals((await handlePttToken(req({ ...good, apns_environment: 'staging' }), d)).status, 400, 'env');
  assertEquals((await handlePttToken(req({ ...good, live_session_id: 'nope' }), d)).status, 400, 'session id');
  assertEquals((await handlePttToken(req({ action: 'unregister' }), d)).status, 200, 'unregister all');
  w.rpc.register_ptt_token = () => ({ data: { ok: false, error: 'not_live' }, error: null });
  assertEquals((await handlePttToken(req(good), d)).status, 409, 'not live');
  const anon = { ...d, getAuthUser: () => Promise.resolve(null) };
  assertEquals((await handlePttToken(req(good), anon)).status, 401, 'auth');
});

// ── Shared helpers ────────────────────────────────────────────────────────

Deno.test('token lifetime: 45 s cap, hard end + 5 s, nothing after the hard end', () => {
  const end = Date.parse(HARD_END);
  assertEquals(voiceTokenTtlSeconds(HARD_END, end - 70_000), 45, 'cap');
  assertEquals(voiceTokenTtlSeconds(HARD_END, end - 10_000), 15, 'hard end + 5');
  assertEquals(voiceTokenTtlSeconds(HARD_END, end), 0, 'at hard end');
  assertEquals(voiceTokenTtlSeconds('garbage', end), 0, 'bad date');
  let threw = false;
  try {
    mintVoiceToken(AGORA, 'rpt_x', 0, 'subscriber', 30);
  } catch {
    threw = true;
  }
  assert(threw, 'uid 0 (wildcard) is refused');
  threw = false;
  try {
    mintVoiceToken(AGORA, 'rpt_x', 5, 'subscriber', 3600);
  } catch {
    threw = true;
  }
  assert(threw, 'long-lived tokens are refused');
});

Deno.test('APNs request: pushtotalk type, voip-ptt topic, priority 10, expiration 0, right host', () => {
  const prod = buildPttRequest(APNS, { token: 'ab'.repeat(32), environment: 'production' }, { rp: {} }, 'jwt');
  const dev = buildPttRequest(APNS, { token: 'ab'.repeat(32), environment: 'development' }, { rp: {} }, 'jwt');
  const h = prod.init.headers as Record<string, string>;
  assertEquals(h['apns-push-type'], 'pushtotalk', 'push type');
  assertEquals(h['apns-topic'], 'com.aarav.jit.roadping.voip-ptt', 'topic');
  assertEquals(h['apns-priority'], '10', 'priority');
  assertEquals(h['apns-expiration'], '0', 'expiration');
  assertEquals(h.authorization, 'bearer jwt', 'auth');
  assert(prod.url.startsWith('https://api.push.apple.com/3/device/'), 'production host');
  assert(dev.url.startsWith('https://api.sandbox.push.apple.com/3/device/'), 'sandbox host');
});

Deno.test('APNs responses: dead tokens are dropped, nothing is retried', () => {
  assertEquals(classifyApnsResponse(200, undefined), 'sent', '200');
  assertEquals(classifyApnsResponse(410, 'Unregistered'), 'drop_token', '410');
  assertEquals(classifyApnsResponse(400, 'BadDeviceToken'), 'drop_token', 'bad token');
  assertEquals(classifyApnsResponse(400, 'DeviceTokenNotForTopic'), 'drop_token', 'wrong topic');
  assertEquals(classifyApnsResponse(403, 'ExpiredProviderToken'), 'failed', 'provider token problem keeps device token');
  assertEquals(classifyApnsResponse(429, 'TooManyRequests'), 'failed', 'throttled');
  assertEquals(classifyApnsResponse(500, 'InternalServerError'), 'failed', '5xx');
});

Deno.test('provider token is a verifiable ES256 JWT, reused inside the refresh window', async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...pkcs8))}\n-----END PRIVATE KEY-----`;
  const cfg = { ...APNS, privateKeyPem: pem };
  const jwt = await signProviderToken(cfg, 1_800_000_000);
  const [h, c, s] = jwt.split('.');
  assert(h && c && s, 'three parts');
  const dec = (x: string) => JSON.parse(atob(x.replace(/-/g, '+').replace(/_/g, '/')));
  assertEquals(dec(h), { alg: 'ES256', kid: 'KEY1234567' }, 'header');
  assertEquals(dec(c), { iss: 'TEAM123456', iat: 1_800_000_000 }, 'claims');
  const sig = Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice((s.length + 2) % 4 || 2)),
    (ch) => ch.charCodeAt(0));
  assertEquals(sig.length, 64, 'raw r||s signature');
  const valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, sig,
    new TextEncoder().encode(`${h}.${c}`));
  assert(valid, 'signature verifies');

  resetProviderTokenCache();
  const t1 = await providerToken(cfg, 1_800_000_000);
  const t2 = await providerToken(cfg, 1_800_000_000 + 39 * 60);
  const t3 = await providerToken(cfg, 1_800_000_000 + 41 * 60);
  assertEquals(t1, t2, 'reused under 40 min');
  assert(t1 !== t3, 'refreshed after 40 min');
});

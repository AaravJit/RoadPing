/**
 * Phase 3 static and config checks: native configuration, background
 * location rules, cold-launch rule, Live Activity attribute sync.
 * Run: npm run test:client
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const ROOT = new URL('../../', import.meta.url).pathname;
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

function walk(dir, exts, out = []) {
  for (const name of readdirSync(join(ROOT, dir))) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const rel = join(dir, name);
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, exts, out);
    else if (exts.some((e) => name.endsWith(e))) out.push(rel);
  }
  return out;
}

const SOURCES = [
  ...walk('app', ['.ts', '.tsx']),
  ...walk('src', ['.ts', '.tsx']),
  ...walk('modules', ['.ts', '.swift']),
  ...walk('targets', ['.swift']),
];

// ── Background location: When In Use only ──────────────────────────────────

test('no code requests Always location or uses background location tasks', () => {
  const forbidden = [
    /requestBackgroundPermissionsAsync/,
    /startLocationUpdatesAsync/,
    /expo-task-manager/,
    /requestAlwaysAuthorization/,
  ];
  for (const f of SOURCES) {
    const text = read(f);
    for (const re of forbidden) assert.ok(!re.test(text), `${f} matches ${re}`);
  }
});

test('app.json keeps expo-location background mode off and no audio background mode', () => {
  const app = JSON.parse(read('app.json')).expo;
  const loc = app.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-location');
  assert.ok(loc, 'expo-location plugin configured');
  assert.equal(loc[1].isIosBackgroundLocationEnabled, false);
  assert.match(loc[1].locationAlwaysPermission, /never needs Always/);
  const modes = app.ios?.infoPlist?.UIBackgroundModes ?? [];
  assert.ok(!modes.includes('audio'), 'no background audio mode');
  assert.ok(!modes.includes('voip'), 'no VoIP mode');
});

// ── Native config plugin ───────────────────────────────────────────────────

async function applyPlugin(env) {
  const saved = {};
  for (const k of ['EXPO_PUBLIC_DISABLE_AGORA', 'EAS_BUILD_PROFILE', 'ROADPING_CARPLAY_ENTITLEMENT', 'ROADPING_PTT_IN_PRODUCTION']) {
    saved[k] = process.env[k];
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  try {
    const plugin = require(join(ROOT, 'plugins/withRoadPingNative.js'));
    const cfg = plugin({ name: 'RoadPing', slug: 'roadping', ios: {} });
    const nextMod = async (c) => c;
    const info = await cfg.mods.ios.infoPlist({ ...cfg, modResults: {}, modRequest: { platform: 'ios', modName: 'infoPlist', nextMod } });
    const ent = await cfg.mods.ios.entitlements({ ...cfg, modResults: {}, modRequest: { platform: 'ios', modName: 'entitlements', nextMod } });
    return { info: info.modResults, ent: ent.modResults };
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test('plugin: voice build gets PushToTalk mode + entitlement, location mode, Live Activities', async () => {
  const { info, ent } = await applyPlugin({ EXPO_PUBLIC_DISABLE_AGORA: 'false', EAS_BUILD_PROFILE: 'voice-test' });
  assert.deepEqual(info.UIBackgroundModes, ['location', 'push-to-talk']);
  assert.equal(info.NSSupportsLiveActivities, true);
  assert.equal(ent['com.apple.developer.push-to-talk'], true);
  assert.equal(ent['aps-environment'], 'development');
  assert.equal(info.UIApplicationSceneManifest, undefined);
  assert.ok(!Object.keys(ent).some((k) => k.includes('carplay')));
});

test('plugin: kill switch on → no PushToTalk mode or entitlement', async () => {
  const { info, ent } = await applyPlugin({ EXPO_PUBLIC_DISABLE_AGORA: 'true', EAS_BUILD_PROFILE: 'preview' });
  assert.deepEqual(info.UIBackgroundModes, ['location']);
  assert.equal(ent['com.apple.developer.push-to-talk'], undefined);
  assert.equal(ent['aps-environment'], undefined);
});

test('plugin: production profile gets no PushToTalk unless explicitly opted in', async () => {
  const off = await applyPlugin({ EAS_BUILD_PROFILE: 'production' });
  assert.equal(off.ent['com.apple.developer.push-to-talk'], undefined);
  assert.ok(!off.info.UIBackgroundModes.includes('push-to-talk'));
  const on = await applyPlugin({ EAS_BUILD_PROFILE: 'production', ROADPING_PTT_IN_PRODUCTION: 'true' });
  assert.equal(on.ent['com.apple.developer.push-to-talk'], true);
});

test('plugin: CarPlay scaffold only behind its gate, never in production', async () => {
  const gated = await applyPlugin({ ROADPING_CARPLAY_ENTITLEMENT: 'driving-task', EAS_BUILD_PROFILE: 'development' });
  assert.equal(gated.ent['com.apple.developer.carplay-driving-task'], true);
  const roles = gated.info.UIApplicationSceneManifest.UISceneConfigurations;
  assert.equal(roles.CPTemplateApplicationSceneSessionRoleApplication[0].UISceneDelegateClassName, 'RoadPingCarPlaySceneDelegate');
  await assert.rejects(applyPlugin({ ROADPING_CARPLAY_ENTITLEMENT: 'driving-task', EAS_BUILD_PROFILE: 'production' }), /production/);
  await assert.rejects(applyPlugin({ ROADPING_CARPLAY_ENTITLEMENT: 'audio' }), /not supported/);
});

test('shipping config files never name a CarPlay entitlement', () => {
  for (const f of ['app.json', 'eas.json']) assert.ok(!/carplay/i.test(read(f)), f);
});

// ── Cold launch never starts live ──────────────────────────────────────────

test('only Go Live starts a session: liveController.start has one caller, recovery never calls it', () => {
  const callers = SOURCES.filter((f) => /liveController\.start\(/.test(read(f)));
  assert.deepEqual(callers, ['src/hooks/useLiveSession.ts']);
  const ctl = read('src/services/live/liveController.ts');
  const recover = ctl.slice(ctl.indexOf('async recoverAfterLaunch'), ctl.indexOf('private async clearStored'));
  assert.ok(recover.length > 0);
  assert.ok(!/this\.start\(|startLiveSession\(/.test(recover), 'recovery must not start a session');
  assert.match(recover, /stopLiveSession\(/);
  const drive = read('app/drive.tsx');
  assert.ok(!/useEffect\([^)]*live\.start/s.test(drive.replace(/function handleGoLive[\s\S]*?\n  }\n/, '')));
});

test('native launch hook ends Live Activities and leaves a restored PushToTalk channel', () => {
  const sub = read('modules/roadping-native/ios/RoadPingAppDelegateSubscriber.swift');
  assert.match(sub, /endAll\(\)/);
  const ptt = read('modules/roadping-native/ios/RoadPingPTT.swift');
  assert.match(ptt, /channelRestoration/);
  assert.match(ptt, /leaveChannel/);
});

test('useAppLifecycleCleanup is gone (replaced by liveController)', () => {
  for (const f of SOURCES) assert.ok(!/hooks\/useAppLifecycleCleanup'/.test(read(f)), f);
});

// ── Live Activity attributes stay in sync ──────────────────────────────────

test('ActivityAttributes are identical in the app module and the widget target', () => {
  const strip = (s) => s.split('\n').slice(1).join('\n');
  const a = read('modules/roadping-native/ios/RoadPingActivityAttributes.swift');
  const b = read('targets/live-activity/RoadPingActivityAttributes.swift');
  assert.equal(strip(a), strip(b));
});

test('JS Live Activity status values are all rendered by the widget', () => {
  const idx = read('modules/roadping-native/index.ts');
  const m = idx.match(/status: ((?:'[a-z_]+' \| )*'[a-z_]+');/);
  assert.ok(m);
  const statuses = [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
  const widget = read('targets/live-activity/RoadPingLiveActivityWidget.swift');
  assert.ok(statuses.includes('live'));
  // "live" is the default branch; every other status has its own case.
  for (const s of statuses.filter((x) => x !== 'live')) assert.ok(widget.includes(`case "${s}"`), `widget handles ${s}`);
});

test('Live Activity widget has no buttons or toggles (they do nothing in CarPlay)', () => {
  const widget = read('targets/live-activity/RoadPingLiveActivityWidget.swift');
  assert.ok(!/\bButton\(|\bToggle\(/.test(widget));
});

// ── No secrets in the app ──────────────────────────────────────────────────

test('no Agora certificate or APNs key material in client sources or config', () => {
  const files = [...SOURCES, 'app.json', 'eas.json', 'plugins/withRoadPingNative.js'];
  for (const f of files) {
    const t = read(f);
    assert.ok(!/AGORA_APP_CERTIFICATE|APNS_PRIVATE_KEY|BEGIN PRIVATE KEY/.test(t), f);
  }
});

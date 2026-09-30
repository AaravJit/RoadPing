/**
 * Adversarial tests for get-nearby-drivers' request handling (Phase 2).
 * Not deployed (nothing imports it). Run:
 *   deno test supabase/functions/get-nearby-drivers/handler.test.ts
 * (see docs/PHASE2_PROXIMITY_PRIVACY.md → Validation for the import map).
 */

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { handleGetNearbyDrivers, type NearbyDeps } from './handler.ts';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
function assertEquals(a: unknown, b: unknown, msg: string) {
  const ja = JSON.stringify(a);
  const jb = JSON.stringify(b);
  if (ja !== jb) throw new Error(`${msg}\n  actual:   ${ja}\n  expected: ${jb}`);
}

interface World {
  user: { id: string } | null;
  banned: boolean;
  live: boolean;
  limited: boolean;
  rows: unknown[];
  rpcCalls: { fn: string; args: unknown }[];
}

function world(over: Partial<World> = {}): World {
  return {
    user: { id: 'caller-1' },
    banned: false,
    live: true,
    limited: false,
    rows: [
      {
        user_id: 'u-2', handle: 'maya', display_name: 'Maya', avatar_url: null,
        vehicle_type: 'car', vehicle_label: 'Civic', vehicle_color: 'Blue',
        vehicle_make: 'Honda', vehicle_model: 'Civic',
        distance_band: '800m_to_1600m', is_speaking: true, dnd: false,
      },
    ],
    rpcCalls: [],
    ...over,
  };
}

function deps(w: World): NearbyDeps {
  const query = (table: string) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: () =>
        Promise.resolve({
          data:
            table === 'profiles'
              ? { is_banned: w.banned }
              : table === 'live_sessions' && w.live
                ? { id: 'session-1' }
                : null,
          error: null,
        }),
    };
    return chain;
  };
  const admin = {
    from: query,
    rpc: (fn: string, args: unknown) => {
      w.rpcCalls.push({ fn, args });
      return Promise.resolve({ data: w.rows, error: null });
    },
  } as unknown as SupabaseClient;
  return {
    getAuthUser: () => Promise.resolve(w.user as User | null),
    createAdminClient: () => admin,
    isRateLimited: () => Promise.resolve(w.limited),
  };
}

function post(body: string): Request {
  return new Request('http://localhost/get-nearby-drivers', {
    method: 'POST',
    headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
    body,
  });
}

const PUBLIC_KEYS = [
  'avatar_url', 'display_name', 'distance_band', 'dnd', 'handle', 'is_speaking',
  'user_id', 'vehicle_color', 'vehicle_label', 'vehicle_make', 'vehicle_model', 'vehicle_type',
];

Deno.test('no request body can change the query', async () => {
  const bodies = [
    '{}',
    JSON.stringify({ p_caller_id: 'someone-else', p_range_m: 1 }),
    JSON.stringify({ caller: 'x', distance_band: 'within_800m' }),
    'not json at all',
    '',
    '[]',
    'null',
  ];
  const responses: string[] = [];
  for (const b of bodies) {
    const w = world();
    const res = await handleGetNearbyDrivers(post(b), deps(w));
    assertEquals(res.status, 200, `status for body ${b}`);
    assertEquals(w.rpcCalls, [{ fn: 'get_nearby_drivers_v3', args: { p_caller_id: 'caller-1' } }],
      `rpc call for body ${b}`);
    responses.push(await res.text());
  }
  assertEquals(new Set(responses).size, 1, 'every body yields the identical response');
});

Deno.test('legacy lat/lng/range_m requests get nobody: no probing, no NaN pins', async () => {
  const bodies = [
    JSON.stringify({ lat: 37.0, lng: -122.0, range_m: 5000 }),
    JSON.stringify({ lat: 37.0, lng: -122.0, range_m: 100 }),
    JSON.stringify({ lat: 0, lng: 0 }),
    JSON.stringify({ range_m: 250 }),
    JSON.stringify({ range_m: -1, lat: 'x' }),
  ];
  for (const b of bodies) {
    const w = world();
    const res = await handleGetNearbyDrivers(post(b), deps(w));
    assertEquals(res.status, 200, `status for body ${b}`);
    assertEquals(await res.json(), { drivers: [] }, `empty list for body ${b}`);
    assertEquals(w.rpcCalls.length, 0, `no RPC for body ${b}`);
  }
});

Deno.test('only the public fields leave the function', async () => {
  const w = world({
    rows: [{
      ...world().rows[0] as Record<string, unknown>,
      approximate_distance_m: 450, lat: 37.1, lng: -122.2, location: 'POINT(0 0)',
      bearing: 90, heading: 12, session_id: 'secret-session', distance_m: 431.7,
    }],
  });
  const res = await handleGetNearbyDrivers(post('{}'), deps(w));
  const json = await res.json() as { drivers: Record<string, unknown>[] };
  assertEquals(json.drivers.length, 1, 'one driver');
  assertEquals(Object.keys(json.drivers[0]).sort(), PUBLIC_KEYS, 'exact key set');
  assertEquals(json.drivers[0].distance_band, '800m_to_1600m', 'band passed through');
  assertEquals(Object.keys(json), ['drivers'], 'no other top-level keys');
});

Deno.test('rows outside the contract are dropped, not repaired', async () => {
  const good = world().rows[0] as Record<string, unknown>;
  const w = world({
    rows: [
      { ...good, user_id: 'a', distance_band: 'within_100m' },
      { ...good, user_id: 'b', distance_band: 450 },
      { ...good, user_id: 'c', distance_band: undefined, approximate_distance_m: 300 },
      { ...good, user_id: 'd' },
      null,
    ],
  });
  const res = await handleGetNearbyDrivers(post('{}'), deps(w));
  const json = await res.json() as { drivers: { user_id: string }[] };
  assertEquals(json.drivers.map((d) => d.user_id), ['d'], 'only the valid row survives');
});

Deno.test('unauthenticated, banned, not live and rate-limited callers never reach the RPC', async () => {
  const cases: [Partial<World>, number][] = [
    [{ user: null }, 401],
    [{ banned: true }, 403],
    [{ live: false }, 403],
    [{ limited: true }, 429],
  ];
  for (const [over, status] of cases) {
    const w = world(over);
    const res = await handleGetNearbyDrivers(post('{"range_m":100}'), deps(w));
    assertEquals(res.status, status, `status for ${JSON.stringify(over)}`);
    assertEquals(w.rpcCalls.length, 0, `no RPC for ${JSON.stringify(over)}`);
    const body = await res.json() as Record<string, unknown>;
    assert(!('drivers' in body), 'no drivers on error');
  }
});

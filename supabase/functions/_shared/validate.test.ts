/**
 * Range-edge tests for the broadcast range a live session may store
 * (Phase 2). Not deployed (nothing imports it). Run:
 *   deno test supabase/functions/_shared/validate.test.ts
 */

import { BROADCAST_RANGES_M, broadcastRangeFor, isRangeM } from './validate.ts';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

Deno.test('every accepted request range maps to a band edge, never upward', () => {
  const stored = new Set<number>();
  for (let m = 100; m <= 5000; m += 1) {
    assert(isRangeM(m), `${m} accepted by the request validator`);
    const step = broadcastRangeFor(m);
    if (m < 800) {
      assert(step === null, `${m} m is refused, not widened`);
      continue;
    }
    assert(step !== null && step <= m, `${m} m floors to ${step}`);
    stored.add(step);
  }
  assert(
    JSON.stringify([...stored].sort((a, b) => a - b)) === JSON.stringify([...BROADCAST_RANGES_M]),
    `only ${BROADCAST_RANGES_M.join('/')} can be stored, got ${[...stored].join('/')}`,
  );
});

Deno.test('old app presets land on the expected ranges', () => {
  const cases: Array<[number, number | null]> = [
    [400, null], [500, null], // ¼ mi, 500 m: refused with a message
    [800, 800], [1000, 800], [1600, 1600], [2000, 1600],
    [3000, 1600], [3200, 3200], [4800, 4800], [5000, 4800],
  ];
  for (const [m, want] of cases) {
    assert(broadcastRangeFor(m) === want, `${m} → ${broadcastRangeFor(m)}, want ${want}`);
  }
});

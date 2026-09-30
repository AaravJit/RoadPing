/**
 * Broadcast-range tests for src/services/units.ts (Phase 2 range edges).
 * Run: npm run test:proximity
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  BROADCAST_RANGES_M,
  broadcastRangeFor,
  rangePresetsFor,
} from '../../src/services/units.ts';

test('ranges are exactly the band edges plus one maximum', () => {
  assert.deepEqual([...BROADCAST_RANGES_M], [800, 1600, 3200, 4800]);
});

test('every preset in both unit systems is an allowed range', () => {
  for (const system of ['imperial', 'metric']) {
    assert.deepEqual(rangePresetsFor(system).map((p) => p.value), [...BROADCAST_RANGES_M]);
  }
});

test('stored values floor to an allowed range and are never widened', () => {
  for (let m = 100; m <= 5000; m += 1) {
    const r = broadcastRangeFor(m);
    if (m < 800) assert.equal(r, null, `${m} m needs a new choice`);
    else assert.ok(r !== null && r <= m && BROADCAST_RANGES_M.includes(r), `${m} m → ${r}`);
  }
  assert.equal(broadcastRangeFor(3000), 1600);
  assert.equal(broadcastRangeFor(5000), 4800);
});

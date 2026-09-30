/**
 * Contract tests for src/services/proximity.ts (Phase 2).
 * Run: npm run test:proximity   (Node 22.18+: imports the .ts module with
 * built-in type stripping; no dependencies)
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DISTANCE_BANDS,
  compareNearbyDrivers,
  describeDistanceBand,
  formatDistanceBand,
  parseNearbyDriver,
  parseNearbyDrivers,
} from '../../src/services/proximity.ts';

const base = {
  user_id: 'u-1',
  handle: 'maya',
  display_name: 'Maya',
  avatar_url: null,
  vehicle_type: 'car',
  vehicle_label: 'Civic',
  vehicle_color: 'Blue',
  vehicle_make: 'Honda',
  vehicle_model: 'Civic',
  distance_band: 'within_800m',
  is_speaking: false,
  dnd: false,
};

test('the client knows exactly the server bands', () => {
  assert.deepEqual([...DISTANCE_BANDS], ['within_800m', '800m_to_1600m', '1600m_to_3200m', 'beyond_3200m']);
});

test('labels are ranges, in both unit systems, never a point estimate', () => {
  const imperial = DISTANCE_BANDS.map((b) => formatDistanceBand(b, 'imperial'));
  const metric = DISTANCE_BANDS.map((b) => formatDistanceBand(b, 'metric'));
  assert.deepEqual(imperial, ['Within ½ mi', '½–1 mi', '1–2 mi', 'Over 2 mi']);
  assert.deepEqual(metric, ['Within 800 m', '0.8–1.6 km', '1.6–3.2 km', 'Over 3.2 km']);
  for (const s of [...imperial, ...metric, ...DISTANCE_BANDS.map((b) => describeDistanceBand(b, 'imperial'))]) {
    assert.doesNotMatch(s, /~|about|approx|ahead|behind|north|south|east|west/i, s);
  }
});

test('only whitelisted fields survive parsing', () => {
  const d = parseNearbyDriver({
    ...base, lat: 1, lng: 2, bearing: 90, session_id: 's', approximate_distance_m: 10,
  });
  assert.ok(d);
  assert.deepEqual(Object.keys(d).sort(), Object.keys(base).sort());
  assert.equal(d.distance_band, 'within_800m', 'a band wins over any legacy number');
});

test('unknown or missing bands drop the driver rather than invent one', () => {
  assert.equal(parseNearbyDriver({ ...base, distance_band: 'within_100m' }), null);
  assert.equal(parseNearbyDriver({ ...base, distance_band: 300 }), null);
  assert.equal(parseNearbyDriver({ ...base, distance_band: undefined }), null);
  assert.equal(parseNearbyDriver({ ...base, user_id: 5 }), null);
  assert.equal(parseNearbyDriver(null), null);
});

test('deprecated legacy distance maps onto the same bands and is discarded', () => {
  const legacy = (m) =>
    parseNearbyDriver({ ...base, distance_band: undefined, approximate_distance_m: m })?.distance_band;
  assert.equal(legacy(0), 'within_800m');
  assert.equal(legacy(800), 'within_800m');
  assert.equal(legacy(850), '800m_to_1600m');
  assert.equal(legacy(1600), '800m_to_1600m');
  assert.equal(legacy(1650), '1600m_to_3200m');
  assert.equal(legacy(3200), '1600m_to_3200m');
  assert.equal(legacy(5000), 'beyond_3200m');
  assert.equal(legacy(-1), undefined);
  const d = parseNearbyDriver({ ...base, distance_band: undefined, approximate_distance_m: 450 });
  assert.ok(d && !('approximate_distance_m' in d));
});

test('ordering is band, then name: never finer than the band', () => {
  const list = parseNearbyDrivers({
    drivers: [
      // Legacy order from an old backend is by exact distance: zed nearer than amy.
      { ...base, user_id: 'z', display_name: 'zed', distance_band: undefined, approximate_distance_m: 100 },
      { ...base, user_id: 'a', display_name: 'Amy', distance_band: undefined, approximate_distance_m: 750 },
      { ...base, user_id: 'b', display_name: 'bob', distance_band: '1600m_to_3200m' },
      { ...base, user_id: 'c', display_name: 'cat', distance_band: '800m_to_1600m' },
    ],
  });
  assert.deepEqual(list.map((d) => d.display_name), ['Amy', 'zed', 'cat', 'bob']);
  assert.equal(compareNearbyDrivers(list[0], list[0]), 0);
});

test('a malformed response yields no drivers', () => {
  assert.deepEqual(parseNearbyDrivers(null), []);
  assert.deepEqual(parseNearbyDrivers({ drivers: 'x' }), []);
  assert.deepEqual(parseNearbyDrivers({}), []);
});

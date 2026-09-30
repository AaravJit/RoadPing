/**
 * units.ts — distance unit system (Phase 16D).
 *
 * The backend always stores distances in METRES. This module converts metres to
 * a display string in the user's chosen system. Default is IMPERIAL (US-first).
 *
 * - Short distances: feet (imperial) / metres (metric)
 * - Longer distances: miles (imperial) / kilometres (metric)
 *
 * Nothing here touches the backend or changes stored values — display only.
 */

export type UnitSystem = 'imperial' | 'metric';

export const DEFAULT_UNIT_SYSTEM: UnitSystem = 'imperial';

/**
 * Canonical default broadcast range: 3 miles, stored in METRES (backend unit).
 *
 * 4800 m ≈ 2.98 mi and matches the "3 mi" preset value exactly, so the range
 * chips in Settings and Drive highlight cleanly. It sits inside the backend
 * CHECK constraint (`default_range_m` / `range_m` BETWEEN 100 AND 5000), so no
 * Supabase migration is required. Used as the client-side fallback wherever a
 * profile has no saved range yet — existing users keep their stored value.
 */
export const DEFAULT_RANGE_M = 4800;

export function isUnitSystem(v: unknown): v is UnitSystem {
  return v === 'imperial' || v === 'metric';
}

const FEET_PER_METRE = 3.28084;
const METRES_PER_MILE = 1609.34;

/** Drop a trailing ".0" so "1.0 mi" reads "1 mi". */
function trimDecimal(n: number): string {
  return n
    .toFixed(1)
    .replace(/\.0$/, '');
}

/**
 * Format a metre distance for display: your own settings (broadcast range,
 * private-zone radius). Other drivers are never shown as a distance; they get
 * a band from src/services/proximity.ts.
 * @param meters distance in metres (backend unit)
 * @param system imperial | metric
 */
export function formatDistance(meters: number, system: UnitSystem): string {
  if (!Number.isFinite(meters) || meters < 0) return '0';

  if (system === 'imperial') {
    const feet = meters * FEET_PER_METRE;
    if (feet < 528) {
      // under 0.1 mi → feet, rounded to nearest 10
      return `${Math.max(0, Math.round(feet / 10) * 10)} ft`;
    }
    const miles = meters / METRES_PER_MILE;
    return miles >= 10
      ? `${Math.round(miles)} mi`
      : `${trimDecimal(miles)} mi`;
  }

  // metric
  if (meters < 1000) {
    return `${Math.max(0, Math.round(meters / 10) * 10)} m`;
  }
  const km = meters / 1000;
  return km >= 10
    ? `${Math.round(km)} km`
    : `${trimDecimal(km)} km`;
}

/** Label for a range or radius the user chose. */
export function formatRange(meters: number, system: UnitSystem): string {
  return formatDistance(meters, system);
}

// ─── Presets ────────────────────────────────────────────────────────────────

export interface RangePreset {
  label: string;
  /** Stored value in metres (backend unit, always 100–5000). */
  value: number;
}

/**
 * The only broadcast ranges the server stores (metres): the distance-band
 * edges (½, 1, 2 mi) plus one maximum (3 mi). Same list as
 * BROADCAST_RANGES_M in supabase/functions/_shared/validate.ts and
 * private.range_step_m in migration 012. Because every range is a band edge,
 * whether someone is "in range" never says more than their distance band.
 */
export const BROADCAST_RANGES_M = [800, 1600, 3200, 4800] as const;

/**
 * The allowed range a stored value means: the largest allowed range at or
 * below it (never wider than what the user chose), or null below ½ mi. Older
 * builds could save ¼ mi / 500 m; those users must pick a range again.
 */
export function broadcastRangeFor(meters: number): number | null {
  let step: number | null = null;
  for (const s of BROADCAST_RANGES_M) if (s <= meters) step = s;
  return step;
}

/**
 * Broadcast-range presets per unit system. Values are the allowed ranges in
 * metres; labels are round numbers in the chosen system.
 */
export function rangePresetsFor(system: UnitSystem): readonly RangePreset[] {
  return system === 'imperial'
    ? [
        { label: '½ mi', value: 800 },
        { label: '1 mi', value: 1600 },
        { label: '2 mi', value: 3200 },
        { label: '3 mi', value: 4800 },
      ]
    : [
        { label: '800 m', value: 800 },
        { label: '1.6 km', value: 1600 },
        { label: '3.2 km', value: 3200 },
        { label: '4.8 km', value: 4800 },
      ];
}

/** Private-zone radius presets per unit system (metres stored). */
export function zoneRadiusPresetsFor(system: UnitSystem): readonly RangePreset[] {
  return system === 'imperial'
    ? [
        { label: '300 ft', value: 90 },
        { label: '500 ft', value: 150 },
        { label: '¼ mi', value: 400 },
        { label: '½ mi', value: 800 },
        { label: '1 mi', value: 1600 },
      ]
    : [
        { label: '100 m', value: 100 },
        { label: '250 m', value: 250 },
        { label: '500 m', value: 500 },
        { label: '1 km', value: 1000 },
        { label: '2 km', value: 2000 },
      ];
}

/** Index of the preset closest to `value` (for highlighting an existing selection). */
export function closestPresetIndex(
  presets: readonly RangePreset[],
  value: number,
): number {
  let best = 0;
  let bestDiff = Infinity;
  presets.forEach((p, i) => {
    const diff = Math.abs(p.value - value);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  });
  return best;
}

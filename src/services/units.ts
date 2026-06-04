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
 * Format a metre distance for display.
 * @param meters distance in metres (backend unit)
 * @param system imperial | metric
 * @param opts.approx prefix with "~" (used for privacy-rounded nearby distances)
 */
export function formatDistance(
  meters: number,
  system: UnitSystem,
  opts?: { approx?: boolean },
): string {
  const prefix = opts?.approx ? '~' : '';
  if (!Number.isFinite(meters) || meters < 0) return `${prefix}0`;

  if (system === 'imperial') {
    const feet = meters * FEET_PER_METRE;
    if (feet < 528) {
      // under 0.1 mi → feet, rounded to nearest 10
      return `${prefix}${Math.max(0, Math.round(feet / 10) * 10)} ft`;
    }
    const miles = meters / METRES_PER_MILE;
    return miles >= 10
      ? `${prefix}${Math.round(miles)} mi`
      : `${prefix}${trimDecimal(miles)} mi`;
  }

  // metric
  if (meters < 1000) {
    return `${prefix}${Math.max(0, Math.round(meters / 10) * 10)} m`;
  }
  const km = meters / 1000;
  return km >= 10
    ? `${prefix}${Math.round(km)} km`
    : `${prefix}${trimDecimal(km)} km`;
}

/** Same as formatDistance but without the "~" — for ranges/radii labels. */
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
 * Broadcast-range presets per unit system. Values stay in metres so the backend
 * is untouched; labels are clean round numbers in the chosen system.
 */
export function rangePresetsFor(system: UnitSystem): readonly RangePreset[] {
  return system === 'imperial'
    ? [
        { label: '¼ mi', value: 400 },
        { label: '½ mi', value: 800 },
        { label: '1 mi', value: 1600 },
        { label: '2 mi', value: 3200 },
        { label: '3 mi', value: 4800 },
      ]
    : [
        { label: '500 m', value: 500 },
        { label: '1 km', value: 1000 },
        { label: '2 km', value: 2000 },
        { label: '3 km', value: 3000 },
        { label: '5 km', value: 5000 },
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

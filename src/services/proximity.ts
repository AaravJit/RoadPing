/**
 * proximity.ts — the one place the app understands how near another driver is.
 *
 * Phase 2 (docs/PHASE2_PROXIMITY_PRIVACY.md): the server tells us only a fixed
 * distance BAND per nearby driver. There is no coordinate, no bearing and no
 * numeric distance, so nothing here can place anyone on the map or say which
 * way they are. Components must use these helpers instead of comparing band
 * strings themselves.
 *
 * Band edges are server-defined (public.distance_band, migration 012) on
 * quantized positions, so they are approximate by design. Upper bounds are
 * inclusive: within_800m means a quantized distance of at most 800 m.
 * Keep DISTANCE_BANDS in sync with supabase/functions/_shared/proximity.ts.
 */
import type { NearbyDriverCard, VehicleType } from './types';
import type { UnitSystem } from './units';

export const DISTANCE_BANDS = [
  'within_800m',
  '800m_to_1600m',
  '1600m_to_3200m',
  'beyond_3200m',
] as const;

export type DistanceBand = (typeof DISTANCE_BANDS)[number];

interface BandCopy {
  /** Compact label for lists and the speaker capsule. */
  label: string;
  /** Full phrase for VoiceOver, e.g. "within half a mile". */
  spoken: string;
}

interface BandDefinition {
  /** 0 = nearest. */
  rank: number;
  imperial: BandCopy;
  metric: BandCopy;
}

// 800 m ≈ ½ mi, 1600 m ≈ 1 mi, 3200 m ≈ 2 mi: the same equivalence the
// range presets use (src/services/units.ts).
const BANDS: Record<DistanceBand, BandDefinition> = {
  within_800m: {
    rank: 0,
    imperial: { label: 'Within ½ mi', spoken: 'within half a mile' },
    metric: { label: 'Within 800 m', spoken: 'within 800 metres' },
  },
  '800m_to_1600m': {
    rank: 1,
    imperial: { label: '½–1 mi', spoken: 'half a mile to 1 mile away' },
    metric: { label: '0.8–1.6 km', spoken: '0.8 to 1.6 kilometres away' },
  },
  '1600m_to_3200m': {
    rank: 2,
    imperial: { label: '1–2 mi', spoken: '1 to 2 miles away' },
    metric: { label: '1.6–3.2 km', spoken: '1.6 to 3.2 kilometres away' },
  },
  beyond_3200m: {
    rank: 3,
    imperial: { label: 'Over 2 mi', spoken: 'more than 2 miles away' },
    metric: { label: 'Over 3.2 km', spoken: 'more than 3.2 kilometres away' },
  },
};

export function isDistanceBand(v: unknown): v is DistanceBand {
  return typeof v === 'string' && (DISTANCE_BANDS as readonly string[]).includes(v);
}

/** 0 for the nearest band, increasing outward. For sorting only. */
export function distanceBandRank(band: DistanceBand): number {
  return BANDS[band].rank;
}

/** "Within ½ mi", "1–2 mi", "0.8–1.6 km". Never a point estimate. */
export function formatDistanceBand(band: DistanceBand, system: UnitSystem): string {
  return BANDS[band][system].label;
}

/** VoiceOver phrase: "within half a mile", "1 to 2 miles away". */
export function describeDistanceBand(band: DistanceBand, system: UnitSystem): string {
  return BANDS[band][system].spoken;
}

/**
 * Nearest band first, then by name. Never by anything finer than the band:
 * position within a band must not suggest who is closer.
 */
export function compareNearbyDrivers(a: NearbyDriverCard, b: NearbyDriverCard): number {
  return (
    distanceBandRank(a.distance_band) - distanceBandRank(b.distance_band) ||
    a.display_name.localeCompare(b.display_name, undefined, { sensitivity: 'base' }) ||
    a.user_id.localeCompare(b.user_id)
  );
}

// ─── Response parsing ────────────────────────────────────────────────────────

const VEHICLE_TYPES: readonly VehicleType[] = [
  'car', 'motorcycle', 'truck', 'van', 'bicycle', 'other',
];

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

/**
 * @deprecated Pre-Phase-2 compatibility ONLY: maps the 50 m-rounded
 * `approximate_distance_m` of a backend that has not been upgraded yet onto
 * the same public bands, so this build can be tested before the Phase 2
 * Edge Function is deployed. The number is dropped immediately and never
 * reaches UI state. Delete this function and its call below once the Phase 2
 * backend is live in every environment.
 */
function legacyDistanceToBand(v: unknown): DistanceBand | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null;
  if (v <= 800) return 'within_800m';
  if (v <= 1600) return '800m_to_1600m';
  if (v <= 3200) return '1600m_to_3200m';
  return 'beyond_3200m';
}

/**
 * Validates one driver from get-nearby-drivers and copies only the fields the
 * app uses. Returns null for anything outside the contract (including an
 * unknown band): the driver is left out rather than shown with made-up data.
 */
export function parseNearbyDriver(raw: unknown): NearbyDriverCard | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.user_id !== 'string' || typeof r.display_name !== 'string') return null;

  const band = isDistanceBand(r.distance_band)
    ? r.distance_band
    : legacyDistanceToBand(r.approximate_distance_m);
  if (band === null) return null;

  const vehicleType = VEHICLE_TYPES.includes(r.vehicle_type as VehicleType)
    ? (r.vehicle_type as VehicleType)
    : null;

  return {
    user_id: r.user_id,
    handle: str(r.handle),
    display_name: r.display_name,
    avatar_url: str(r.avatar_url),
    vehicle_type: vehicleType,
    vehicle_label: str(r.vehicle_label),
    vehicle_color: str(r.vehicle_color),
    vehicle_make: str(r.vehicle_make),
    vehicle_model: str(r.vehicle_model),
    distance_band: band,
    is_speaking: r.is_speaking === true,
    dnd: r.dnd === true,
  };
}

/** Parses the whole response and orders it band-then-name. */
export function parseNearbyDrivers(json: unknown): NearbyDriverCard[] {
  const list =
    typeof json === 'object' && json !== null && Array.isArray((json as { drivers?: unknown }).drivers)
      ? ((json as { drivers: unknown[] }).drivers)
      : [];
  const drivers: NearbyDriverCard[] = [];
  for (const raw of list) {
    const d = parseNearbyDriver(raw);
    if (d !== null) drivers.push(d);
  }
  return drivers.sort(compareNearbyDrivers);
}

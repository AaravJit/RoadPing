/**
 * Public proximity contract (Phase 2, docs/PHASE2_PROXIMITY_PRIVACY.md).
 *
 * A nearby driver is described to another user by a fixed distance BAND
 * (public.distance_band in migration 012), never by a coordinate, bearing,
 * session id or numeric distance. Keep in sync with src/services/proximity.ts.
 */

export const DISTANCE_BANDS = [
  'within_800m',
  '800m_to_1600m',
  '1600m_to_3200m',
  'beyond_3200m',
] as const;

export type DistanceBand = (typeof DISTANCE_BANDS)[number];

export function isDistanceBand(v: unknown): v is DistanceBand {
  return typeof v === 'string' && (DISTANCE_BANDS as readonly string[]).includes(v);
}

/** Exactly what leaves get-nearby-drivers for each nearby driver. */
export interface PublicNearbyDriver {
  user_id: string;
  handle: string | null;
  display_name: string;
  avatar_url: string | null;
  vehicle_type: string | null;
  vehicle_label: string | null;
  vehicle_color: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  distance_band: DistanceBand;
  is_speaking: boolean;
  dnd: boolean;
}

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

/**
 * Copies only the permitted fields out of a get_nearby_drivers_v3 row, so a
 * future column added to the RPC can never reach clients by accident.
 * Returns null for a row that does not satisfy the contract.
 */
export function toPublicDriver(row: unknown): PublicNearbyDriver | null {
  if (typeof row !== 'object' || row === null) return null;
  const r = row as Record<string, unknown>;
  if (typeof r.user_id !== 'string' || typeof r.display_name !== 'string') return null;
  if (!isDistanceBand(r.distance_band)) return null;
  return {
    user_id: r.user_id,
    handle: str(r.handle),
    display_name: r.display_name,
    avatar_url: str(r.avatar_url),
    vehicle_type: str(r.vehicle_type),
    vehicle_label: str(r.vehicle_label),
    vehicle_color: str(r.vehicle_color),
    vehicle_make: str(r.vehicle_make),
    vehicle_model: str(r.vehicle_model),
    distance_band: r.distance_band,
    is_speaking: r.is_speaking === true,
    dnd: r.dnd === true,
  };
}

// ============================================================================
// RoadPing — Private Zone service
//
// Zones are OWNER-ONLY — they are never returned to anyone else, ever.
// - listZones / deleteZone: direct Supabase queries (RLS enforces owner_id = uid)
// - createZone: POST /create_private_zone (Edge Function builds the EWKT)
// - checkBlock: POST /check_private_zone_block (live "safe to start" preview)
// ============================================================================

import { supabase } from './supabase';
import { callEdgeFn } from './supabase';
import { ServiceError } from './types';
import type { PrivateZone, ZoneCreate, ZoneBlockResult } from './types';

// ── PostGIS → lat/lng ─────────────────────────────────────────────────────────

/**
 * Parse the `center` column returned by PostGIS via the JS client.
 * Supabase typically serialises geography columns as GeoJSON:
 *   { "type": "Point", "coordinates": [lng, lat] }
 * Fallback: WKT string "POINT(lng lat)".
 */
function parseCenter(raw: unknown): { lat: number; lng: number } {
  if (raw && typeof raw === 'object') {
    const geo = raw as { type?: string; coordinates?: [number, number] };
    if (geo.type === 'Point' && Array.isArray(geo.coordinates)) {
      return { lat: geo.coordinates[1], lng: geo.coordinates[0] };
    }
  }
  if (typeof raw === 'string') {
    const m = raw.match(/POINT\s*\(\s*([0-9.eE+-]+)\s+([0-9.eE+-]+)\s*\)/i);
    if (m) return { lat: parseFloat(m[2]), lng: parseFloat(m[1]) };
  }
  console.warn('[privateZone] could not parse center:', raw);
  return { lat: 0, lng: 0 };
}

function mapRow(row: Record<string, unknown>): PrivateZone {
  const { center, ...rest } = row;
  const { lat, lng } = parseCenter(center);
  return { ...rest, lat, lng } as PrivateZone;
}

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * List the signed-in user's private zones, most recently created first.
 */
export async function listZones(): Promise<PrivateZone[]> {
  const { data, error } = await supabase
    .from('private_zones')
    .select('id, user_id, name, center, radius_m, kind, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (error) throw new ServiceError('DB_ERROR', error.message);
  return (data ?? []).map(mapRow);
}

/**
 * Create a new private zone.
 * The Edge Function validates coordinates and clamps radius_m (50–5000, default 300).
 *
 * The Edge Function returns only a partial row ({ id, name, radius_m, kind,
 * created_at }), so we refetch the full row by id to return a complete,
 * accurate PrivateZone — no fabricated fields.
 */
export async function createZone(input: ZoneCreate): Promise<PrivateZone> {
  if (!input.name?.trim()) throw new ServiceError('INVALID_INPUT', 'Zone name is required.');
  if (!Number.isFinite(input.lat) || input.lat < -90 || input.lat > 90) {
    throw new ServiceError('INVALID_INPUT', 'lat must be between -90 and 90.');
  }
  if (!Number.isFinite(input.lng) || input.lng < -180 || input.lng > 180) {
    throw new ServiceError('INVALID_INPUT', 'lng must be between -180 and 180.');
  }

  const { zone } = await callEdgeFn<{ zone: { id: string } }>('create_private_zone', {
    name:     input.name.trim(),
    lat:      input.lat,
    lng:      input.lng,
    radius_m: input.radius_m,
    kind:     input.kind,
  });

  return getZone(zone.id);
}

/**
 * Fetch a single private zone by id (owner-only via RLS).
 * Throws `NOT_FOUND` if it doesn't exist or isn't the caller's.
 */
export async function getZone(id: string): Promise<PrivateZone> {
  const { data, error } = await supabase
    .from('private_zones')
    .select('id, user_id, name, center, radius_m, kind, created_at, updated_at')
    .eq('id', id)
    .single();

  if (error || !data) throw new ServiceError('NOT_FOUND', 'Zone not found.');
  return mapRow(data);
}

/**
 * Delete a private zone.
 * RLS ensures only the owner can delete their own zones.
 */
export async function deleteZone(id: string): Promise<void> {
  const { error } = await supabase
    .from('private_zones')
    .delete()
    .eq('id', id);

  if (error) throw new ServiceError('DB_ERROR', error.message);
}

/**
 * Live "safe to start" check: is the given position inside one of the
 * signed-in user's private zones?
 *
 * UX preview only — start_live_session re-validates authoritatively server-side.
 */
export async function checkBlock(lat: number, lng: number): Promise<ZoneBlockResult> {
  return callEdgeFn<ZoneBlockResult>('check_private_zone_block', { lat, lng });
}

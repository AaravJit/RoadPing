/**
 * Private zones service — Phase 8.
 *
 * Uses the Supabase client directly (RLS enforces owner-only access — no
 * cross-user data can be fetched even with a valid JWT).
 *
 * Privacy rules:
 *  - `center` is write-only: passed as WKT on INSERT, never returned in SELECT.
 *  - `radius_m` IS returned to the owner (they set it; it is their own data).
 *  - No other user can read any row due to the owner-only RLS policy.
 *  - No lat/lng text is displayed anywhere in the UI from this service.
 */
import { supabase } from './supabase';
import type { PrivateZoneRow, ZoneKind } from './types';
import type { Coords } from './location';

export type { ZoneKind };

export const ZONE_KIND_LABEL: Record<ZoneKind, string> = {
  home: 'Home',
  work: 'Work',
  custom: 'Custom',
};

export const ZONE_KIND_ICON: Record<ZoneKind, string> = {
  home: '🏠',
  work: '💼',
  custom: '📍',
};

export const ZONE_RADIUS_PRESETS = [
  { label: '100 m', value: 100 },
  { label: '250 m', value: 250 },
  { label: '500 m', value: 500 },
  { label: '1 km', value: 1000 },
  { label: '2 km', value: 2000 },
] as const;

/** Columns selected for all zone queries — excludes `center` (raw GPS). */
const ZONE_COLUMNS =
  'id, owner_id, name, kind, radius_m, created_at, updated_at' as const;

export async function listPrivateZones(): Promise<PrivateZoneRow[]> {
  const { data, error } = await supabase
    .from('private_zones')
    .select(ZONE_COLUMNS)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as PrivateZoneRow[];
}

export interface CreateZoneOptions {
  name: string;
  kind: ZoneKind;
  radius_m: number;
  /** Current GPS fix — used only for the zone center. Never stored on-device. */
  coords: Coords;
}

export async function createPrivateZone(
  opts: CreateZoneOptions,
): Promise<PrivateZoneRow> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // GIS convention: POINT(longitude latitude) — note lon before lat.
  const center = `POINT(${opts.coords.lng} ${opts.coords.lat})`;

  const { data, error } = await supabase
    .from('private_zones')
    .insert({
      owner_id: user.id,
      name: opts.name.trim(),
      kind: opts.kind,
      radius_m: opts.radius_m,
      center,
    })
    .select(ZONE_COLUMNS)
    .single();

  if (error) throw error;
  return data as PrivateZoneRow;
}

export interface UpdateZoneOptions {
  name?: string;
  kind?: ZoneKind;
  radius_m?: number;
}

export async function updatePrivateZone(
  id: string,
  updates: UpdateZoneOptions,
): Promise<PrivateZoneRow> {
  const payload: UpdateZoneOptions = {};
  if (updates.name !== undefined) payload.name = updates.name.trim();
  if (updates.kind !== undefined) payload.kind = updates.kind;
  if (updates.radius_m !== undefined) payload.radius_m = updates.radius_m;

  const { data, error } = await supabase
    .from('private_zones')
    .update(payload)
    .eq('id', id)
    .select(ZONE_COLUMNS)
    .single();

  if (error) throw error;
  return data as PrivateZoneRow;
}

export async function deletePrivateZone(id: string): Promise<void> {
  const { error } = await supabase
    .from('private_zones')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

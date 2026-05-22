// ============================================================================
// RoadPing — Vehicle service
// Direct Supabase queries — RLS enforces owner_id = auth.uid() for all ops.
// ============================================================================

import { supabase } from './supabase';
import { ServiceError } from './types';
import type { Vehicle, VehicleCreate, VehicleUpdate } from './types';

const BODY_TYPES = [
  'sedan', 'coupe', 'hatchback', 'wagon', 'suv', 'pickup',
  'van', 'crossover', 'sportsCar', 'supercar', 'motorcycle',
] as const;

function validateBodyType(bt: string | undefined | null): void {
  if (bt && !(BODY_TYPES as readonly string[]).includes(bt)) {
    throw new ServiceError('INVALID_INPUT', `Invalid body_type: "${bt}".`);
  }
}

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * List all vehicles owned by the signed-in user, primary vehicle first.
 */
export async function listVehicles(): Promise<Vehicle[]> {
  const { data, error } = await supabase
    .from('vehicles')
    .select('*')
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) throw new ServiceError('DB_ERROR', error.message);
  return (data ?? []) as Vehicle[];
}

/**
 * Fetch a single vehicle by ID.
 * Throws `NOT_FOUND` if the vehicle doesn't exist or doesn't belong to the caller.
 */
export async function getVehicle(id: string): Promise<Vehicle> {
  const { data, error } = await supabase
    .from('vehicles')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) throw new ServiceError('NOT_FOUND', 'Vehicle not found.');
  return data as Vehicle;
}

/**
 * Create a new vehicle.
 * If `is_primary` is true, the caller must call `setPrimary(id)` after creation
 * to atomically clear other primary flags — or set it here and accept that the
 * unique partial index will error if another primary exists.
 *
 * Simpler: use `createVehicle` then `setPrimary` separately.
 */
export async function createVehicle(input: VehicleCreate): Promise<Vehicle> {
  if (!input.make?.trim()) throw new ServiceError('INVALID_INPUT', 'make is required.');
  if (!input.model?.trim()) throw new ServiceError('INVALID_INPUT', 'model is required.');
  validateBodyType(input.body_type);

  const { data, error } = await supabase
    .from('vehicles')
    .insert({
      make:       input.make.trim(),
      model:      input.model.trim(),
      year:       input.year ?? null,
      color:      input.color ?? null,
      nickname:   input.nickname ?? null,
      body_type:  input.body_type ?? 'sedan',
      is_primary: input.is_primary ?? false,
    })
    .select()
    .single();

  if (error) throw new ServiceError('DB_ERROR', error.message);
  return data as Vehicle;
}

/**
 * Update mutable fields on an owned vehicle.
 */
export async function updateVehicle(id: string, updates: VehicleUpdate): Promise<Vehicle> {
  if (Object.keys(updates).length === 0) {
    throw new ServiceError('INVALID_INPUT', 'No fields to update.');
  }
  validateBodyType(updates.body_type);

  const patch: Record<string, unknown> = {};
  if (updates.make      !== undefined) patch.make       = updates.make?.trim();
  if (updates.model     !== undefined) patch.model      = updates.model?.trim();
  if (updates.year      !== undefined) patch.year       = updates.year;
  if (updates.color     !== undefined) patch.color      = updates.color;
  if (updates.nickname  !== undefined) patch.nickname   = updates.nickname;
  if (updates.body_type !== undefined) patch.body_type  = updates.body_type;

  const { data, error } = await supabase
    .from('vehicles')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new ServiceError('DB_ERROR', error.message);
  if (!data) throw new ServiceError('NOT_FOUND', 'Vehicle not found.');
  return data as Vehicle;
}

/**
 * Delete a vehicle.  If it was the primary vehicle, no automatic reassignment
 * is done — the caller should prompt the user to pick a new primary.
 */
export async function deleteVehicle(id: string): Promise<void> {
  const { error } = await supabase
    .from('vehicles')
    .delete()
    .eq('id', id);

  if (error) throw new ServiceError('DB_ERROR', error.message);
}

/**
 * Make a vehicle the primary.
 * Clears `is_primary` on all other vehicles in a two-step transaction
 * (supabase-js doesn't support multi-row updates in one call).
 * Race conditions are extremely unlikely in single-user context.
 */
export async function setPrimary(id: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new ServiceError('NOT_AUTHENTICATED', 'Not signed in.', 401);

  // 1. Clear all primaries for this owner.
  const { error: clearError } = await supabase
    .from('vehicles')
    .update({ is_primary: false })
    .eq('owner_id', user.id)
    .eq('is_primary', true);

  if (clearError) throw new ServiceError('DB_ERROR', clearError.message);

  // 2. Set the requested vehicle as primary.
  const { error: setError } = await supabase
    .from('vehicles')
    .update({ is_primary: true })
    .eq('id', id);

  if (setError) throw new ServiceError('DB_ERROR', setError.message);
}

/**
 * Vehicle service — owner-only CRUD for public.vehicles.
 *
 * UI-facing field naming (mapped to DB columns):
 *   nickname    → label
 *   is_primary  → is_active
 *
 * `vehicle_type` (a coarse, required enum) is derived from `body_type`
 * because the UI only asks the user for body_type.
 *
 * The partial unique index `vehicles_one_active_per_user WHERE is_active = true`
 * guarantees only one primary at a time. setPrimary() always unsets the prior
 * primary before promoting the target.
 */
import { supabase } from './supabase';
import type { BodyType, VehicleRow, VehicleType } from './types';

// ─── Body-type bridge (TS camelCase ↔ SQL snake_case) ────────────────────────

/**
 * UI body-type values. Differs from SQL enum only in `sportsCar` ↔ `sports_car`.
 */
export type BodyTypeUi =
  | 'sedan'
  | 'coupe'
  | 'hatchback'
  | 'wagon'
  | 'suv'
  | 'pickup'
  | 'van'
  | 'crossover'
  | 'sportsCar'
  | 'supercar'
  | 'motorcycle';

export interface BodyTypeOption {
  value: BodyTypeUi;
  label: string;
  emoji: string;
}

export const BODY_TYPE_OPTIONS: readonly BodyTypeOption[] = [
  { value: 'sedan', label: 'Sedan', emoji: '🚗' },
  { value: 'coupe', label: 'Coupe', emoji: '🚙' },
  { value: 'hatchback', label: 'Hatchback', emoji: '🚘' },
  { value: 'wagon', label: 'Wagon', emoji: '🚖' },
  { value: 'suv', label: 'SUV', emoji: '🚙' },
  { value: 'crossover', label: 'Crossover', emoji: '🚐' },
  { value: 'pickup', label: 'Pickup', emoji: '🛻' },
  { value: 'van', label: 'Van', emoji: '🚐' },
  { value: 'sportsCar', label: 'Sports car', emoji: '🏎' },
  { value: 'supercar', label: 'Supercar', emoji: '🏎' },
  { value: 'motorcycle', label: 'Motorcycle', emoji: '🏍' },
] as const;

export function bodyTypeUiToSql(v: BodyTypeUi): BodyType {
  return v === 'sportsCar' ? 'sports_car' : v;
}

export function bodyTypeSqlToUi(v: BodyType): BodyTypeUi {
  return v === 'sports_car' ? 'sportsCar' : (v as BodyTypeUi);
}

/** Coarse vehicle_type derived from body_type for the required SQL column. */
export function vehicleTypeFromBody(body: BodyTypeUi): VehicleType {
  if (body === 'motorcycle') return 'motorcycle';
  if (body === 'pickup') return 'truck';
  if (body === 'van') return 'van';
  return 'car';
}

export function bodyTypeLabel(body: BodyTypeUi): string {
  return BODY_TYPE_OPTIONS.find((o) => o.value === body)?.label ?? body;
}

export function bodyTypeEmoji(body: BodyTypeUi): string {
  return BODY_TYPE_OPTIONS.find((o) => o.value === body)?.emoji ?? '🚗';
}

// ─── Input types ──────────────────────────────────────────────────────────────

export interface VehicleInput {
  /** Nickname — shown as the card title. Maps to DB `label`. 1–50 chars. */
  nickname: string;
  bodyType: BodyTypeUi;
  make: string;
  model: string;
  /** Four-digit year. */
  year: number;
  color: string;
}

export const YEAR_MIN = 1900;
export const YEAR_MAX = new Date().getFullYear() + 1;

// ─── Validation ───────────────────────────────────────────────────────────────

export interface VehicleInputErrors {
  nickname?: string;
  bodyType?: string;
  make?: string;
  model?: string;
  year?: string;
  color?: string;
}

export function validateVehicleInput(input: VehicleInput): VehicleInputErrors {
  const errors: VehicleInputErrors = {};

  const nick = input.nickname.trim();
  if (nick.length === 0) errors.nickname = 'Nickname is required.';
  else if (nick.length > 50) errors.nickname = 'Must be 50 characters or fewer.';

  if (input.bodyType.length === 0) errors.bodyType = 'Pick a body type.';

  const make = input.make.trim();
  if (make.length === 0) errors.make = 'Make is required.';
  else if (make.length > 80) errors.make = 'Must be 80 characters or fewer.';

  const model = input.model.trim();
  if (model.length === 0) errors.model = 'Model is required.';
  else if (model.length > 80) errors.model = 'Must be 80 characters or fewer.';

  if (
    !Number.isInteger(input.year) ||
    input.year < YEAR_MIN ||
    input.year > YEAR_MAX
  ) {
    errors.year = `Enter a year between ${YEAR_MIN} and ${YEAR_MAX}.`;
  }

  const color = input.color.trim();
  if (color.length === 0) errors.color = 'Color is required.';
  else if (color.length > 40) errors.color = 'Must be 40 characters or fewer.';

  return errors;
}

export function hasValidationErrors(errors: VehicleInputErrors): boolean {
  return Object.values(errors).some((v) => typeof v === 'string' && v.length > 0);
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/** Lists the caller's vehicles, primary (is_active) first, then oldest first. */
export async function listVehicles(userId: string): Promise<VehicleRow[]> {
  const { data, error } = await supabase
    .from('vehicles')
    .select('*')
    .eq('user_id', userId)
    .order('is_active', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

// ─── Create ───────────────────────────────────────────────────────────────────

/**
 * Creates a vehicle for the user.
 * The first vehicle a user owns is automatically primary; subsequent vehicles
 * are created as non-primary (the caller can promote them via setPrimaryVehicle).
 */
export async function createVehicle(
  userId: string,
  input: VehicleInput,
): Promise<VehicleRow> {
  const existing = await listVehicles(userId);
  const isFirst = existing.length === 0;

  const { data, error } = await supabase
    .from('vehicles')
    .insert({
      user_id: userId,
      label: input.nickname.trim(),
      vehicle_type: vehicleTypeFromBody(input.bodyType),
      body_type: bodyTypeUiToSql(input.bodyType),
      make: input.make.trim(),
      model: input.model.trim(),
      color: input.color.trim(),
      year: input.year,
      is_active: isFirst,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

// ─── Update ───────────────────────────────────────────────────────────────────

/**
 * Updates an existing vehicle's editable fields.
 * RLS ensures the caller can only update their own row, but we also scope
 * by user_id for defence in depth.
 */
export async function updateVehicle(
  vehicleId: string,
  userId: string,
  input: VehicleInput,
): Promise<VehicleRow> {
  const { data, error } = await supabase
    .from('vehicles')
    .update({
      label: input.nickname.trim(),
      vehicle_type: vehicleTypeFromBody(input.bodyType),
      body_type: bodyTypeUiToSql(input.bodyType),
      make: input.make.trim(),
      model: input.model.trim(),
      color: input.color.trim(),
      year: input.year,
    })
    .eq('id', vehicleId)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

// ─── Delete ───────────────────────────────────────────────────────────────────

/**
 * Deletes a vehicle. If the deleted row was the primary and other vehicles
 * remain, promotes the oldest remaining vehicle to primary.
 */
export async function deleteVehicle(
  vehicleId: string,
  userId: string,
): Promise<void> {
  const all = await listVehicles(userId);
  const target = all.find((v) => v.id === vehicleId);
  if (target === undefined) return; // nothing to delete

  const { error } = await supabase
    .from('vehicles')
    .delete()
    .eq('id', vehicleId)
    .eq('user_id', userId);

  if (error) throw error;

  // Promote a successor if we removed the primary and others remain.
  if (target.is_active) {
    const remaining = all.filter((v) => v.id !== vehicleId);
    const successor = remaining[0]; // oldest by listVehicles ordering
    if (successor !== undefined) {
      await setPrimaryVehicle(successor.id, userId);
    }
  }
}

// ─── Set primary ──────────────────────────────────────────────────────────────

/**
 * Makes the given vehicle the user's primary.
 * Performs the unset-old → set-new sequence so the partial unique index
 * never sees two primaries at once.
 */
export async function setPrimaryVehicle(
  vehicleId: string,
  userId: string,
): Promise<void> {
  // Unset every other primary first (almost always exactly one row).
  const { error: unsetErr } = await supabase
    .from('vehicles')
    .update({ is_active: false })
    .eq('user_id', userId)
    .eq('is_active', true)
    .neq('id', vehicleId);

  if (unsetErr) throw unsetErr;

  const { error: setErr } = await supabase
    .from('vehicles')
    .update({ is_active: true })
    .eq('id', vehicleId)
    .eq('user_id', userId);

  if (setErr) throw setErr;
}

// ─── Error mapping ────────────────────────────────────────────────────────────

export function friendlyVehicleError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);

  if (msg.includes('vehicles_one_active_per_user')) {
    return 'Only one primary vehicle is allowed. Try again.';
  }
  if (msg.includes('23514') || msg.includes('violates check constraint')) {
    return 'One or more fields have an invalid value.';
  }
  if (msg.includes('network') || msg.includes('fetch')) {
    return 'Connection error. Check your internet and try again.';
  }
  return 'Failed to save vehicle. Please try again.';
}

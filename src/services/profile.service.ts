// ============================================================================
// RoadPing — Profile service
// Direct Supabase queries — RLS ensures own-row-only access.
// ============================================================================

import { supabase } from './supabase';
import { ServiceError } from './types';
import type { Profile, ProfileUpdate } from './types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapRow(row: Record<string, unknown>): Profile {
  return row as unknown as Profile;
}

async function requireUid(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new ServiceError('NOT_AUTHENTICATED', 'Not signed in.', 401);
  return data.user.id;
}

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * Fetch the signed-in user's own profile row.
 * Throws `ServiceError` if not authenticated or the row is missing.
 */
export async function getMyProfile(): Promise<Profile> {
  const uid = await requireUid();
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', uid)
    .single();

  if (error) throw new ServiceError('DB_ERROR', error.message);
  if (!data) throw new ServiceError('NOT_FOUND', 'Profile not found.');
  return mapRow(data);
}

/**
 * Update the signed-in user's profile fields.
 * Only `display_name`, `avatar_url`, `default_range_m`, and `dnd` may be changed.
 * Returns the full updated profile.
 */
export async function updateProfile(updates: ProfileUpdate): Promise<Profile> {
  const uid = await requireUid();

  // Validate range if provided.
  if (updates.default_range_m !== undefined) {
    const r = updates.default_range_m;
    if (!Number.isInteger(r) || r < 100 || r > 5000) {
      throw new ServiceError('INVALID_INPUT', 'default_range_m must be between 100 and 5000.');
    }
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', uid)
    .select()
    .single();

  if (error) throw new ServiceError('DB_ERROR', error.message);
  if (!data) throw new ServiceError('NOT_FOUND', 'Profile not found.');
  return mapRow(data);
}

/**
 * Check whether a handle is available (not taken by another user).
 * Handle format: 3–24 lowercase alphanumeric + underscore.
 * Returns `true` if the handle is free.
 */
export async function checkHandleAvailable(handle: string): Promise<boolean> {
  const normalized = handle.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,24}$/.test(normalized)) {
    throw new ServiceError(
      'INVALID_INPUT',
      'Handle must be 3–24 characters: lowercase letters, digits, and underscores only.',
    );
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .ilike('handle', normalized)
    .maybeSingle();

  if (error) throw new ServiceError('DB_ERROR', error.message);
  return data === null; // null = no row found = handle is free
}

/**
 * Claim a new handle for the signed-in user.
 * Throws if the handle is taken or invalid.
 */
export async function setHandle(handle: string): Promise<Profile> {
  const normalized = handle.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,24}$/.test(normalized)) {
    throw new ServiceError(
      'INVALID_INPUT',
      'Handle must be 3–24 characters: lowercase letters, digits, and underscores only.',
    );
  }

  const available = await checkHandleAvailable(normalized);
  if (!available) throw new ServiceError('INVALID_INPUT', 'That handle is already taken.');

  const uid = await requireUid();
  const { data, error } = await supabase
    .from('profiles')
    .update({ handle: normalized })
    .eq('id', uid)
    .select()
    .single();

  if (error) throw new ServiceError('DB_ERROR', error.message);
  return mapRow(data);
}

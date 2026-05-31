/**
 * Profile service — reads and writes to the public.profiles table.
 *
 * All writes go through the RLS-gated Supabase anon client (user JWT).
 * The `handle_new_user()` DB trigger creates the profile row on sign-up,
 * so clients always UPDATE (never INSERT) their own profile.
 */
import { supabase } from './supabase';
import type { ProfileRow } from './types';

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Fetches the authenticated user's own profile row.
 * Returns null if the row doesn't exist yet (unlikely after sign-up but safe).
 */
export async function getProfile(userId: string): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

// ─── Write ────────────────────────────────────────────────────────────────────

export type ProfileUpdates = Partial<
  Pick<
    ProfileRow,
    'handle' | 'display_name' | 'avatar_url' | 'bio' | 'dnd_mode' | 'default_range_m'
  >
>;

/**
 * Updates the user's own profile.
 * Throws on DB errors — callers should use friendlyProfileError() to
 * convert errors to UI-safe messages.
 */
export async function updateProfile(
  userId: string,
  updates: ProfileUpdates,
): Promise<ProfileRow> {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

// ─── Completeness check ───────────────────────────────────────────────────────

/**
 * A profile is "complete" when the user has set a valid handle.
 * Incomplete profiles trigger the profile-setup route guard in index.tsx.
 */
export function isProfileComplete(profile: ProfileRow | null): boolean {
  return (
    profile !== null &&
    typeof profile.handle === 'string' &&
    profile.handle.length >= 3
  );
}

// ─── Validation ───────────────────────────────────────────────────────────────

/** Returns null if the handle is valid, or an error string if it's invalid. */
export function validateHandle(handle: string): string | null {
  if (handle.length < 3) {
    return 'Must be at least 3 characters.';
  }
  if (handle.length > 24) {
    return 'Must be 24 characters or fewer.';
  }
  if (!/^[a-z0-9_]+$/.test(handle)) {
    return 'Only lowercase letters, numbers, and underscores allowed.';
  }
  return null;
}

/** Returns null if display_name is valid, or an error string if it's invalid. */
export function validateDisplayName(name: string): string | null {
  if (name.trim().length === 0) return 'Display name is required.';
  if (name.trim().length > 40) return 'Must be 40 characters or fewer.';
  return null;
}

// ─── Error mapping ─────────────────────────────────────────────────────────────

/**
 * Maps raw DB error messages to user-facing strings.
 * Handles the most common profile-save errors.
 */
export function friendlyProfileError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);

  // PostgreSQL unique constraint violation
  if (msg.includes('23505') || msg.includes('duplicate key')) {
    return 'This handle is already taken. Please choose another.';
  }
  // Check constraint violation (handle format, range, etc.)
  if (msg.includes('23514') || msg.includes('violates check constraint')) {
    return 'One or more fields have an invalid value.';
  }
  if (msg.includes('network') || msg.includes('fetch')) {
    return 'Connection error. Check your internet and try again.';
  }
  return 'Failed to save profile. Please try again.';
}

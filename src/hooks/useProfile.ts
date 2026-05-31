/**
 * useProfile — fetches and caches the authenticated user's profile row.
 *
 * Re-fetches whenever `userId` changes (e.g. on sign-in or sign-out).
 * Exposes a `refresh()` function so callers can re-fetch after an update.
 *
 * Usage:
 *   const { user } = useAuth();
 *   const { profile, isLoading, isComplete, refresh } = useProfile(user?.id ?? null);
 */
import { useCallback, useEffect, useState } from 'react';
import type { ProfileRow } from '@/services/types';
import { getProfile, isProfileComplete } from '@/services/profile';

// ─── Public interface ─────────────────────────────────────────────────────────

export interface UseProfileResult {
  /** The profile row, or null if not yet loaded or user is signed out. */
  profile: ProfileRow | null;
  /** True while a fetch is in-flight. */
  isLoading: boolean;
  /** Non-null when the last fetch failed. */
  error: string | null;
  /** Re-fetches the profile from Supabase. Call after updateProfile(). */
  refresh: () => Promise<void>;
  /**
   * True when the profile has a valid handle (≥ 3 chars).
   * Used by the route gate in index.tsx to decide whether to redirect.
   */
  isComplete: boolean;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useProfile(userId: string | null): UseProfileResult {
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (userId === null) {
      // Not signed in — clear stale data.
      setProfile(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const data = await getProfile(userId);
      setProfile(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profile.');
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  // Auto-fetch when userId changes (sign-in, sign-out, cold start).
  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    profile,
    isLoading,
    error,
    refresh,
    isComplete: isProfileComplete(profile),
  };
}

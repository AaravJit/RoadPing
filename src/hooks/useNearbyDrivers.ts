/**
 * useNearbyDrivers — polls the nearby-drivers service while a live session
 * is active and exposes the result list.
 *
 * Phase 6: backed by MOCK getNearbyDrivers().
 * Phase 7: same surface, real Edge Function under the hood.
 * Phase 11: Supabase Realtime subscription supplements the 5 s poll so
 *   is_speaking updates arrive in ~1 s without waiting for the next cycle.
 * Proximity Phase 2: the request carries no position or range (the server
 *   uses the stored live session), so polling no longer takes a GPS fix, and
 *   each driver has a distance band that the server holds for ~30 s.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { NearbyDriverCard } from '@/services/types';
import {
  NEARBY_POLL_INTERVAL_MS,
  getNearbyDrivers,
} from '@/services/nearbyDrivers';
import { subscribeToSpeakingState } from '@/services/voice';

export interface UseNearbyDriversResult {
  drivers: NearbyDriverCard[];
  isLoading: boolean;
  error: string | null;
  /** Force a refetch outside the poll schedule. */
  refresh: () => Promise<void>;
}

export interface UseNearbyDriversOptions {
  /** When false, the hook is idle (no polling, drivers stays []). */
  enabled: boolean;
}

export function useNearbyDrivers(
  opts: UseNearbyDriversOptions,
): UseNearbyDriversResult {
  const [drivers, setDrivers] = useState<NearbyDriverCard[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { drivers: list } = await getNearbyDrivers();
      setDrivers(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load nearby.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Poll effect: re-runs when enabled changes.
  useEffect(() => {
    if (!opts.enabled) {
      if (pollRef.current !== null) clearInterval(pollRef.current);
      pollRef.current = null;
      setDrivers([]);
      return;
    }

    void refresh();
    pollRef.current = setInterval(() => {
      void refresh();
    }, NEARBY_POLL_INTERVAL_MS);

    return () => {
      if (pollRef.current !== null) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [opts.enabled, refresh]);

  // Realtime effect: separate from the poll. Only depends on opts.enabled —
  // one subscription per live session. The server only delivers speaking
  // state for drivers in the caller's nearby set (same predicate as the list).
  useEffect(() => {
    if (!opts.enabled) return;

    const unsub = subscribeToSpeakingState(null, (change) => {
      setDrivers((prev) =>
        prev.map((d) =>
          d.user_id === change.user_id
            ? { ...d, is_speaking: change.is_speaking }
            : d,
        ),
      );
    });

    return unsub;
  }, [opts.enabled]);

  return { drivers, isLoading, error, refresh };
}

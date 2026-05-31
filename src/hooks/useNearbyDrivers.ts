/**
 * useNearbyDrivers — polls the nearby-drivers service while a live session
 * is active and exposes the result list.
 *
 * Phase 6: backed by MOCK getNearbyDrivers().
 * Phase 7: same surface, real Edge Function under the hood.
 * Phase 11: Supabase Realtime subscription supplements the 5 s poll so
 *   is_speaking updates arrive in ~1 s without waiting for the next cycle.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { NearbyDriverCard } from '@/services/types';
import { getCurrentCoords } from '@/services/location';
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
  /** Broadcast range in metres — also bounds the nearby query radius. */
  rangeM: number;
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
      const coords = await getCurrentCoords();
      const { drivers: list } = await getNearbyDrivers({
        lat: coords.lat,
        lng: coords.lng,
        range_m: opts.rangeM,
      });
      setDrivers(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load nearby.');
    } finally {
      setIsLoading(false);
    }
  }, [opts.rangeM]);

  // Poll effect: re-runs when enabled or rangeM changes.
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

  // Realtime effect: separate from the poll so range changes do not
  // tear down and re-create the Supabase channel unnecessarily.
  // Only depends on opts.enabled — one subscription per live session.
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

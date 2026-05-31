/**
 * useVehicles — fetches and caches the authenticated user's vehicles list.
 *
 * Re-fetches whenever `userId` changes. Callers should `await refresh()`
 * after a CRUD mutation so the cached list updates.
 */
import { useCallback, useEffect, useState } from 'react';
import type { VehicleRow } from '@/services/types';
import { listVehicles } from '@/services/vehicle';

export interface UseVehiclesResult {
  vehicles: VehicleRow[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** True once a successful fetch has occurred for the current userId. */
  hasLoaded: boolean;
  /** True if the user owns at least one vehicle. */
  hasVehicle: boolean;
  /** The primary (is_active) vehicle if any. */
  primary: VehicleRow | null;
}

export function useVehicles(userId: string | null): UseVehiclesResult {
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (userId === null) {
      setVehicles([]);
      setHasLoaded(false);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const rows = await listVehicles(userId);
      setVehicles(rows);
      setHasLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load vehicles.');
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const primary = vehicles.find((v) => v.is_active) ?? null;

  return {
    vehicles,
    isLoading,
    error,
    refresh,
    hasLoaded,
    hasVehicle: vehicles.length > 0,
    primary,
  };
}

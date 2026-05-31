/**
 * usePrivateZones — loads and manages the current user's private zones.
 *
 * All mutations set `isMutating` while in-flight so the UI can disable
 * controls. Errors surface via `error` for list failures and are thrown
 * from mutation functions so the caller can handle them (Alert, banner, etc.).
 */
import { useCallback, useEffect, useState } from 'react';
import {
  listPrivateZones,
  createPrivateZone,
  updatePrivateZone,
  deletePrivateZone,
  type CreateZoneOptions,
  type UpdateZoneOptions,
} from '@/services/privateZones';
import type { PrivateZoneRow } from '@/services/types';

export interface UsePrivateZonesResult {
  zones: PrivateZoneRow[];
  isLoading: boolean;
  isMutating: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  create: (opts: CreateZoneOptions) => Promise<PrivateZoneRow>;
  update: (id: string, updates: UpdateZoneOptions) => Promise<PrivateZoneRow>;
  remove: (id: string) => Promise<void>;
}

export function usePrivateZones(): UsePrivateZonesResult {
  const [zones, setZones] = useState<PrivateZoneRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const list = await listPrivateZones();
      setZones(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load zones.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = useCallback(
    async (opts: CreateZoneOptions): Promise<PrivateZoneRow> => {
      setIsMutating(true);
      try {
        const zone = await createPrivateZone(opts);
        setZones((prev) => [zone, ...prev]);
        return zone;
      } finally {
        setIsMutating(false);
      }
    },
    [],
  );

  const update = useCallback(
    async (id: string, updates: UpdateZoneOptions): Promise<PrivateZoneRow> => {
      setIsMutating(true);
      try {
        const updated = await updatePrivateZone(id, updates);
        setZones((prev) => prev.map((z) => (z.id === id ? updated : z)));
        return updated;
      } finally {
        setIsMutating(false);
      }
    },
    [],
  );

  const remove = useCallback(async (id: string): Promise<void> => {
    setIsMutating(true);
    try {
      await deletePrivateZone(id);
      setZones((prev) => prev.filter((z) => z.id !== id));
    } finally {
      setIsMutating(false);
    }
  }, []);

  return { zones, isLoading, isMutating, error, refresh, create, update, remove };
}

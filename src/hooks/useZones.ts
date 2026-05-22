import { useCallback, useEffect, useState } from 'react';
import {
  listZones,
  createZone as createZoneSvc,
  deleteZone as deleteZoneSvc,
} from '@/services';
import type { PrivateZone, ZoneCreate } from '@/services';

export function useZones() {
  const [zones, setZones] = useState<PrivateZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setZones(await listZones());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load Private Zones.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const create = useCallback(async (input: ZoneCreate) => {
    const z = await createZoneSvc(input);
    await reload();
    return z;
  }, [reload]);

  const remove = useCallback(async (id: string) => {
    await deleteZoneSvc(id);
    await reload();
  }, [reload]);

  return { zones, loading, error, reload, create, remove };
}

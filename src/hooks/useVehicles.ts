import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  listVehicles,
  createVehicle as createVehicleSvc,
  deleteVehicle as deleteVehicleSvc,
  setPrimary as setPrimarySvc,
} from '@/services';
import type { Vehicle, VehicleCreate } from '@/services';

export function useVehicles() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setVehicles(await listVehicles());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load vehicles.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const create = useCallback(async (input: VehicleCreate) => {
    const v = await createVehicleSvc(input);
    await reload();
    return v;
  }, [reload]);

  const remove = useCallback(async (id: string) => {
    await deleteVehicleSvc(id);
    await reload();
  }, [reload]);

  const choosePrimary = useCallback(async (id: string) => {
    await setPrimarySvc(id);
    await reload();
  }, [reload]);

  const primary = useMemo(
    () => vehicles.find((v) => v.is_primary) ?? vehicles[0] ?? null,
    [vehicles],
  );

  return { vehicles, primary, loading, error, reload, create, remove, choosePrimary };
}

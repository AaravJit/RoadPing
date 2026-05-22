import { useCallback, useEffect, useState } from 'react';
import { getMyProfile, updateProfile, setHandle as setHandleSvc } from '@/services';
import type { Profile, ProfileUpdate } from '@/services';

export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProfile(await getMyProfile());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load profile.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const save = useCallback(async (updates: ProfileUpdate) => {
    const next = await updateProfile(updates);
    setProfile(next);
    return next;
  }, []);

  const changeHandle = useCallback(async (handle: string) => {
    const next = await setHandleSvc(handle);
    setProfile(next);
    return next;
  }, []);

  return { profile, loading, error, reload, save, changeHandle };
}

/**
 * useOnboardingSeen — first-time education gate (Phase 17).
 *
 * Reads the AsyncStorage flag once on mount so the route gate can decide
 * whether to show the /welcome intro. `markSeen()` flips it immediately (in
 * memory) and persists, so the gate moves the user on without a flash.
 */
import { useCallback, useEffect, useState } from 'react';

import {
  loadOnboardingSeen,
  saveOnboardingSeen,
} from '@/services/onboardingStorage';

export interface UseOnboardingSeenResult {
  seen: boolean;
  /** False until the persisted flag has been read. */
  loading: boolean;
  markSeen: () => void;
}

export function useOnboardingSeen(): UseOnboardingSeenResult {
  const [seen, setSeen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      const v = await loadOnboardingSeen();
      if (active) {
        setSeen(v);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const markSeen = useCallback(() => {
    setSeen(true);
    void saveOnboardingSeen();
  }, []);

  return { seen, loading, markSeen };
}

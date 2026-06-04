/**
 * useLiveMapBehavior — "Live Map Behavior" preference (Phase 16D follow-up).
 *
 * Loads the saved choice non-blocking on mount and persists immediately on
 * change. Defaults to 'pause' (stop live session when the app backgrounds).
 *
 * NOTE: 'alwaysOn' is recorded but NOT yet functional — RoadPing has no
 * background-location entitlement, so the runtime always pauses on background.
 * See lifecycleStorage.ts and the Settings copy for the honest explanation.
 */
import { useCallback, useEffect, useState } from 'react';

import {
  DEFAULT_LIVE_MAP_BEHAVIOR,
  loadLiveMapBehavior,
  saveLiveMapBehavior,
  type LiveMapBehavior,
} from '@/services/lifecycleStorage';

export interface UseLiveMapBehaviorResult {
  behavior: LiveMapBehavior;
  setBehavior: (b: LiveMapBehavior) => void;
  /** True once the persisted value has been read (avoids a default flash). */
  loaded: boolean;
}

export function useLiveMapBehavior(): UseLiveMapBehaviorResult {
  const [behavior, setBehaviorState] = useState<LiveMapBehavior>(
    DEFAULT_LIVE_MAP_BEHAVIOR,
  );
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const stored = await loadLiveMapBehavior();
      if (active) {
        setBehaviorState(stored);
        setLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const setBehavior = useCallback((b: LiveMapBehavior) => {
    setBehaviorState(b);
    void saveLiveMapBehavior(b);
  }, []);

  return { behavior, setBehavior, loaded };
}

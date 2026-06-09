/**
 * useTermsAcceptance — local Terms/EULA acceptance gate state.
 *
 * Reads the AsyncStorage flag once on mount so the route gate (app/index.tsx)
 * can decide whether to show the /legal screen before auth. `accept()` flips
 * the flag immediately (in memory) and persists it, then best-effort mirrors
 * the acceptance into Supabase if a userId is available.
 *
 * Local acceptance is authoritative for showing/hiding the gate because the
 * user is not authenticated when it first appears. See services/legal.ts.
 */
import { useCallback, useEffect, useState } from 'react';

import {
  loadTermsAccepted,
  saveTermsAccepted,
  recordTermsAcceptanceRemote,
} from '@/services/legal';

export interface UseTermsAcceptanceResult {
  /** True once the current TERMS_VERSION has been accepted on this device. */
  accepted: boolean;
  /** False until the persisted flag has been read. */
  loading: boolean;
  /**
   * Record acceptance. Pass the userId when authenticated so it is also
   * mirrored to Supabase. Resolves once local persistence is done.
   */
  accept: (userId?: string | null) => Promise<void>;
}

export function useTermsAcceptance(): UseTermsAcceptanceResult {
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      const v = await loadTermsAccepted();
      if (active) {
        setAccepted(v);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const accept = useCallback(async (userId?: string | null) => {
    setAccepted(true); // advance UI immediately
    await saveTermsAccepted();
    if (userId) {
      // Best-effort server mirror; never blocks or throws.
      void recordTermsAcceptanceRemote(userId);
    }
  }, []);

  return { accepted, loading, accept };
}

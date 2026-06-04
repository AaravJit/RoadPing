/**
 * useEntitlement — app-wide RoadPing Plus entitlement (Phase 16C).
 *
 * Defaults to Free and only reflects Plus when the purchase service reports a
 * verified entitlement (it can't yet — see src/services/purchases.ts). Loads
 * non-blocking on mount and exposes `refresh()` for the paywall to call after a
 * purchase/restore. Never hard-locks app flows; gated UI shows upgrade prompts.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

import { getEntitlementStatus, type PlanTier } from '@/services/purchases';

interface EntitlementContextValue {
  tier: PlanTier;
  isPlus: boolean;
  /** True only when a real IAP layer is wired up. */
  purchasesAvailable: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
}

const EntitlementContext = createContext<EntitlementContextValue>({
  tier: 'free',
  isPlus: false,
  purchasesAvailable: false,
  loading: false,
  refresh: async () => {},
});

export function EntitlementProvider({ children }: { children: React.ReactNode }) {
  const [tier, setTier] = useState<PlanTier>('free');
  const [purchasesAvailable, setPurchasesAvailable] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const status = await getEntitlementStatus();
      setTier(status.tier);
      setPurchasesAvailable(status.purchasesAvailable);
    } catch {
      // Fail safe to Free — never block the app on entitlement errors.
      setTier('free');
      setPurchasesAvailable(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value: EntitlementContextValue = {
    tier,
    isPlus: tier === 'plus',
    purchasesAvailable,
    loading,
    refresh,
  };

  return (
    <EntitlementContext.Provider value={value}>
      {children}
    </EntitlementContext.Provider>
  );
}

export function useEntitlement(): EntitlementContextValue {
  return useContext(EntitlementContext);
}

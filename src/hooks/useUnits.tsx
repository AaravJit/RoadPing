/**
 * useUnits — app-wide distance unit preference (Phase 16D).
 *
 * Defaults to imperial (US-first), loads the saved choice non-blocking on mount,
 * and persists immediately on change. Display-only: never changes stored metres.
 * Mounted in app/_layout.tsx.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

import { loadUnitSystem, saveUnitSystem } from '@/services/unitsStorage';
import {
  describeDistanceBand,
  formatDistanceBand,
  type DistanceBand,
} from '@/services/proximity';
import {
  DEFAULT_UNIT_SYSTEM,
  formatRange,
  type UnitSystem,
} from '@/services/units';

interface UnitsContextValue {
  system: UnitSystem;
  setSystem: (s: UnitSystem) => void;
  /** Convenience formatters bound to the active system. */
  formatRange: (meters: number) => string;
  /** Another driver's distance band: "Within ½ mi", "0.8–1.6 km". */
  formatBand: (band: DistanceBand) => string;
  /** The same band for VoiceOver: "within half a mile". */
  describeBand: (band: DistanceBand) => string;
}

const UnitsContext = createContext<UnitsContextValue>({
  system: DEFAULT_UNIT_SYSTEM,
  setSystem: () => {},
  formatRange: (m) => formatRange(m, DEFAULT_UNIT_SYSTEM),
  formatBand: (b) => formatDistanceBand(b, DEFAULT_UNIT_SYSTEM),
  describeBand: (b) => describeDistanceBand(b, DEFAULT_UNIT_SYSTEM),
});

export function UnitsProvider({ children }: { children: React.ReactNode }) {
  const [system, setSystemState] = useState<UnitSystem>(DEFAULT_UNIT_SYSTEM);

  useEffect(() => {
    let active = true;
    void (async () => {
      const stored = await loadUnitSystem();
      if (active) setSystemState(stored);
    })();
    return () => {
      active = false;
    };
  }, []);

  const setSystem = useCallback((s: UnitSystem) => {
    setSystemState(s);
    void saveUnitSystem(s);
  }, []);

  const value: UnitsContextValue = {
    system,
    setSystem,
    formatRange: (m) => formatRange(m, system),
    formatBand: (b) => formatDistanceBand(b, system),
    describeBand: (b) => describeDistanceBand(b, system),
  };

  return <UnitsContext.Provider value={value}>{children}</UnitsContext.Provider>;
}

export function useUnits(): UnitsContextValue {
  return useContext(UnitsContext);
}

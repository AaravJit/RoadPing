/**
 * unitsStorage.ts — distance unit preference persistence (Phase 16D).
 *
 * Local-only via AsyncStorage; no backend, no schema change. Fail-safe: a read
 * error falls back to the default (imperial) and a write error is swallowed so
 * the preference can never block or crash the app.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEFAULT_UNIT_SYSTEM, isUnitSystem, type UnitSystem } from './units';

export const UNIT_STORAGE_KEY = 'roadping.unitSystem';

export async function loadUnitSystem(): Promise<UnitSystem> {
  try {
    const raw = await AsyncStorage.getItem(UNIT_STORAGE_KEY);
    return isUnitSystem(raw) ? raw : DEFAULT_UNIT_SYSTEM;
  } catch {
    return DEFAULT_UNIT_SYSTEM;
  }
}

export async function saveUnitSystem(system: UnitSystem): Promise<void> {
  try {
    await AsyncStorage.setItem(UNIT_STORAGE_KEY, system);
  } catch {
    // Non-blocking — the in-memory preference already applied.
  }
}

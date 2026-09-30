/**
 * Appearance + accent persistence.
 *
 * Local-only via AsyncStorage — no backend, no schema change. Every operation
 * is fail-safe: a read error falls back to the defaults (System appearance,
 * RoadPing Orange), and a write error is ignored so a storage problem can
 * never block or crash the app.
 *
 * The accent is stored under the original `roadping.themeKey` key; values
 * from the retired cockpit-theme picker are migrated on read.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  DEFAULT_ACCENT_KEY,
  migrateAccentKey,
  type AccentKey,
} from '@/theme/accents';

export type AppearancePreference = 'system' | 'light' | 'dark';

export const DEFAULT_APPEARANCE: AppearancePreference = 'system';

export const ACCENT_STORAGE_KEY = 'roadping.themeKey';
export const APPEARANCE_STORAGE_KEY = 'roadping.appearance';

export function isAppearancePreference(v: unknown): v is AppearancePreference {
  return v === 'system' || v === 'light' || v === 'dark';
}

export interface StoredThemePrefs {
  appearance: AppearancePreference;
  accent: AccentKey;
}

/** Load both preferences in one round-trip. Never throws. */
export async function loadThemePrefs(): Promise<StoredThemePrefs> {
  try {
    const pairs = await AsyncStorage.multiGet([
      APPEARANCE_STORAGE_KEY,
      ACCENT_STORAGE_KEY,
    ]);
    const rawAppearance = pairs[0]?.[1] ?? null;
    const rawAccent = pairs[1]?.[1] ?? null;
    return {
      appearance: isAppearancePreference(rawAppearance)
        ? rawAppearance
        : DEFAULT_APPEARANCE,
      accent: rawAccent === null ? DEFAULT_ACCENT_KEY : migrateAccentKey(rawAccent),
    };
  } catch {
    return { appearance: DEFAULT_APPEARANCE, accent: DEFAULT_ACCENT_KEY };
  }
}

export async function saveAppearance(value: AppearancePreference): Promise<void> {
  try {
    await AsyncStorage.setItem(APPEARANCE_STORAGE_KEY, value);
  } catch {
    // Non-blocking — the in-memory preference already applied.
  }
}

export async function saveAccent(value: AccentKey): Promise<void> {
  try {
    await AsyncStorage.setItem(ACCENT_STORAGE_KEY, value);
  } catch {
    // Non-blocking — the in-memory preference already applied.
  }
}

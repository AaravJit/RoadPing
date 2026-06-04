/**
 * Theme persistence (Phase 16B).
 *
 * Local-only via AsyncStorage — no backend, no schema change. Every operation
 * is fail-safe: a read error falls back to the default theme, and a write error
 * is swallowed so theme storage can never block or crash app usage.
 *
 * If a `profile.theme_key` column is ever added server-side, this is the single
 * place to layer it in (read remote → fall back to local → fall back default).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEFAULT_THEME_KEY, isThemeKey, type ThemeKey } from '@/theme/themes';

export const THEME_STORAGE_KEY = 'roadping.themeKey';

/** Load the stored theme key. Never throws; returns the default on any failure. */
export async function loadThemeKey(): Promise<ThemeKey> {
  try {
    const raw = await AsyncStorage.getItem(THEME_STORAGE_KEY);
    return isThemeKey(raw) ? raw : DEFAULT_THEME_KEY;
  } catch {
    return DEFAULT_THEME_KEY;
  }
}

/** Persist the theme key. Best-effort; failures are intentionally ignored. */
export async function saveThemeKey(key: ThemeKey): Promise<void> {
  try {
    await AsyncStorage.setItem(THEME_STORAGE_KEY, key);
  } catch {
    // Non-blocking — the in-memory theme already applied.
  }
}

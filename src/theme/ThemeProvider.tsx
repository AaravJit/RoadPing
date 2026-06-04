/**
 * ThemeProvider — supplies the active cockpit theme's accent tokens (Phase 16B).
 *
 * Mounted once near the app root. Loads the saved theme from AsyncStorage on
 * mount (non-blocking — renders with the default Amber Glow until it resolves),
 * and applies a new selection immediately while persisting in the background.
 *
 * Consume with `useTheme()`. The context has a sensible default value, so even
 * a component rendered outside the provider degrades to Amber Glow rather than
 * throwing — protecting launch stability.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { loadThemeKey, saveThemeKey } from '@/services/themeStorage';
import {
  DEFAULT_THEME_KEY,
  getTheme,
  THEME_PRESETS,
  type AccentTokens,
  type ThemeKey,
  type ThemePreset,
} from './themes';

interface ThemeContextValue {
  themeKey: ThemeKey;
  theme: ThemePreset;
  /** Convenience: the active accent token family. */
  accent: AccentTokens;
  /** Apply a theme immediately and persist it. */
  setThemeKey: (key: ThemeKey) => void;
  /** All presets, in display order. */
  presets: readonly ThemePreset[];
}

const defaultTheme = getTheme(DEFAULT_THEME_KEY);

const ThemeContext = createContext<ThemeContextValue>({
  themeKey: DEFAULT_THEME_KEY,
  theme: defaultTheme,
  accent: defaultTheme.accent,
  setThemeKey: () => {},
  presets: THEME_PRESETS,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeKey, setKey] = useState<ThemeKey>(DEFAULT_THEME_KEY);

  // Hydrate from storage once. loadThemeKey never throws.
  useEffect(() => {
    let active = true;
    void (async () => {
      const stored = await loadThemeKey();
      if (active) setKey(stored);
    })();
    return () => {
      active = false;
    };
  }, []);

  const setThemeKey = useCallback((key: ThemeKey) => {
    setKey(key); // apply immediately
    void saveThemeKey(key); // persist in background, fire-and-forget
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    const theme = getTheme(themeKey);
    return {
      themeKey,
      theme,
      accent: theme.accent,
      setThemeKey,
      presets: THEME_PRESETS,
    };
  }, [themeKey, setThemeKey]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Access the active theme's accent tokens and setter. */
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

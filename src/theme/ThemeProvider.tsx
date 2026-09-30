/**
 * ThemeProvider — RoadPing's appearance system.
 *
 * Two independent user choices:
 *   • Appearance: System (default) / Light / Dark
 *   • Accent:     RoadPing Orange / Blue / Indigo / Graphite
 *
 * Appearance is applied natively with Appearance.setColorScheme, which sets
 * the window's overrideUserInterfaceStyle. That keeps every native piece —
 * Apple Maps, Liquid Glass, system blur, alerts, action sheets, the keyboard —
 * on the same appearance as the React UI. "System" clears the override, so
 * RoadPing tracks iOS appearance changes (including automatic sunset
 * switching) immediately.
 *
 * The resolved theme also folds in the live accessibility preferences
 * (Increase Contrast → higher-contrast colors, Reduce Transparency → opaque
 * materials, Reduce Motion → functional motion only) and the material
 * capability of this device. Components consume it through `useTheme()` or a
 * `makeStyles()` hook; nothing else reads the color scheme.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Appearance, StyleSheet, useColorScheme } from 'react-native';

import {
  DEFAULT_APPEARANCE,
  loadThemePrefs,
  saveAccent,
  saveAppearance,
  type AppearancePreference,
} from '@/services/themeStorage';
import {
  ACCENT_PRESETS,
  DEFAULT_ACCENT_KEY,
  resolveAccent,
  type AccentKey,
  type AccentPreset,
  type AccentTokens,
} from './accents';
import {
  DEFAULT_A11Y,
  useAccessibilityPreferences,
  type AccessibilityPreferences,
} from './accessibility';
import {
  detectMaterialCapability,
  resolveMaterialMode,
  type MaterialMode,
} from './materials';
import { resolveColors, type ColorScheme, type SemanticColors } from './palette';

/** Everything a component needs to draw itself. Stable per combination. */
export interface Theme {
  scheme: ColorScheme;
  colors: SemanticColors;
  accent: AccentTokens;
  a11y: AccessibilityPreferences;
  material: MaterialMode;
}

interface ThemeContextValue extends Theme {
  appearance: AppearancePreference;
  setAppearance: (value: AppearancePreference) => void;
  accentKey: AccentKey;
  setAccentKey: (key: AccentKey) => void;
  accents: readonly AccentPreset[];
  /** The resolved Theme object (identity changes only when the look changes). */
  theme: Theme;
  /** True once saved preferences have been read. */
  hydrated: boolean;
}

function buildTheme(
  scheme: ColorScheme,
  accentKey: AccentKey,
  a11y: AccessibilityPreferences,
  material: MaterialMode,
): Theme {
  return {
    scheme,
    colors: resolveColors(scheme, a11y.increaseContrast),
    accent: resolveAccent(accentKey, scheme),
    a11y,
    material,
  };
}

const fallbackTheme = buildTheme('light', DEFAULT_ACCENT_KEY, DEFAULT_A11Y, 'solid');

const ThemeContext = createContext<ThemeContextValue>({
  ...fallbackTheme,
  theme: fallbackTheme,
  appearance: DEFAULT_APPEARANCE,
  setAppearance: () => {},
  accentKey: DEFAULT_ACCENT_KEY,
  setAccentKey: () => {},
  accents: ACCENT_PRESETS,
  hydrated: false,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [appearance, setAppearanceState] =
    useState<AppearancePreference>(DEFAULT_APPEARANCE);
  const [accentKey, setAccentState] = useState<AccentKey>(DEFAULT_ACCENT_KEY);
  const [hydrated, setHydrated] = useState(false);

  const systemScheme = useColorScheme();
  const a11y = useAccessibilityPreferences();
  // Capability is a property of the binary + OS; detect it once.
  const capability = useMemo(() => detectMaterialCapability(), []);

  useEffect(() => {
    let active = true;
    void loadThemePrefs().then((prefs) => {
      if (!active) return;
      setAppearanceState(prefs.appearance);
      setAccentState(prefs.accent);
      setHydrated(true);
    });
    return () => {
      active = false;
    };
  }, []);

  // Push the appearance override to the native window.
  useEffect(() => {
    Appearance.setColorScheme(appearance === 'system' ? null : appearance);
  }, [appearance]);

  const scheme: ColorScheme =
    appearance === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : appearance;
  const material = resolveMaterialMode(capability, a11y.reduceTransparency);

  const theme = useMemo(
    () => buildTheme(scheme, accentKey, a11y, material),
    [scheme, accentKey, a11y, material],
  );

  const setAppearance = useCallback((value: AppearancePreference) => {
    setAppearanceState(value);
    void saveAppearance(value);
  }, []);

  const setAccentKey = useCallback((key: AccentKey) => {
    setAccentState(key);
    void saveAccent(key);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      ...theme,
      theme,
      appearance,
      setAppearance,
      accentKey,
      setAccentKey,
      accents: ACCENT_PRESETS,
      hydrated,
    }),
    [theme, appearance, setAppearance, accentKey, setAccentKey, hydrated],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

/**
 * Theme-aware StyleSheet factory. Styles are built once per resolved theme
 * and cached, so components don't rebuild StyleSheets on every render.
 *
 *   const useStyles = makeStyles((t) => ({ title: { color: t.colors.textPrimary } }));
 *   const styles = useStyles();
 */
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(
  factory: (theme: Theme) => T,
): () => T {
  const cache = new WeakMap<Theme, T>();
  return function useStyles(): T {
    const { theme } = useContext(ThemeContext);
    let styles = cache.get(theme);
    if (styles === undefined) {
      styles = StyleSheet.create(factory(theme));
      cache.set(theme, styles);
    }
    return styles;
  };
}

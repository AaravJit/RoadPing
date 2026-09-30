/**
 * Accent presets — the user's personal tint, like choosing an accent color on
 * a Mac. An accent ONLY affects the brand/tint role (primary buttons, links,
 * selection, the user's own map puck). It never touches:
 *   • light / dark appearance
 *   • live / speaking red
 *   • destructive red
 *   • success / warning
 * so meaning and contrast stay constant whatever the user picks.
 *
 * Each accent carries separate light and dark values: `text` is tuned to
 * reach AA contrast as text on the matching background, while `fill` is the
 * saturated color used behind `onFill` labels.
 */
import type { ColorScheme } from './palette';

export type AccentKey = 'orange' | 'blue' | 'indigo' | 'graphite';

export interface AccentTokens {
  /** Solid fill for primary buttons, the PTT control and selection marks. */
  fill: string;
  /** Fill while pressed. */
  fillPressed: string;
  /** Label/icon color that sits on `fill`. */
  onFill: string;
  /** Accent used as text or a glyph on the screen background (links, values). */
  text: string;
  /** Soft tinted background for selected rows and chips. */
  muted: string;
}

export interface AccentPreset {
  key: AccentKey;
  name: string;
  light: AccentTokens;
  dark: AccentTokens;
}

export const DEFAULT_ACCENT_KEY: AccentKey = 'orange';

export const ACCENT_PRESETS: readonly AccentPreset[] = [
  {
    key: 'orange',
    name: 'RoadPing Orange',
    light: {
      fill: '#FF6B35',
      fillPressed: '#E85A26',
      onFill: '#1A0B03',
      text: '#C2410C',
      muted: 'rgba(255, 107, 53, 0.14)',
    },
    dark: {
      fill: '#FF6B35',
      fillPressed: '#E85A26',
      onFill: '#1A0B03',
      text: '#FF8A5C',
      muted: 'rgba(255, 107, 53, 0.20)',
    },
  },
  {
    key: 'blue',
    name: 'Blue',
    light: {
      fill: '#007AFF',
      fillPressed: '#0062CC',
      onFill: '#FFFFFF',
      text: '#0064D6',
      muted: 'rgba(0, 122, 255, 0.12)',
    },
    dark: {
      fill: '#0A84FF',
      fillPressed: '#0070DB',
      onFill: '#FFFFFF',
      text: '#4DA2FF',
      muted: 'rgba(10, 132, 255, 0.22)',
    },
  },
  {
    key: 'indigo',
    name: 'Indigo',
    light: {
      fill: '#5856D6',
      fillPressed: '#4644B8',
      onFill: '#FFFFFF',
      text: '#4B49C8',
      muted: 'rgba(88, 86, 214, 0.12)',
    },
    dark: {
      fill: '#5E5CE6',
      fillPressed: '#4B49CC',
      onFill: '#FFFFFF',
      text: '#9391FF',
      muted: 'rgba(94, 92, 230, 0.24)',
    },
  },
  {
    key: 'graphite',
    name: 'Graphite',
    light: {
      fill: '#3A3A3C',
      fillPressed: '#1C1C1E',
      onFill: '#FFFFFF',
      text: '#3A3A3C',
      muted: 'rgba(58, 58, 60, 0.10)',
    },
    dark: {
      fill: '#D1D1D6',
      fillPressed: '#AEAEB2',
      onFill: '#1C1C1E',
      text: '#D1D1D6',
      muted: 'rgba(209, 209, 214, 0.18)',
    },
  },
] as const;

const PRESET_BY_KEY = new Map<AccentKey, AccentPreset>(
  ACCENT_PRESETS.map((p) => [p.key, p]),
);

export function isAccentKey(value: unknown): value is AccentKey {
  return typeof value === 'string' && PRESET_BY_KEY.has(value as AccentKey);
}

/**
 * Keys from the retired "cockpit themes" picker, mapped to the closest
 * remaining accent so a returning user keeps a sensible choice. Anything
 * that doubled as a status color (red, green) folds back to the default.
 */
const LEGACY_KEYS: Record<string, AccentKey> = {
  amber: 'orange',
  midnight: 'blue',
  jdm: 'indigo',
  oem: 'graphite',
  ice: 'graphite',
  beige: 'orange',
  redline: 'orange',
  track: 'orange',
};

export function migrateAccentKey(value: unknown): AccentKey {
  if (isAccentKey(value)) return value;
  if (typeof value === 'string' && value in LEGACY_KEYS) {
    return LEGACY_KEYS[value] ?? DEFAULT_ACCENT_KEY;
  }
  return DEFAULT_ACCENT_KEY;
}

export function getAccentPreset(key: AccentKey): AccentPreset {
  return PRESET_BY_KEY.get(key) ?? ACCENT_PRESETS[0]!;
}

export function resolveAccent(key: AccentKey, scheme: ColorScheme): AccentTokens {
  const preset = getAccentPreset(key);
  return scheme === 'dark' ? preset.dark : preset.light;
}

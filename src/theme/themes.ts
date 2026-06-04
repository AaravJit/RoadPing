/**
 * RoadPing cockpit themes (Phase 16B).
 *
 * A theme is a controlled *accent palette* — like choosing a car interior trim.
 * It ONLY swaps the brand-accent family (what used to be `Colors.primary` /
 * `primaryDim` / `primaryMuted`). It never changes:
 *   • the dark background / surfaces  → stays cockpit-dark in every theme
 *   • destructive red (stop/hide/block/report/delete)
 *   • success / heartbeat / connected green
 *   • warning / privacy / safety semantics
 *
 * Those status colors live in `Colors` and are intentionally NOT themed so
 * meaning stays consistent and contrast stays high.
 */

export type ThemeKey =
  | 'amber'
  | 'redline'
  | 'midnight'
  | 'ice'
  | 'jdm'
  | 'track'
  | 'beige'
  | 'oem';

/** The accent token family a theme provides. */
export interface AccentTokens {
  /** Main accent — CTAs, active states (replaces the old Colors.primary). */
  accent: string;
  /** Darker accent — pressed states & borders (old Colors.primaryDim). */
  accentDim: string;
  /** Translucent accent — fills, halos, selected chips (old primaryMuted). */
  accentMuted: string;
  /** Text/icon color that sits ON an accent fill (must be high-contrast). */
  onAccent: string;
  /** Accent glow for halos / live rings. */
  glow: string;
}

export interface ThemePreset {
  key: ThemeKey;
  /** Display name shown in the picker. */
  name: string;
  /** Short cockpit-flavored description. */
  description: string;
  /**
   * Marks a premium ("RoadPing Plus") theme. Phase 16C: VISUAL marker only —
   * a PLUS badge is shown but selection is NOT gated yet. Enforcement lands
   * once real IAP entitlement exists (see docs/SUBSCRIPTIONS.md).
   */
  plus: boolean;
  accent: AccentTokens;
}

/** Default when nothing is stored / storage fails — the original RoadPing orange. */
export const DEFAULT_THEME_KEY: ThemeKey = 'amber';

/**
 * Presets in picker display order. Backgrounds stay dark across all of them;
 * each `onAccent` is chosen for AA-readable contrast on its accent fill.
 */
export const THEME_PRESETS: readonly ThemePreset[] = [
  {
    key: 'amber',
    plus: false,
    name: 'Amber Glow',
    description: 'The original RoadPing orange.',
    accent: {
      accent: '#FF6B35',
      accentDim: '#CC4F1C',
      accentMuted: 'rgba(255, 107, 53, 0.16)',
      onAccent: '#0A0A0A',
      glow: 'rgba(255, 107, 53, 0.35)',
    },
  },
  {
    key: 'redline',
    plus: true,
    name: 'Redline',
    description: 'Performance red. Eyes on the road.',
    accent: {
      accent: '#E5322D',
      accentDim: '#B11F1B',
      accentMuted: 'rgba(229, 50, 45, 0.16)',
      onAccent: '#FFFFFF',
      glow: 'rgba(229, 50, 45, 0.34)',
    },
  },
  {
    key: 'midnight',
    plus: false,
    name: 'Midnight Blue',
    description: 'Cool dashboard blue.',
    accent: {
      accent: '#4C8DFF',
      accentDim: '#2E6FE0',
      accentMuted: 'rgba(76, 141, 255, 0.16)',
      onAccent: '#04101F',
      glow: 'rgba(76, 141, 255, 0.34)',
    },
  },
  {
    key: 'ice',
    plus: true,
    name: 'Ice White',
    description: 'Clean, cold, minimal.',
    accent: {
      accent: '#DCE3EC',
      accentDim: '#B6C2D0',
      accentMuted: 'rgba(220, 227, 236, 0.14)',
      onAccent: '#0A0A0A',
      glow: 'rgba(220, 227, 236, 0.28)',
    },
  },
  {
    key: 'jdm',
    plus: true,
    name: 'JDM Purple',
    description: 'Neon-tuned street style.',
    accent: {
      accent: '#9D5BFF',
      accentDim: '#7B3FE0',
      accentMuted: 'rgba(157, 91, 255, 0.16)',
      onAccent: '#FFFFFF',
      glow: 'rgba(157, 91, 255, 0.34)',
    },
  },
  {
    key: 'track',
    plus: true,
    name: 'Track Green',
    description: 'Racing green with bite.',
    accent: {
      accent: '#2FD15A',
      accentDim: '#1FA646',
      accentMuted: 'rgba(47, 209, 90, 0.16)',
      onAccent: '#04130A',
      glow: 'rgba(47, 209, 90, 0.30)',
    },
  },
  {
    key: 'beige',
    plus: true,
    name: 'Luxury Beige',
    description: 'Warm leather and tan.',
    accent: {
      accent: '#D9C2A3',
      accentDim: '#BBA47F',
      accentMuted: 'rgba(217, 194, 163, 0.15)',
      onAccent: '#1A140C',
      glow: 'rgba(217, 194, 163, 0.28)',
    },
  },
  {
    key: 'oem',
    plus: false,
    name: 'OEM Gray',
    description: 'Factory-neutral silver.',
    accent: {
      accent: '#AEB7C2',
      accentDim: '#8B95A1',
      accentMuted: 'rgba(174, 183, 194, 0.15)',
      onAccent: '#0A0A0A',
      glow: 'rgba(174, 183, 194, 0.26)',
    },
  },
] as const;

const PRESET_BY_KEY: Record<ThemeKey, ThemePreset> = THEME_PRESETS.reduce(
  (acc, p) => {
    acc[p.key] = p;
    return acc;
  },
  {} as Record<ThemeKey, ThemePreset>,
);

/** Narrowing guard for an unknown stored value. */
export function isThemeKey(value: unknown): value is ThemeKey {
  return typeof value === 'string' && value in PRESET_BY_KEY;
}

/** Resolve a key to its preset; always returns a valid theme (falls back to default). */
export function getTheme(key: ThemeKey): ThemePreset {
  return PRESET_BY_KEY[key] ?? PRESET_BY_KEY[DEFAULT_THEME_KEY];
}

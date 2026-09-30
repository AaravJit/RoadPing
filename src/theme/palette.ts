/**
 * Semantic color palette.
 *
 * Screens never pick hex values. They read semantic roles from
 * `useTheme().colors`, which resolves to the light or dark set below (plus the
 * Increase Contrast adjustments when the user has that iOS setting on).
 *
 * Status colors (live, danger, success, warning) are fixed per appearance and
 * are never overridden by the user's accent choice.
 */

export type ColorScheme = 'light' | 'dark';

export interface SemanticColors {
  /** Screen root. Warm near-white in light mode, near-black in dark. */
  background: string;
  /** Grouped rows, cards and sheets that sit on `background`. */
  surface: string;
  /** Controls and wells inside a surface (chips, segmented track, inputs). */
  surfaceSecondary: string;
  /** Translucent neutral fill for pressed rows and quiet buttons. */
  fill: string;
  /** Opaque stand-in for glass when Reduce Transparency is on. */
  surfaceOpaque: string;

  separator: string;
  separatorStrong: string;

  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  /** Text on a dark/colored fill that is always white (live, danger fills). */
  textOnColor: string;

  /** Actively transmitting / speaking. Also the LIVE badge. */
  live: string;
  liveMuted: string;
  /** Destructive actions. */
  danger: string;
  dangerMuted: string;
  /** Only for meaningful healthy connection state. */
  success: string;
  successMuted: string;
  warning: string;
  warningMuted: string;

  /** Dimming layer behind sheets. */
  scrim: string;
  /** Shadow color for floating controls. */
  shadow: string;
  /** Neutral marker body on the map. */
  mapMarker: string;
  /** Label pill text on top of the map. */
  mapLabel: string;
}

const LIGHT: SemanticColors = {
  background: '#F5F4F1',
  surface: '#FFFFFF',
  surfaceSecondary: '#EDECE8',
  fill: 'rgba(120, 116, 110, 0.14)',
  surfaceOpaque: '#FBFAF8',

  separator: 'rgba(60, 56, 50, 0.16)',
  separatorStrong: 'rgba(60, 56, 50, 0.30)',

  textPrimary: '#1C1B19',
  textSecondary: '#5F5D59',
  textTertiary: '#8A8883',
  textOnColor: '#FFFFFF',

  live: '#FF3B30',
  liveMuted: 'rgba(255, 59, 48, 0.12)',
  danger: '#E0271C',
  dangerMuted: 'rgba(224, 39, 28, 0.10)',
  success: '#1F8A3B',
  successMuted: 'rgba(31, 138, 59, 0.12)',
  warning: '#9A5B00',
  warningMuted: 'rgba(214, 140, 0, 0.14)',

  scrim: 'rgba(20, 18, 15, 0.28)',
  shadow: '#000000',
  mapMarker: '#FFFFFF',
  mapLabel: '#1C1B19',
};

const DARK: SemanticColors = {
  background: '#0B0B0C',
  surface: '#1C1C1E',
  surfaceSecondary: '#2C2C2E',
  fill: 'rgba(120, 120, 128, 0.26)',
  surfaceOpaque: '#1F1F21',

  separator: 'rgba(235, 235, 245, 0.12)',
  separatorStrong: 'rgba(235, 235, 245, 0.24)',

  textPrimary: '#F5F5F7',
  textSecondary: '#A1A1A6',
  textTertiary: '#6E6E73',
  textOnColor: '#FFFFFF',

  live: '#FF453A',
  liveMuted: 'rgba(255, 69, 58, 0.18)',
  danger: '#FF453A',
  dangerMuted: 'rgba(255, 69, 58, 0.16)',
  success: '#30D158',
  successMuted: 'rgba(48, 209, 88, 0.16)',
  warning: '#FFB340',
  warningMuted: 'rgba(255, 179, 64, 0.16)',

  scrim: 'rgba(0, 0, 0, 0.50)',
  shadow: '#000000',
  mapMarker: '#2C2C2E',
  mapLabel: '#F5F5F7',
};

/** Increase Contrast (iOS "Darker System Colors") overrides. */
const LIGHT_HIGH_CONTRAST: Partial<SemanticColors> = {
  textSecondary: '#3F3D3A',
  textTertiary: '#5E5C58',
  separator: 'rgba(40, 36, 30, 0.32)',
  separatorStrong: 'rgba(40, 36, 30, 0.50)',
  live: '#D70015',
  danger: '#C1000F',
  success: '#146B2C',
  warning: '#7A4700',
};

const DARK_HIGH_CONTRAST: Partial<SemanticColors> = {
  textSecondary: '#C7C7CC',
  textTertiary: '#98989D',
  separator: 'rgba(235, 235, 245, 0.28)',
  separatorStrong: 'rgba(235, 235, 245, 0.45)',
  live: '#FF6961',
  danger: '#FF6961',
  success: '#30DB5B',
  warning: '#FFC45C',
};

export function resolveColors(
  scheme: ColorScheme,
  increaseContrast: boolean,
): SemanticColors {
  const base = scheme === 'dark' ? DARK : LIGHT;
  if (!increaseContrast) return base;
  return {
    ...base,
    ...(scheme === 'dark' ? DARK_HIGH_CONTRAST : LIGHT_HIGH_CONTRAST),
  };
}

/** Brand colors that never change with appearance (logo, splash). */
export const BRAND = {
  orange: '#FF6B35',
  amber: '#FFB347',
} as const;

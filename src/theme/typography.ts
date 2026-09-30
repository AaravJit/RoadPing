/**
 * Typography — the iOS text-style ramp (Large Title → Caption 2).
 *
 * Uses the system font (San Francisco) through React Native's default font
 * family, so iOS picks SF Text / SF Display optical sizes automatically.
 * Hierarchy comes from size and weight, not from uppercase or tracking.
 *
 * Dynamic Type: React Native scales `fontSize` and `lineHeight` with the
 * user's text size. Each style carries a `maxScale` so dense chrome (the map
 * header, the Voice Dock) grows with the user's setting but stops before it
 * breaks the layout; reading screens scale much further.
 */
import type { TextStyle } from 'react-native';

export type TextVariant =
  | 'largeTitle'
  | 'title1'
  | 'title2'
  | 'title3'
  | 'headline'
  | 'body'
  | 'callout'
  | 'subheadline'
  | 'footnote'
  | 'caption1'
  | 'caption2';

export const FontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  heavy: '800',
} as const satisfies Record<string, TextStyle['fontWeight']>;

type VariantSpec = Required<Pick<TextStyle, 'fontSize' | 'lineHeight' | 'fontWeight'>> & {
  letterSpacing?: number;
  /** Largest Dynamic Type multiplier this style should honor. */
  maxScale: number;
};

export const TextVariants: Record<TextVariant, VariantSpec> = {
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: FontWeight.bold, letterSpacing: 0.37, maxScale: 1.6 },
  title1: { fontSize: 28, lineHeight: 34, fontWeight: FontWeight.bold, letterSpacing: 0.36, maxScale: 1.7 },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: FontWeight.bold, letterSpacing: 0.35, maxScale: 1.8 },
  title3: { fontSize: 20, lineHeight: 25, fontWeight: FontWeight.semibold, letterSpacing: 0.38, maxScale: 2 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: FontWeight.semibold, letterSpacing: -0.41, maxScale: 2 },
  body: { fontSize: 17, lineHeight: 22, fontWeight: FontWeight.regular, letterSpacing: -0.41, maxScale: 2.2 },
  callout: { fontSize: 16, lineHeight: 21, fontWeight: FontWeight.regular, letterSpacing: -0.32, maxScale: 2.2 },
  subheadline: { fontSize: 15, lineHeight: 20, fontWeight: FontWeight.regular, letterSpacing: -0.24, maxScale: 2.2 },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: FontWeight.regular, letterSpacing: -0.08, maxScale: 2.2 },
  caption1: { fontSize: 12, lineHeight: 16, fontWeight: FontWeight.regular, letterSpacing: 0, maxScale: 2 },
  caption2: { fontSize: 11, lineHeight: 13, fontWeight: FontWeight.regular, letterSpacing: 0.07, maxScale: 2 },
};

/**
 * Tighter scale cap for controls layered over the live map. The driver must
 * still read them at a glance, but they cannot grow into the map itself.
 */
export const DRIVE_CHROME_MAX_SCALE = 1.35;

/** Plain TextStyle for a variant — for the rare component that can't use AppText. */
export function textStyle(variant: TextVariant): TextStyle {
  const { maxScale: _maxScale, ...style } = TextVariants[variant];
  return style;
}

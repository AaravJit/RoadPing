/**
 * RoadPing typography scale.
 *
 * Uses system fonts (SF Pro on iOS, Roboto on Android) for performance and
 * legibility in bright conditions. All sizes in dp/pt.
 *
 * Driving-safety note: body text is 16 px minimum. Labels that appear on
 * the main Drive screen use 18–20 px for at-a-glance readability.
 */
import { Platform } from 'react-native';

const FONT_FAMILY_BASE = Platform.select({
  ios: 'System',
  android: 'Roboto',
  default: 'System',
});

export const FontSize = {
  /** 11 px — micro labels, timestamps */
  micro: 11,
  /** 12 px — captions */
  caption: 12,
  /** 13 px — secondary labels */
  label: 13,
  /** 15 px — body small */
  bodySmall: 15,
  /** 16 px — default body */
  body: 16,
  /** 18 px — body large, driving-safe minimum for interactive */
  bodyLarge: 18,
  /** 20 px — subheadings */
  subheading: 20,
  /** 24 px — headings */
  heading: 24,
  /** 28 px — large headings */
  headingLarge: 28,
  /** 36 px — display / hero text */
  display: 36,
  /** 48 px — jumbo / big number display */
  jumbo: 48,
} as const;

export const FontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
} as const;

export const LineHeight = {
  tight: 1.2,
  normal: 1.4,
  relaxed: 1.6,
} as const;

/** Pre-composed text style helpers */
export const TextStyles = {
  /** Hero display — app name, big labels */
  display: {
    fontFamily: FONT_FAMILY_BASE,
    fontSize: FontSize.display,
    fontWeight: FontWeight.bold,
    lineHeight: FontSize.display * LineHeight.tight,
  },
  headingLarge: {
    fontFamily: FONT_FAMILY_BASE,
    fontSize: FontSize.headingLarge,
    fontWeight: FontWeight.bold,
    lineHeight: FontSize.headingLarge * LineHeight.tight,
  },
  heading: {
    fontFamily: FONT_FAMILY_BASE,
    fontSize: FontSize.heading,
    fontWeight: FontWeight.semibold,
    lineHeight: FontSize.heading * LineHeight.tight,
  },
  subheading: {
    fontFamily: FONT_FAMILY_BASE,
    fontSize: FontSize.subheading,
    fontWeight: FontWeight.semibold,
    lineHeight: FontSize.subheading * LineHeight.normal,
  },
  bodyLarge: {
    fontFamily: FONT_FAMILY_BASE,
    fontSize: FontSize.bodyLarge,
    fontWeight: FontWeight.regular,
    lineHeight: FontSize.bodyLarge * LineHeight.relaxed,
  },
  body: {
    fontFamily: FONT_FAMILY_BASE,
    fontSize: FontSize.body,
    fontWeight: FontWeight.regular,
    lineHeight: FontSize.body * LineHeight.relaxed,
  },
  bodyMedium: {
    fontFamily: FONT_FAMILY_BASE,
    fontSize: FontSize.body,
    fontWeight: FontWeight.medium,
    lineHeight: FontSize.body * LineHeight.relaxed,
  },
  label: {
    fontFamily: FONT_FAMILY_BASE,
    fontSize: FontSize.label,
    fontWeight: FontWeight.medium,
    lineHeight: FontSize.label * LineHeight.normal,
  },
  caption: {
    fontFamily: FONT_FAMILY_BASE,
    fontSize: FontSize.caption,
    fontWeight: FontWeight.regular,
    lineHeight: FontSize.caption * LineHeight.normal,
  },
  micro: {
    fontFamily: FONT_FAMILY_BASE,
    fontSize: FontSize.micro,
    fontWeight: FontWeight.regular,
    lineHeight: FontSize.micro * LineHeight.normal,
  },
} as const;

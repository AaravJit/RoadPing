/**
 * Spacing, corner radii and touch-target sizes.
 *
 * 4 pt base unit. Radii follow a small set so every surface in the app shares
 * the same corner language; pair them with `borderCurve: 'continuous'` for the
 * iOS squircle.
 */

export const Spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md12: 12,
  md: 16,
  md20: 20,
  lg: 24,
  xl: 32,
  xl40: 40,
  xxl: 48,
  huge: 64,
} as const;

export const Radius = {
  /** Badges, small tags. */
  xs: 6,
  /** Inputs inside a group, chips with text. */
  sm: 10,
  /** Grouped lists, cards. */
  md: 14,
  /** Large cards, floating controls. */
  lg: 22,
  /** Voice Dock, sheets. */
  xl: 32,
  full: 9999,
} as const;

/** Apple HIG minimum hit target. */
export const MIN_TOUCH_TARGET = 44;

/** Map-side controls a driver may reach for: bigger than the minimum. */
export const DRIVE_TOUCH_TARGET = 56;

/** The hold-to-talk control. */
export const HOLD_TO_TALK_SIZE = 104;

/** Standard horizontal inset for screen content. */
export const SCREEN_INSET = Spacing.md20;

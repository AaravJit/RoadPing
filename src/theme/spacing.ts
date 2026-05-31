/**
 * RoadPing spacing scale.
 *
 * Based on a 4 px base unit. All interactive tap targets are at least
 * 48 px to meet Apple HIG / Material minimum touch target guidelines —
 * especially important for in-car use.
 */

export const Spacing = {
  /** 2 px — hairline separators */
  hairline: 2,
  /** 4 px */
  xs: 4,
  /** 8 px */
  sm: 8,
  /** 12 px */
  md12: 12,
  /** 16 px — default content padding */
  md: 16,
  /** 20 px */
  md20: 20,
  /** 24 px */
  lg: 24,
  /** 32 px */
  xl: 32,
  /** 40 px */
  xl40: 40,
  /** 48 px */
  xxl: 48,
  /** 64 px */
  huge: 64,
  /** 80 px */
  massive: 80,
} as const;

export const Radius = {
  /** 4 px — small chips, pills */
  xs: 4,
  /** 8 px — inputs, small cards */
  sm: 8,
  /** 12 px — default card radius */
  md: 12,
  /** 16 px — large cards */
  lg: 16,
  /** 24 px — bottom sheets, modals */
  xl: 24,
  /** 9999 px — fully pill-shaped buttons */
  full: 9999,
} as const;

/** Minimum touch target for driving-safe UI */
export const MIN_TOUCH_TARGET = 48;

/** Tap target for the hold-to-talk button — large for driving */
export const HOLD_TO_TALK_SIZE = 120;

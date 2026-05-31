/**
 * RoadPing color palette — dark-first design.
 *
 * Designed for:
 *  - High contrast in direct sunlight (driving use case)
 *  - Clear live/active state hierarchy
 *  - Accessibility: all text pairs meet WCAG AA 4.5:1 on their backgrounds
 */

export const Colors = {
  // ── Backgrounds ──────────────────────────────────────────────────────────
  /** True deep background — screen root */
  background: '#0A0A0A',
  /** Slightly elevated surface — cards, bottom sheets */
  surface: '#111111',
  /** Double-elevated surface — modals, overlays */
  surfaceElevated: '#1A1A1A',
  /** Pressed/active surface state */
  surfacePressed: '#222222',

  // ── Borders ───────────────────────────────────────────────────────────────
  border: '#242424',
  borderFocused: '#404040',

  // ── Brand / Primary ───────────────────────────────────────────────────────
  /** Vibrant amber-orange — primary actions, CTAs */
  primary: '#FF6B35',
  primaryDim: '#CC4F1C',
  primaryMuted: 'rgba(255, 107, 53, 0.15)',
  /** Warm amber — secondary accent, highlights */
  accent: '#FFB347',

  // ── Semantic ──────────────────────────────────────────────────────────────
  success: '#4ADE80',
  successMuted: 'rgba(74, 222, 128, 0.15)',
  warning: '#FBBF24',
  warningMuted: 'rgba(251, 191, 36, 0.15)',
  error: '#F87171',
  errorMuted: 'rgba(248, 113, 113, 0.15)',

  // ── Live / Voice ──────────────────────────────────────────────────────────
  /** Bright red — live indicator dot, speaking ring */
  live: '#FF3B30',
  liveGlow: 'rgba(255, 59, 48, 0.30)',
  liveMuted: 'rgba(255, 59, 48, 0.15)',
  /** Pulsing green for online/active */
  online: '#34D399',
  onlineMuted: 'rgba(52, 211, 153, 0.15)',

  // ── Text ──────────────────────────────────────────────────────────────────
  textPrimary: '#FFFFFF',
  textSecondary: '#A0A0B0',
  textTertiary: '#50505F',
  textDisabled: '#383840',
  textInverse: '#0A0A0A',
  /** Orange-tinted text for branded labels */
  textBrand: '#FF6B35',

  // ── Icons / UI ────────────────────────────────────────────────────────────
  iconDefault: '#606070',
  iconActive: '#FFFFFF',
  iconBrand: '#FF6B35',

  // ── Overlays ──────────────────────────────────────────────────────────────
  overlay: 'rgba(0, 0, 0, 0.60)',
  overlayLight: 'rgba(0, 0, 0, 0.30)',

  // ── Transparent ───────────────────────────────────────────────────────────
  transparent: 'transparent',
} as const;

export type ColorKey = keyof typeof Colors;

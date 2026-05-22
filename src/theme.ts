// RoadPing design tokens — OLED dark, amber-orange accent.
// Lifted from the prototype (project/*.jsx): #000 base, #FF6A1A accent.

export const colors = {
  bg: '#000000',
  surface: '#1C1C1E',
  surface2: '#2C2C2E',
  surfaceFaint: 'rgba(255,255,255,0.05)',
  line: 'rgba(84,84,88,0.45)',
  line2: 'rgba(84,84,88,0.65)',

  accent: '#FF6A1A',
  accentDim: 'rgba(255,106,26,0.10)',
  accentBorder: 'rgba(255,106,26,0.6)',

  text: '#FFFFFF',
  textDim: 'rgba(235,235,245,0.6)',
  textMute: 'rgba(235,235,245,0.3)',

  danger: '#FF3D2E',
  dangerDim: 'rgba(255,61,46,0.10)',
  success: '#30D158',
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  pill: 999,
} as const;

export const space = (n: number) => n * 4;

export const font = {
  // RN has no CSS var()/letterSpacing strings; use numeric tracking.
  mono: 'Courier',
} as const;

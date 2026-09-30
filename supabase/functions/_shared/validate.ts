const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUUID(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

export function isLat(v: unknown): v is number {
  return typeof v === 'number' && isFinite(v) && v >= -90 && v <= 90;
}

export function isLng(v: unknown): v is number {
  return typeof v === 'number' && isFinite(v) && v >= -180 && v <= 180;
}

/** range_m must be 100–5000 inclusive */
export function isRangeM(v: unknown): v is number {
  return typeof v === 'number' && isFinite(v) && v >= 100 && v <= 5000;
}

/**
 * The only broadcast ranges (metres): the public distance-band edges plus one
 * maximum. private.range_step_m in migration 012 is the enforcing copy, and
 * src/services/units.ts offers exactly these presets. Because every range is
 * a band edge, "is this driver in my range" never says more than the band,
 * however many times someone restarts with a different range.
 */
export const BROADCAST_RANGES_M = [800, 1600, 3200, 4800] as const;

/**
 * Largest allowed range <= v, or null when v is below the smallest one.
 * Flooring never widens someone's radius; below 800 m the caller must choose.
 */
export function broadcastRangeFor(v: number): number | null {
  let step: number | null = null;
  for (const s of BROADCAST_RANGES_M) if (s <= v) step = s;
  return step;
}

// ── Enum value sets ────────────────────────────────────────────────────────

export const REPORT_REASONS = [
  'harassment',
  'threats',
  'hate_or_discrimination',
  'inappropriate_content',
  'spam',
  'impersonation',
  'dangerous_driving',
  'other',
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

export function isReportReason(v: unknown): v is ReportReason {
  return REPORT_REASONS.includes(v as ReportReason);
}

export const REPORT_CONTEXTS = ['map', 'room', 'voice', 'profile'] as const;

export type ReportContext = (typeof REPORT_CONTEXTS)[number];

export function isReportContext(v: unknown): v is ReportContext {
  return REPORT_CONTEXTS.includes(v as ReportContext);
}

export const SESSION_ENDED_REASONS = [
  'user_stopped',
  'expired',
  'entered_zone',
  'banned',
  'app_background',
  'logout',
] as const;

export type SessionEndedReason = (typeof SESSION_ENDED_REASONS)[number];

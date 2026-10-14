/**
 * Location freshness policy for heartbeats while live (Phase 3, B2).
 *
 * A heartbeat says "this driver is here now". It may only carry a real Core
 * Location fix that is recent and accurate enough; anything else fails closed
 * (no heartbeat), and a session that cannot produce a valid fix is shown as
 * reconnecting and then expires, exactly like a network outage.
 *
 * Stationary phones: iOS sends no new fix while the phone stays inside the
 * 50 m distance filter, so the absence of updates is NOT proof the phone has
 * not moved. Instead, once the last fix is older than FIX_REFRESH_AFTER_MS the
 * native module drops the distance filter (requestLocation() does nothing
 * while updates are running, per Apple) until a fresh fix arrives, then
 * restores it. A parked phone therefore keeps sending genuinely fresh fixes,
 * at about one per refresh period, without continuous high-rate delivery.
 *
 * modules/roadping-native/ios/RoadPingLiveLocation.swift mirrors these
 * numbers; scripts/client-test/locationFreshness.test.mjs checks they match.
 * Pure module: no React Native imports, so Node can test it directly.
 */

/** A fix older than this is never sent (the heartbeat is skipped instead). */
export const FIX_MAX_AGE_MS = 45_000;
/** Past this age the native side asks Core Location for a fresh fix. */
export const FIX_REFRESH_AFTER_MS = 20_000;
/** A fix less accurate than this (metres, horizontal) is not trusted. */
export const FIX_MAX_ACCURACY_M = 300;
/** Tolerated clock disagreement between fix timestamp and now. */
export const FIX_MAX_FUTURE_MS = 5_000;

export interface LocationTick {
  /** Tick time (epoch ms). */
  at: number;
  /** Timestamp of the Core Location fix (epoch ms), when one exists. */
  fixAt?: number;
  lat?: number;
  lng?: number;
  accuracy?: number;
  heading?: number;
  speed?: number;
  /** Native's own reason for withholding coordinates. */
  stale?: string;
}

export interface FreshFix {
  lat: number;
  lng: number;
  accuracyM: number;
  heading?: number;
  speedMps?: number;
  fixAt: number;
}

export type FixVerdict =
  | { ok: true; fix: FreshFix }
  | { ok: false; reason: 'no_fix' | 'too_old' | 'future' | 'inaccurate' | 'invalid' };

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Decides whether a native tick may be sent as a heartbeat. Fails closed. */
export function evaluateFix(tick: LocationTick, nowMs: number): FixVerdict {
  if (tick.lat === undefined && tick.lng === undefined) {
    if (tick.stale === 'too_old') return { ok: false, reason: 'too_old' };
    if (tick.stale === 'inaccurate') return { ok: false, reason: 'inaccurate' };
    if (tick.stale === 'future') return { ok: false, reason: 'future' };
    return { ok: false, reason: 'no_fix' };
  }
  const { lat, lng, accuracy, fixAt } = tick;
  if (!finite(lat) || !finite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { ok: false, reason: 'invalid' };
  }
  if (!finite(fixAt)) return { ok: false, reason: 'invalid' };
  const age = nowMs - fixAt;
  if (age < -FIX_MAX_FUTURE_MS) return { ok: false, reason: 'future' };
  if (age > FIX_MAX_AGE_MS) return { ok: false, reason: 'too_old' };
  if (!finite(accuracy) || accuracy <= 0) return { ok: false, reason: 'invalid' };
  if (accuracy > FIX_MAX_ACCURACY_M) return { ok: false, reason: 'inaccurate' };
  return {
    ok: true,
    fix: {
      lat,
      lng,
      accuracyM: accuracy,
      fixAt,
      ...(finite(tick.heading) && tick.heading >= 0 ? { heading: tick.heading } : {}),
      ...(finite(tick.speed) && tick.speed >= 0 ? { speedMps: tick.speed } : {}),
    },
  };
}

/** Whether a fix of this age (null: none yet) should trigger a refresh. */
export function needsRefresh(fixAgeMs: number | null): boolean {
  return fixAgeMs === null || fixAgeMs > FIX_REFRESH_AFTER_MS;
}

export type HeartbeatHealth = 'ok' | 'reconnecting' | 'expired';

/**
 * Client view of a session whose heartbeats have stopped (no valid fix or no
 * network). The server is authoritative: it expires the session 25 s + 35 s
 * grace after the last heartbeat; the client shows "reconnecting" first and
 * stops claiming to be live after a long outage.
 */
export function heartbeatHealth(
  sinceLastHeartbeatMs: number,
  heartbeatIntervalMs: number,
  sessionExpirySeconds: number,
): HeartbeatHealth {
  if (sinceLastHeartbeatMs > sessionExpirySeconds * 1000 * 8) return 'expired';
  if (sinceLastHeartbeatMs > heartbeatIntervalMs * 1.5) return 'reconnecting';
  return 'ok';
}

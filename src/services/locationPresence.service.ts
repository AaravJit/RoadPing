// ============================================================================
// RoadPing — Location Presence service
//
// Wraps POST /update_live_location (the heartbeat endpoint).
// The heartbeat must fire every ~15 s while live; the server TTL is 20 s.
// If the heartbeat detects the user has driven into a private zone, the session
// is force-ended and { live: false, reason: 'entered_zone' } is returned.
//
// Voice is intentionally NOT implemented here. No audio, no clips, no history.
// ============================================================================

import { callEdgeFn } from './supabase';
import { ServiceError } from './types';
import type { HeartbeatParams, HeartbeatResult } from './types';

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * Send a single location heartbeat while live.
 * Extends the session TTL and updates the presence row.
 *
 * Returns:
 *   { live: true, session_id, expires_at } — all is well
 *   { live: false, reason: 'entered_zone' } — user drove into a private zone;
 *     the session has been force-ended — stop the heartbeat and show the alert.
 *
 * Throws `ServiceError('NO_ACTIVE_SESSION')` if called when not live.
 */
export async function sendHeartbeat(params: HeartbeatParams): Promise<HeartbeatResult> {
  if (!Number.isFinite(params.lat) || params.lat < -90 || params.lat > 90) {
    throw new ServiceError('INVALID_INPUT', 'lat must be between -90 and 90.');
  }
  if (!Number.isFinite(params.lng) || params.lng < -180 || params.lng > 180) {
    throw new ServiceError('INVALID_INPUT', 'lng must be between -180 and 180.');
  }

  return callEdgeFn<HeartbeatResult>('update_live_location', {
    lat:      params.lat,
    lng:      params.lng,
    heading:  params.heading  ?? null,
    speed:    params.speed    ?? null,
    accuracy: params.accuracy ?? null,
  });
}

// ── HeartbeatManager ─────────────────────────────────────────────────────────

export type ForceEndReason = 'entered_zone' | 'no_session' | 'error';

export interface HeartbeatManagerOptions {
  /**
   * Called on every successful heartbeat tick.
   * Use this to keep local `expires_at` in sync.
   */
  onTick?: (result: HeartbeatResult) => void;
  /**
   * Called when the server force-ends the session (entered_zone) or when
   * the heartbeat receives a `NO_ACTIVE_SESSION` error.
   * Stop the manager and show the relevant UI when this fires.
   */
  onForceEnd?: (reason: ForceEndReason) => void;
  /**
   * Called on transient network / parse errors.
   * The manager continues running — a single missed heartbeat is fine
   * since the server TTL is 20 s and the default interval is 15 s.
   */
  onError?: (error: ServiceError) => void;
  /** Interval in milliseconds. Default: 15 000 (15 s). Min: 5 000. */
  intervalMs?: number;
}

/**
 * Manages a repeating heartbeat while the user is live.
 *
 * @example
 *   const hb = new HeartbeatManager({
 *     onForceEnd: (reason) => navigation.navigate('Hidden'),
 *   });
 *
 *   // When going live:
 *   hb.start(() => getLocationAsync());
 *
 *   // When stopping:
 *   hb.stop();
 */
export class HeartbeatManager {
  private timerId: ReturnType<typeof setInterval> | null = null;
  private readonly opts: HeartbeatManagerOptions;

  constructor(opts: HeartbeatManagerOptions = {}) {
    this.opts = opts;
  }

  get isRunning(): boolean {
    return this.timerId !== null;
  }

  /**
   * Start sending heartbeats.
   * `getParams` is called each tick to get the current GPS position.
   * It may be async (e.g. `expo-location` call).
   */
  start(getParams: () => HeartbeatParams | Promise<HeartbeatParams>): void {
    if (this.timerId !== null) return; // already running

    const intervalMs = Math.max(this.opts.intervalMs ?? 15_000, 5_000);

    const tick = async () => {
      let params: HeartbeatParams;
      try {
        params = await getParams();
      } catch {
        // Location unavailable — skip this tick; don't break the loop.
        return;
      }

      let result: HeartbeatResult;
      try {
        result = await sendHeartbeat(params);
      } catch (err) {
        const svcErr = err instanceof ServiceError
          ? err
          : new ServiceError('UNKNOWN', (err as Error).message);

        if (svcErr.isNoSession) {
          this.stop();
          this.opts.onForceEnd?.('no_session');
        } else {
          this.opts.onError?.(svcErr);
        }
        return;
      }

      this.opts.onTick?.(result);

      if (!result.live) {
        this.stop();
        this.opts.onForceEnd?.(result.reason as ForceEndReason ?? 'entered_zone');
      }
    };

    // Fire immediately, then on interval.
    tick();
    this.timerId = setInterval(tick, intervalMs);
  }

  /**
   * Stop the heartbeat loop (does NOT call stop_live_session).
   * Call `liveSession.stopSession()` separately to end the session on the server.
   */
  stop(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }
}

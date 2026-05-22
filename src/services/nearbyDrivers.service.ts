// ============================================================================
// RoadPing — Nearby Drivers service
//
// location_presence has NO SELECT policy — nearby drivers can ONLY be fetched
// via the get_nearby_drivers Edge Function (which calls the SECURITY DEFINER
// RPC). Realtime subscriptions on the presence table are therefore not possible.
//
// This service exposes:
//   fetch()     — single pull
//   subscribe() — returns an unsubscribe function; polls on an interval
//
// is_talking is always false from the API. The voice layer (not yet implemented)
// should mutate it locally based on Realtime events — it is NEVER stored.
// ============================================================================

import { callEdgeFn } from './supabase';
import { ServiceError } from './types';
import type { NearbyDriver } from './types';

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * Fetch nearby live drivers around the given position.
 * Results are coarsened to ~11 m by the server.
 * Empty array if the caller is not live or no one is nearby.
 */
export async function fetchNearbyDrivers(lat: number, lng: number): Promise<NearbyDriver[]> {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new ServiceError('INVALID_INPUT', 'lat must be between -90 and 90.');
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new ServiceError('INVALID_INPUT', 'lng must be between -180 and 180.');
  }

  const result = await callEdgeFn<{ drivers: NearbyDriver[] }>('get_nearby_drivers', { lat, lng });
  return result.drivers ?? [];
}

// ── NearbyDriversSubscription ─────────────────────────────────────────────────

export type DriversUpdateCallback = (drivers: NearbyDriver[]) => void;
export type DriversErrorCallback  = (error: ServiceError) => void;

/** Current position of the viewer. */
export interface Position {
  lat: number;
  lng: number;
}

/**
 * Returns the viewer's current position.
 * Called on EVERY poll so the nearby query follows the driver as they move.
 * May be async (e.g. an `expo-location` read).
 */
export type PositionGetter = () => Position | Promise<Position>;

export interface SubscribeOptions {
  /** Poll interval in milliseconds. Default: 5 000 (5 s). Min: 2 000. */
  intervalMs?: number;
  /** Called on transient errors. The subscription continues. */
  onError?: DriversErrorCallback;
}

/**
 * Subscribe to nearby drivers with polling.
 * Returns an unsubscribe function — call it in a cleanup effect.
 *
 * `getPosition` is invoked on every tick, so as the user drives the query
 * re-centres on their current location (do NOT pass a frozen lat/lng).
 *
 * @example
 *   const unsubscribe = subscribeNearbyDrivers(
 *     () => getCurrentPositionAsync(),   // returns { lat, lng }
 *     (drivers) => setDrivers(drivers),
 *   );
 *   return unsubscribe; // in useEffect cleanup
 */
export function subscribeNearbyDrivers(
  getPosition: PositionGetter,
  onUpdate: DriversUpdateCallback,
  options: SubscribeOptions = {},
): () => void {
  const intervalMs = Math.max(options.intervalMs ?? 5_000, 2_000);
  let cancelled = false;

  const reportError = (err: unknown) => {
    if (cancelled || !options.onError) return;
    options.onError(
      err instanceof ServiceError
        ? err
        : new ServiceError('UNKNOWN', (err as Error).message),
    );
  };

  const tick = async () => {
    if (cancelled) return;

    let pos: Position;
    try {
      pos = await getPosition();
    } catch (err) {
      // Location unavailable this tick — surface it, then keep polling.
      reportError(err);
      return;
    }

    try {
      const drivers = await fetchNearbyDrivers(pos.lat, pos.lng);
      if (!cancelled) onUpdate(drivers);
    } catch (err) {
      reportError(err);
    }
  };

  // Immediate first fetch.
  tick();
  const timerId = setInterval(tick, intervalMs);

  return () => {
    cancelled = true;
    clearInterval(timerId);
  };
}

// ── Talking state (local-only) ─────────────────────────────────────────────────

/**
 * Merge server-returned drivers with local talking state.
 * is_talking is never stored; the voice layer emits events locally.
 *
 * @example
 *   const merged = mergeTalkingState(drivers, talkingUserIds);
 */
export function mergeTalkingState(
  drivers: NearbyDriver[],
  talkingUserIds: ReadonlySet<string>,
): NearbyDriver[] {
  if (talkingUserIds.size === 0) return drivers;
  return drivers.map(d =>
    talkingUserIds.has(d.user_id) ? { ...d, is_talking: true } : d,
  );
}

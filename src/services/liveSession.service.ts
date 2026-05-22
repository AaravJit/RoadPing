// ============================================================================
// RoadPing — Live Session service
//
// start / stop go through Edge Functions (which call SECURITY DEFINER RPCs).
// getActiveSession is a direct query (own-row only via RLS).
// ============================================================================

import { supabase } from './supabase';
import { callEdgeFn } from './supabase';
import { ServiceError } from './types';
import type { LiveSession, StartSessionParams, StartSessionResult } from './types';

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * Go live.
 * The server atomically:
 *   1. Checks ban status
 *   2. Checks private-zone gate (TOO_CLOSE_TO_ZONE → ServiceError)
 *   3. Ends any existing active session
 *   4. Creates a new live_session row
 *   5. Upserts a location_presence row
 *
 * Throws:
 *   ServiceError('TOO_CLOSE_TO_ZONE') if inside a private zone
 *   ServiceError('USER_BANNED')       if the account is banned
 */
export async function startSession(params: StartSessionParams): Promise<StartSessionResult> {
  if (!Number.isFinite(params.lat) || params.lat < -90 || params.lat > 90) {
    throw new ServiceError('INVALID_INPUT', 'lat must be between -90 and 90.');
  }
  if (!Number.isFinite(params.lng) || params.lng < -180 || params.lng > 180) {
    throw new ServiceError('INVALID_INPUT', 'lng must be between -180 and 180.');
  }

  return callEdgeFn<StartSessionResult>('start_live_session', {
    lat:        params.lat,
    lng:        params.lng,
    range_m:    params.range_m,
    vehicle_id: params.vehicle_id ?? null,
    heading:    params.heading   ?? null,
    speed:      params.speed     ?? null,
    accuracy:   params.accuracy  ?? null,
  });
}

/**
 * Stop the current live session.
 * The presence row is immediately deleted — the user disappears from the map.
 * Safe to call even if no session is active (no-op on the server side).
 *
 * IMPORTANT: going live and stopping involve TWO things that must be paired:
 *   1. the server session  (startSession / stopSession)
 *   2. the local heartbeat  (HeartbeatManager.start / .stop)
 *
 * When the user taps Stop, call BOTH — and stop the heartbeat first so no tick
 * fires against an already-ended session:
 *
 *   heartbeat.stop();        // stop local timer
 *   await stopSession();     // end server session + delete presence
 *
 * (If you forget heartbeat.stop(), the next tick self-cancels on
 * NO_ACTIVE_SESSION — harmless, but don't rely on it.)
 */
export async function stopSession(): Promise<{ live: false }> {
  return callEdgeFn<{ live: false }>('stop_live_session');
}

/**
 * Fetch the signed-in user's currently active session, or null if not live.
 * Uses a direct Supabase query (RLS ensures own-row-only).
 */
export async function getActiveSession(): Promise<LiveSession | null> {
  const { data, error } = await supabase
    .from('live_sessions')
    .select('*')
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new ServiceError('DB_ERROR', error.message);
  return data as LiveSession | null;
}

/**
 * Return true if the signed-in user currently has an active, non-expired session.
 */
export async function isLive(): Promise<boolean> {
  const session = await getActiveSession();
  if (!session) return false;
  // Check local clock as a quick sanity check (server is authoritative).
  return new Date(session.expires_at) > new Date();
}

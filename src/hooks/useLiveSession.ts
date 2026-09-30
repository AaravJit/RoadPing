/**
 * useLiveSession — owns the Drive screen's live-state machine.
 *
 * State transitions:
 *
 *   offline  ──start()──▶  starting  ──(ok)──▶  live  ──stop()──▶  stopping  ──▶  offline
 *                              │
 *                              └──(perm denied / error)──▶  offline  (error shown)
 *
 * Phase 7 changes vs Phase 6:
 *  - Real location permission flow inside start().
 *  - Real Edge Function calls (services no longer mock).
 *  - userCoords exposed — used by NearbyMap for centering; never shown as text.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  HEARTBEAT_INTERVAL_MS,
  startLiveSession,
  stopLiveSession,
  updateLiveLocation,
} from '@/services/liveSession';
import {
  getCurrentCoords,
  getLocationPermissionStatus,
  requestLocationPermission,
  type Coords,
} from '@/services/location';
import { broadcastRangeFor } from '@/services/units';

export type LiveStatus = 'offline' | 'starting' | 'live' | 'stopping' | 'error';

export interface UseLiveSessionResult {
  status: LiveStatus;
  sessionId: string | null;
  /** When the current session started — drives the live timer. */
  startedAt: number | null;
  /** ISO from the last successful heartbeat — freshness indicator. */
  lastHeartbeatAt: string | null;
  /** ms since the last heartbeat — kept as state so the UI re-renders. */
  msSinceHeartbeat: number;
  /** Current broadcast range in metres. */
  rangeM: number;
  /** Most recent error message, or null. */
  error: string | null;
  /**
   * True when the session was blocked or stopped because the user is inside
   * one of their own private zones. Cleared when start() is called again or
   * the user explicitly calls stop().
   */
  hiddenInZone: boolean;
  /**
   * Last known GPS fix. Used only for map centering and heartbeat payloads.
   * Never displayed as raw coordinates in the UI.
   */
  userCoords: Coords | null;
  setRangeM: (m: number) => void;
  start: (vehicleId: string | null) => Promise<void>;
  stop: () => Promise<void>;
  /** Stop locally without surfacing a loading state (lifecycle cleanup). */
  stopSilent: () => Promise<void>;
}

export interface UseLiveSessionOptions {
  /** Initial broadcast range. Usually the profile's default_range_m. */
  initialRangeM: number;
}

export function useLiveSession(opts: UseLiveSessionOptions): UseLiveSessionResult {
  const [status, setStatus] = useState<LiveStatus>('offline');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [lastHeartbeatAt, setLastHeartbeatAt] = useState<string | null>(null);
  const [msSinceHeartbeat, setMsSinceHeartbeat] = useState(0);
  const [rangeM, setRangeM] = useState(opts.initialRangeM);
  const [error, setError] = useState<string | null>(null);
  const [hiddenInZone, setHiddenInZone] = useState(false);
  const [userCoords, setUserCoords] = useState<Coords | null>(null);

  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (heartbeatRef.current !== null) clearInterval(heartbeatRef.current);
      if (tickerRef.current !== null) clearInterval(tickerRef.current);
    };
  }, []);

  const stopSilent = useCallback(async () => {
    if (heartbeatRef.current !== null) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    if (tickerRef.current !== null) {
      clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
    try {
      await stopLiveSession();
    } catch {
      // Always force-offline, even if the network is gone.
    }
    setStatus('offline');
    setSessionId(null);
    setStartedAt(null);
    setLastHeartbeatAt(null);
    setMsSinceHeartbeat(0);
    // userCoords is kept after stop so the map can stay centered on the last
    // known location instead of jumping to 0,0. It is overwritten on next start.
  }, []);

  const stop = useCallback(async () => {
    setStatus('stopping');
    setHiddenInZone(false); // explicit user stop clears the zone banner
    await stopSilent();
  }, [stopSilent]);

  const start = useCallback(
    async (vehicleId: string | null) => {
      if (status === 'starting' || status === 'live') return;
      setError(null);
      setHiddenInZone(false); // clear on each new attempt
      const range = broadcastRangeFor(rangeM);
      if (range === null) {
        setError('Ranges now start at ½ mile. Pick a range to go live.');
        return;
      }
      setStatus('starting');

      try {
        // ── 1. Location permission ───────────────────────────────────────────
        let perm = await getLocationPermissionStatus();
        if (perm !== 'granted') {
          perm = await requestLocationPermission();
        }
        if (perm !== 'granted') {
          setError(
            'RoadPing needs location while active to show nearby live drivers.',
          );
          setStatus('offline');
          return;
        }

        // ── 2. First GPS fix ─────────────────────────────────────────────────
        const coords = await getCurrentCoords();
        setUserCoords(coords);

        // ── 3. Start session on server ───────────────────────────────────────
        const resp = await startLiveSession({
          vehicle_id: vehicleId ?? undefined,
          range_m: range,
          lat: coords.lat,
          lng: coords.lng,
          ...(coords.heading !== undefined ? { heading: coords.heading } : {}),
          ...(coords.speedMps !== undefined ? { speed_mps: coords.speedMps } : {}),
          ...(coords.accuracyM !== undefined ? { accuracy_m: coords.accuracyM } : {}),
        });

        const now = Date.now();
        setSessionId(resp.session_id);
        setStartedAt(now);
        setLastHeartbeatAt(new Date(now).toISOString());
        setMsSinceHeartbeat(0);
        setStatus('live');

        // 1-second wall-clock ticker for the live timer + "Xs ago" indicator.
        tickerRef.current = setInterval(() => {
          setMsSinceHeartbeat((prev) => prev + 1000);
        }, 1000);

        // Heartbeat loop — updates location presence + extends session expiry.
        heartbeatRef.current = setInterval(() => {
          void (async () => {
            try {
              const fix = await getCurrentCoords();
              setUserCoords(fix);
              const hb = await updateLiveLocation({
                lat: fix.lat,
                lng: fix.lng,
                ...(fix.heading !== undefined ? { heading: fix.heading } : {}),
                ...(fix.speedMps !== undefined ? { speed_mps: fix.speedMps } : {}),
                ...(fix.accuracyM !== undefined ? { accuracy_m: fix.accuracyM } : {}),
              });
              if (hb.status === 'session_ended') {
                // Server stopped the session — user entered a private zone.
                setHiddenInZone(true);
                await stopSilent();
                return;
              }
              setLastHeartbeatAt(new Date().toISOString());
              setMsSinceHeartbeat(0);
            } catch {
              // Network blip — keep the session alive but freshness goes stale.
            }
          })();
        }, HEARTBEAT_INTERVAL_MS);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to start RoadPing.';
        const inZone = msg.toLowerCase().includes('private zone');
        setHiddenInZone(inZone);
        setStatus('offline');
        setError(inZone ? null : msg);
      }
    },
    [rangeM, status, stopSilent],
  );

  return {
    status,
    sessionId,
    startedAt,
    lastHeartbeatAt,
    msSinceHeartbeat,
    rangeM,
    error,
    hiddenInZone,
    userCoords,
    setRangeM,
    start,
    stop,
    stopSilent,
  };
}

// Live-session orchestration — the single place that turns visibility on/off.
//
// Trust model enforced here:
//   * hidden by default — status starts 'hidden', no presence exists
//   * visible only after Start — start() must get a real GPS fix AND a server
//     session before status becomes 'live'
//   * Stop tears down in the right order — heartbeat first, then stopSession()
//   * location failure never fakes "live" — start() aborts and surfaces an error
//   * Private Zone gate is server-authoritative — TOO_CLOSE_TO_ZONE from
//     startSession flips back to 'hidden' with a clear message
//   * voice is NOT here — no audio, no recording, no history (by design)

import React, { createContext, useContext, useRef, useState, useCallback } from 'react';
import {
  startSession,
  stopSession,
  checkBlock,
  subscribeNearbyDrivers,
  HeartbeatManager,
  ServiceError,
} from '@/services';
import type { NearbyDriver, ZoneBlockResult } from '@/services';
import { getCurrentFix, LocationError, type Fix } from '@/lib/location';

export type LiveStatus = 'hidden' | 'starting' | 'live' | 'stopping';

interface LiveSessionState {
  status: LiveStatus;
  drivers: NearbyDriver[];
  /** Last live "safe to start" preview for the Hidden screen. */
  zonePreview: ZoneBlockResult | null;
  /** Human-readable error/notice to show in the UI (start failure, forced stop). */
  notice: string | null;

  /** Refresh the Hidden-screen zone preview (UX only; Start re-validates). */
  refreshZonePreview: () => Promise<void>;
  /** Go live. Resolves true if now live, false if it was blocked/failed. */
  start: (vehicleId: string | null) => Promise<boolean>;
  /** Stop and disappear. Always tears the heartbeat down before the session. */
  stop: () => Promise<void>;
  clearNotice: () => void;
}

const Ctx = createContext<LiveSessionState | null>(null);

export function LiveSessionProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<LiveStatus>('hidden');
  const [drivers, setDrivers] = useState<NearbyDriver[]>([]);
  const [zonePreview, setZonePreview] = useState<ZoneBlockResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const heartbeatRef = useRef<HeartbeatManager | null>(null);
  const unsubNearbyRef = useRef<(() => void) | null>(null);

  // Tear down all live machinery (timers + subscription). Local only.
  const teardownLocal = useCallback(() => {
    heartbeatRef.current?.stop();
    heartbeatRef.current = null;
    unsubNearbyRef.current?.();
    unsubNearbyRef.current = null;
    setDrivers([]);
  }, []);

  const goHidden = useCallback((message: string | null) => {
    teardownLocal();
    setStatus('hidden');
    if (message) setNotice(message);
  }, [teardownLocal]);

  const refreshZonePreview = useCallback(async () => {
    try {
      const fix = await getCurrentFix();
      const result = await checkBlock(fix.lat, fix.lng);
      setZonePreview(result);
    } catch {
      // Preview is best-effort; never block the screen on it.
      setZonePreview(null);
    }
  }, []);

  const start = useCallback(async (vehicleId: string | null): Promise<boolean> => {
    setNotice(null);
    setStatus('starting');

    // 1. Real GPS fix — abort cleanly if we can't get one.
    let fix: Fix;
    try {
      fix = await getCurrentFix();
    } catch (e) {
      const msg = e instanceof LocationError ? e.message : 'Could not read your location.';
      goHidden(msg);
      return false;
    }

    // 2. Server session (re-validates the Private Zone gate authoritatively).
    try {
      await startSession({
        lat: fix.lat,
        lng: fix.lng,
        vehicle_id: vehicleId,
        heading: fix.heading,
        speed: fix.speed,
        accuracy: fix.accuracy,
      });
    } catch (e) {
      if (e instanceof ServiceError && e.isTooCloseToZone) {
        goHidden('You are too close to a Private Zone. Move farther away before going live.');
      } else if (e instanceof ServiceError && e.isBanned) {
        goHidden('This account is not allowed to go live.');
      } else {
        goHidden(e instanceof Error ? e.message : 'Could not start. Please try again.');
      }
      return false;
    }

    // 3. Live: heartbeat (TTL refresh) + nearby polling with a MOVING getter.
    const hb = new HeartbeatManager({
      onForceEnd: (reason) => {
        goHidden(
          reason === 'entered_zone'
            ? 'You entered a Private Zone, so RoadPing hid you.'
            : 'Your live session ended.',
        );
      },
      onError: () => {
        // Transient heartbeat/location miss — keep running; the TTL covers a gap.
      },
    });
    hb.start(() => getCurrentFix()); // Fix is structurally a HeartbeatParams
    heartbeatRef.current = hb;

    unsubNearbyRef.current = subscribeNearbyDrivers(
      // Position getter is called every poll → query follows the driver.
      async () => {
        const f = await getCurrentFix();
        return { lat: f.lat, lng: f.lng };
      },
      (next) => setDrivers(next),
      { intervalMs: 5000, onError: () => { /* transient; keep polling */ } },
    );

    setStatus('live');
    return true;
  }, [goHidden]);

  const stop = useCallback(async () => {
    setStatus('stopping');
    // Heartbeat + subscription FIRST so nothing fires against an ended session.
    teardownLocal();
    try {
      await stopSession();
    } finally {
      setStatus('hidden');
    }
  }, [teardownLocal]);

  const clearNotice = useCallback(() => setNotice(null), []);

  return (
    <Ctx.Provider
      value={{
        status, drivers, zonePreview, notice,
        refreshZonePreview, start, stop, clearNotice,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useLiveSession(): LiveSessionState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useLiveSession must be used within a LiveSessionProvider');
  return ctx;
}

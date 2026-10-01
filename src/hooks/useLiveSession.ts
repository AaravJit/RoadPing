/**
 * useLiveSession — React view of liveController (src/services/live).
 *
 *   offline ──start()──▶ starting ──(ok)──▶ live ──stop()──▶ stopping ──▶ offline
 *                            └──(permission denied / error)──▶ offline (error shown)
 *
 * The session itself lives in liveController so it survives screen changes
 * and keeps running in the background while the driver is live (Phase 3).
 * It never starts on its own: only start(), from Go Live.
 */
import { useCallback, useEffect, useState } from 'react';
import { liveController, type EndNotice, type LiveSnapshot, type LiveStatus } from '@/services/live/liveController';
import type { Coords } from '@/services/location';

export type { LiveStatus, EndNotice };

export interface UseLiveSessionResult {
  status: LiveStatus;
  sessionId: string | null;
  /** When the current session started — drives the live timer. */
  startedAt: number | null;
  /** Epoch ms of the last successful heartbeat. */
  lastHeartbeatAt: number | null;
  /** Heartbeats are failing; the session may be expiring. */
  reconnecting: boolean;
  /** The session keeps running with RoadPing in the background. */
  backgroundCapable: boolean;
  /** Current broadcast range in metres. */
  rangeM: number;
  error: string | null;
  /** The session was blocked or ended because the driver is in a private zone. */
  hiddenInZone: boolean;
  /** Why the last session ended without the driver ending it. */
  endNotice: EndNotice;
  /** Last fix, for map centering and heartbeats only; never shown as text. */
  userCoords: Coords | null;
  setRangeM: (m: number) => void;
  start: (vehicleId: string | null) => Promise<void>;
  stop: () => Promise<void>;
  clearNotices: () => void;
}

export interface UseLiveSessionOptions {
  /** Initial broadcast range. Usually the profile's default_range_m. */
  initialRangeM: number;
  userId: string | null;
  dnd: boolean;
}

export function useLiveSession(opts: UseLiveSessionOptions): UseLiveSessionResult {
  const [snap, setSnap] = useState<LiveSnapshot>(liveController.snapshot);

  useEffect(() => liveController.subscribe(setSnap), []);

  useEffect(() => {
    if (liveController.snapshot.status === 'offline' && liveController.snapshot.rangeM === 0) {
      liveController.setRangeM(opts.initialRangeM);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    liveController.setDnd(opts.dnd);
  }, [opts.dnd]);

  const setRangeM = useCallback((m: number) => liveController.setRangeM(m), []);
  const start = useCallback(
    async (vehicleId: string | null) => {
      if (opts.userId === null) return;
      await liveController.start({ userId: opts.userId, vehicleId, dnd: opts.dnd });
    },
    [opts.userId, opts.dnd],
  );
  const stop = useCallback(() => liveController.stop('user_stopped'), []);
  const clearNotices = useCallback(() => liveController.clearNotices(), []);

  return { ...snap, setRangeM, start, stop, clearNotices };
}

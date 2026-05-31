/**
 * useAppLifecycleCleanup — runs a cleanup callback when the app moves to
 * the background or inactive state.
 *
 * Why: when the OS suspends the JS runtime, the heartbeat timer in
 * useLiveSession stops firing. The server would then expire the session at
 * the next sweep — but rather than rely on that, we explicitly stop the
 * live session on background so other drivers see us disappear instantly.
 *
 * Phase 6 just logs + invokes the callback. Phase 7 will use this hook to
 * call the real stop-live-session Edge Function via cleanup().
 */
import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

export interface UseAppLifecycleCleanupOptions {
  /**
   * When false the hook is a no-op (e.g. user isn't in a live session yet).
   */
  enabled: boolean;
  /** Fired when AppState transitions away from "active". */
  cleanup: () => void | Promise<void>;
}

export function useAppLifecycleCleanup(
  opts: UseAppLifecycleCleanupOptions,
): void {
  // Keep the latest cleanup in a ref so the subscription only attaches once
  // but always fires the freshest function.
  const cleanupRef = useRef(opts.cleanup);
  cleanupRef.current = opts.cleanup;

  const enabledRef = useRef(opts.enabled);
  enabledRef.current = opts.enabled;

  useEffect(() => {
    const sub = AppState.addEventListener(
      'change',
      (next: AppStateStatus) => {
        if (!enabledRef.current) return;
        if (next === 'background' || next === 'inactive') {
          if (__DEV__) {
            // eslint-disable-next-line no-console
            console.log(
              '[RoadPing] lifecycle cleanup firing — appstate=' + next,
            );
          }
          void cleanupRef.current();
        }
      },
    );
    return () => {
      sub.remove();
    };
  }, []);
}

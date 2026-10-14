/**
 * Waiting for Apple PushToTalk to finish initializing (Phase 3, B6).
 *
 * The native channel manager is created asynchronously at launch. Go Live can
 * be tapped before it exists; joining then would fail and silently drop the
 * whole session to foreground-only voice. Instead voiceController waits for
 * the native availability result, bounded by a timeout, and only then joins.
 * Anything other than "ready" in time is a truthful fallback, never a claim
 * that PushToTalk is active.
 *
 * Pure module (no React Native imports) so Node can test it with fakes.
 */

export type PttAvailability = 'initializing' | 'ready' | 'unavailable' | 'unsupported';
export type PttReadiness = 'ready' | 'unavailable' | 'unsupported' | 'timeout';

/** How long Go Live waits for the channel manager before falling back. */
export const PTT_INIT_TIMEOUT_MS = 3_000;
/** How long a requested join may take before it counts as failed. */
export const PTT_JOIN_TIMEOUT_MS = 10_000;

export interface PttReadinessDeps {
  /** Current native availability (also starts bootstrap if needed). */
  current: () => PttAvailability | undefined;
  /** Subscribes to native availability results; returns an unsubscribe. */
  onAvailability: (cb: (a: PttAvailability) => void) => () => void;
  setTimer: (cb: () => void, ms: number) => unknown;
  clearTimer: (t: unknown) => void;
}

function settled(a: PttAvailability | undefined): Exclude<PttReadiness, 'timeout'> | null {
  if (a === 'ready' || a === 'unavailable' || a === 'unsupported') return a;
  return null;
}

export function waitForPttReadiness(deps: PttReadinessDeps, timeoutMs = PTT_INIT_TIMEOUT_MS): Promise<PttReadiness> {
  return new Promise((resolve) => {
    let done = false;
    let timer: unknown = null;
    let unsubscribe: (() => void) | null = null;
    const finish = (r: PttReadiness) => {
      if (done) return;
      done = true;
      if (timer !== null) deps.clearTimer(timer);
      unsubscribe?.();
      resolve(r);
    };
    // Subscribe before reading the current value so a result that lands in
    // between is not missed.
    unsubscribe = deps.onAvailability((a) => {
      const s = settled(a);
      if (s) finish(s);
    });
    if (done) {
      unsubscribe();
      return;
    }
    let now: PttAvailability | undefined;
    try {
      now = deps.current();
    } catch {
      finish('unavailable');
      return;
    }
    if (done) return; // a result arrived while reading
    const s = settled(now);
    if (s) {
      finish(s);
      return;
    }
    timer = deps.setTimer(() => finish('timeout'), timeoutMs);
  });
}

/**
 * lifecycleStorage.ts — "Live Map Behavior" preference persistence (Phase 16D
 * follow-up).
 *
 * Local-only via AsyncStorage; no backend, no schema change. Fail-safe: a read
 * error falls back to the default ('pause') and a write error is swallowed so
 * the preference can never block or crash the app.
 *
 * IMPORTANT — honesty about background:
 *   The DEFAULT is 'pause' (the app stops the live session when it leaves the
 *   foreground). 'alwaysOn' records the user's *desired* behavior for a future
 *   build but does NOT enable real background location — RoadPing has no
 *   background-location entitlement and the runtime continues to pause on
 *   background. The Settings UI states this plainly.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type LiveMapBehavior = 'pause' | 'alwaysOn';

export const DEFAULT_LIVE_MAP_BEHAVIOR: LiveMapBehavior = 'pause';

export const LIVE_MAP_BEHAVIOR_KEY = 'roadping.liveMapBehavior';

export function isLiveMapBehavior(v: unknown): v is LiveMapBehavior {
  return v === 'pause' || v === 'alwaysOn';
}

export async function loadLiveMapBehavior(): Promise<LiveMapBehavior> {
  try {
    const raw = await AsyncStorage.getItem(LIVE_MAP_BEHAVIOR_KEY);
    return isLiveMapBehavior(raw) ? raw : DEFAULT_LIVE_MAP_BEHAVIOR;
  } catch {
    return DEFAULT_LIVE_MAP_BEHAVIOR;
  }
}

export async function saveLiveMapBehavior(behavior: LiveMapBehavior): Promise<void> {
  try {
    await AsyncStorage.setItem(LIVE_MAP_BEHAVIOR_KEY, behavior);
  } catch {
    // Non-blocking — the in-memory preference already applied.
  }
}

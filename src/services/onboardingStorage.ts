/**
 * onboardingStorage.ts — first-time education completion flag (Phase 17).
 *
 * Local-only via AsyncStorage; no backend, no schema change. Fail-safe: a read
 * error is treated as "not seen" so the worst case is showing the 3-card intro
 * one extra time, never a crash. A write error is swallowed.
 *
 * If an onboarding column is ever added server-side, this is the single place
 * to layer it in (read remote → fall back to local).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const ONBOARDING_SEEN_KEY = 'roadping.onboardingSeen.v1';

/** True once the user has finished (or skipped) the first-time education. */
export async function loadOnboardingSeen(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ONBOARDING_SEEN_KEY)) === 'true';
  } catch {
    return false;
  }
}

export async function saveOnboardingSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(ONBOARDING_SEEN_KEY, 'true');
  } catch {
    // Non-blocking — the in-memory flag already advanced the user.
  }
}

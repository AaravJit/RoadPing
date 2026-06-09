/**
 * legal.ts — Terms of Use / EULA acceptance.
 *
 * App Store Guideline 1.2 (User Generated Content) requires the user to agree
 * to the Terms/EULA *before* registering or logging in. We gate the auth flow
 * on a local AsyncStorage record (authoritative for showing/hiding the gate,
 * since the user is not yet authenticated when it first appears) and mirror the
 * acceptance into Supabase (profiles.accepted_terms_*) once a session exists, so
 * there is a durable server-side record.
 *
 * Re-prompt logic: acceptance is keyed to TERMS_VERSION. Bumping the version
 * invalidates every prior acceptance and the gate is shown again.
 *
 * Fail-safe: a storage read error is treated as "not accepted" (worst case is
 * showing the gate one extra time, never a crash). The remote mirror is
 * best-effort and never blocks the user.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

/**
 * Current Terms/EULA version. Bump this (e.g. to a new date) whenever the
 * Terms change to force every user to re-accept.
 */
export const TERMS_VERSION = '2026-06-09';

const ACCEPTED_TERMS_KEY = 'roadping.acceptedTermsVersion';

/**
 * Legal links shown on the gate. Privacy Policy opens the in-app screen
 * (reliable offline / during App Review). Terms of Use points at the
 * standard Apple EULA unless/until a hosted custom EULA replaces it.
 */
export const TERMS_OF_USE_URL =
  'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

/** Zero-tolerance summary displayed verbatim on the gate (Guideline 1.2). */
export const TERMS_SUMMARY =
  'RoadPing has zero tolerance for objectionable content or abusive users. ' +
  'You may not use RoadPing to harass, threaten, abuse, stalk, impersonate, ' +
  'spam, share hateful or sexual content, coordinate illegal activity, ' +
  'distract drivers, or endanger others. Users who violate these rules may be ' +
  'reported, blocked, suspended, or permanently removed. By continuing, you ' +
  'agree to RoadPing’s Terms of Use and Privacy Policy.';

// ─── Local acceptance (authoritative for the gate) ──────────────────────────

/** True once the current TERMS_VERSION has been accepted on this device. */
export async function loadTermsAccepted(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ACCEPTED_TERMS_KEY)) === TERMS_VERSION;
  } catch {
    return false;
  }
}

/** Persist local acceptance of the current version. Never throws. */
export async function saveTermsAccepted(): Promise<void> {
  try {
    await AsyncStorage.setItem(ACCEPTED_TERMS_KEY, TERMS_VERSION);
  } catch {
    // Non-blocking — the in-memory flag already advanced the user.
  }
}

// ─── Remote mirror (durable record in Supabase) ─────────────────────────────

/**
 * Records acceptance of the current Terms version on the user's profile.
 * Best-effort: returns false on any failure (e.g. offline, RLS) without
 * throwing, so callers never crash the auth flow.
 */
export async function recordTermsAcceptanceRemote(
  userId: string,
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({
        accepted_terms_at: new Date().toISOString(),
        accepted_terms_version: TERMS_VERSION,
      })
      .eq('id', userId);
    return !error;
  } catch {
    return false;
  }
}

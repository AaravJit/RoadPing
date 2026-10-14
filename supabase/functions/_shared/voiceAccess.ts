/**
 * Server-side voice access gate (Phase 3 native validation).
 *
 * Decides, from the authenticated user id alone, whether the new voice
 * backend (voice-transmission, ptt-token) may serve this account. It is
 * independent of the app's EXPO_PUBLIC_DISABLE_AGORA kill switch: a client
 * that ignores the kill switch, or calls the API directly, is still refused.
 *
 * Configuration (secret names only):
 *   VOICE_ACCESS_MODE       "allowlist" (the default when unset) or "open".
 *   VOICE_ALLOWED_USER_IDS  comma- or whitespace-separated auth user UUIDs.
 *
 * Test mode ("allowlist", or VOICE_ACCESS_MODE unset) fails closed: an
 * absent or empty list, or any entry that is not a UUID, denies everyone.
 * "open" serves every signed-in account and is for a later, separately
 * approved production rollout only. Any other mode value denies everyone.
 *
 * Only paths that start or extend voice are gated (context, begin, confirm,
 * grant, token registration, push fan-out targets). Cleanup is never gated:
 * ending a transmission and unregistering a token always work.
 */

import { isUUID } from './validate.ts';

export type VoiceAccess =
  | { mode: 'open' }
  | { mode: 'allowlist'; ids: ReadonlySet<string> }
  | { mode: 'closed'; reason: 'empty_allowlist' | 'invalid_allowlist' | 'invalid_mode' };

export function parseVoiceAccess(modeRaw: string | undefined, listRaw: string | undefined): VoiceAccess {
  const mode = (modeRaw ?? '').trim();
  if (mode === 'open') return { mode: 'open' };
  if (mode !== '' && mode !== 'allowlist') return { mode: 'closed', reason: 'invalid_mode' };

  const entries = (listRaw ?? '').split(/[\s,]+/).filter((s) => s.length > 0);
  if (entries.length === 0) return { mode: 'closed', reason: 'empty_allowlist' };
  if (!entries.every((e) => isUUID(e))) return { mode: 'closed', reason: 'invalid_allowlist' };
  return { mode: 'allowlist', ids: new Set(entries.map((e) => e.toLowerCase())) };
}

export function voiceAccessFromEnv(): VoiceAccess {
  const access = parseVoiceAccess(Deno.env.get('VOICE_ACCESS_MODE'), Deno.env.get('VOICE_ALLOWED_USER_IDS'));
  if (access.mode === 'closed') console.error(`voice access closed: ${access.reason}`);
  return access;
}

/** Exact match on the authenticated user id (UUIDs compared lowercased). */
export function voiceAllowed(access: VoiceAccess, userId: string): boolean {
  if (access.mode === 'open') return true;
  if (access.mode === 'closed') return false;
  return isUUID(userId) && access.ids.has(userId.toLowerCase());
}

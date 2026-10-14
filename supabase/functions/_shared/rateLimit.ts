import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Per-user fixed-window limits (see docs/SECURITY_LOCKDOWN.md). Each is well
 * above what the app sends in normal use.
 */
export const RATE_LIMITS = {
  nearby: { limit: 30, windowSeconds: 60 },
  heartbeat: { limit: 20, windowSeconds: 60 },
  startLive: { limit: 12, windowSeconds: 600 },
  startVoice: { limit: 60, windowSeconds: 60 },
  agoraToken: { limit: 30, windowSeconds: 600 },
  report: { limit: 20, windowSeconds: 3600 },
  // Phase 3 voice. A press is begin + confirm + end (+ one speaker renewal);
  // a listener needs one grant per incoming press plus at most two renewals.
  voiceBegin: { limit: 60, windowSeconds: 60 },
  voiceGrant: { limit: 180, windowSeconds: 60 },
  voiceContext: { limit: 30, windowSeconds: 60 },
  pttRegister: { limit: 30, windowSeconds: 600 },
} as const;

export type RateLimitBucket = keyof typeof RATE_LIMITS;

/**
 * Counts this request and returns true when the user is over the limit.
 *
 * Fails open: if the limiter itself errors the request is allowed and the
 * error logged, so a limiter fault cannot take the app down. The location
 * protections do not depend on rate limiting.
 */
export async function isRateLimited(
  admin: SupabaseClient,
  userId: string,
  bucket: RateLimitBucket,
): Promise<boolean> {
  const { limit, windowSeconds } = RATE_LIMITS[bucket];
  const { data, error } = await admin.rpc('consume_rate_limit', {
    p_user_id: userId,
    p_bucket: bucket,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error(`consume_rate_limit(${bucket}) error:`, error);
    return false;
  }
  return data === false;
}

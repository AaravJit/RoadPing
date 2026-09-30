/**
 * get-nearby-drivers
 *
 * Returns safe driver cards for all active users within range.
 *
 * Privacy guarantees:
 *   • Raw GPS coordinates are NEVER returned — only approximate_distance_m
 *   • approximate_distance_m is rounded to the nearest 50 m
 *   • Distance is measured from the caller's STORED presence (the position
 *     update-live-location accepted), never from coordinates in this request.
 *     `lat` / `lng` in the body are accepted for older clients and ignored.
 *   • Presence and sessions count only while unexpired
 *   • Visibility is mutual: within the smaller of the caller's effective range
 *     and the other driver's own broadcast range
 *   • The effective range is floored to a fixed step (RANGE_STEPS_M)
 *   • Banned, shadow-banned, and mutually blocked users are excluded
 *   • The caller must have an active live session and not be banned
 *   • Rate-limited per user
 *
 * The query runs inside the SECURITY DEFINER get_nearby_drivers_v2() SQL
 * function (service role only), which can read location_presence (a table
 * no client role can read).
 */

import { corsHeaders } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/client.ts';
import { getAuthUser } from '../_shared/auth.ts';
import { ok, err } from '../_shared/errors.ts';
import { floorToRangeStep, isRangeM } from '../_shared/validate.ts';
import { isRateLimited } from '../_shared/rateLimit.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const user = await getAuthUser(req);
    if (!user) return err(401, 'Unauthorized');

    // ── Parse body ──────────────────────────────────────────────────────────
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return err(400, 'Request body must be valid JSON');
    }

    const { range_m } = body;

    if (range_m !== undefined && !isRangeM(range_m)) {
      return err(400, 'range_m must be between 100 and 5000');
    }

    const admin = createAdminClient();

    if (await isRateLimited(admin, user.id, 'nearby')) {
      return err(429, 'Too many requests');
    }

    // ── Ban check ────────────────────────────────────────────────────────────
    const { data: profile } = await admin
      .from('profiles')
      .select('is_banned')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile || (profile as { is_banned: boolean }).is_banned) {
      return err(403, 'Account suspended');
    }

    // ── Require active session ───────────────────────────────────────────────
    // Only live users can see other live users.
    const { data: session } = await admin
      .from('live_sessions')
      .select('id, range_m')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (!session) {
      return err(403, 'You must have an active session to see nearby drivers');
    }

    const sessionData = session as { id: string; range_m: number };

    // Cap to the user's session range — client cannot exceed what was set at
    // start — then floor to a fixed step.
    const effectiveRange = floorToRangeStep(
      range_m !== undefined
        ? Math.min(range_m as number, sessionData.range_m)
        : sessionData.range_m,
    );

    // ── Proximity query ──────────────────────────────────────────────────────
    const { data: drivers, error: queryError } = await admin.rpc('get_nearby_drivers_v2', {
      p_caller_id: user.id,
      p_range_m: effectiveRange,
    });

    if (queryError) {
      console.error('get_nearby_drivers_v2 RPC error:', queryError);
      return err(500, 'Failed to fetch nearby drivers');
    }

    return ok({ drivers: drivers ?? [] });
  } catch (e) {
    console.error('get-nearby-drivers unhandled error:', e);
    return err(500, 'Internal server error');
  }
});

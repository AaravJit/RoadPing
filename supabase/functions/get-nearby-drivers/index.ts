/**
 * get-nearby-drivers
 *
 * Returns safe driver cards for all active users within range.
 *
 * Privacy guarantees:
 *   • Raw GPS coordinates are NEVER returned — only approximate_distance_m
 *   • approximate_distance_m is rounded to the nearest 50 m
 *   • Banned, shadow-banned, and mutually blocked users are excluded
 *   • The caller must have an active live session to query
 *   • range_m is capped to the caller's stored session range
 *
 * The actual proximity query runs inside the SECURITY DEFINER
 * get_nearby_drivers() SQL function which can read location_presence
 * (a table with no SELECT RLS policy for any client role).
 */

import { corsHeaders } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/client.ts';
import { getAuthUser } from '../_shared/auth.ts';
import { ok, err } from '../_shared/errors.ts';
import { isLat, isLng, isRangeM } from '../_shared/validate.ts';

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

    const { lat, lng, range_m } = body;

    if (!isLat(lat)) return err(400, 'lat must be a number between -90 and 90');
    if (!isLng(lng)) return err(400, 'lng must be a number between -180 and 180');
    if (range_m !== undefined && !isRangeM(range_m)) {
      return err(400, 'range_m must be between 100 and 5000');
    }

    const admin = createAdminClient();

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

    // Cap to the user's session range — client cannot exceed what was set at start
    const effectiveRange = range_m !== undefined
      ? Math.min(range_m as number, sessionData.range_m)
      : sessionData.range_m;

    // ── Proximity query ──────────────────────────────────────────────────────
    // Runs inside SECURITY DEFINER — can read location_presence coords.
    const { data: drivers, error: queryError } = await admin.rpc('get_nearby_drivers', {
      p_lat: lat,
      p_lng: lng,
      p_range_m: effectiveRange,
      p_caller_id: user.id,
    });

    if (queryError) {
      console.error('get_nearby_drivers RPC error:', queryError);
      return err(500, 'Failed to fetch nearby drivers');
    }

    return ok({ drivers: drivers ?? [] });
  } catch (e) {
    console.error('get-nearby-drivers unhandled error:', e);
    return err(500, 'Internal server error');
  }
});

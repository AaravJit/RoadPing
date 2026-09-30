/**
 * get-nearby-drivers request handling (Phase 2). index.ts wires the real
 * dependencies; handler.test.ts drives this with fakes.
 *
 * Privacy contract (docs/PHASE2_PROXIMITY_PRIVACY.md):
 *   • Each driver comes back with a fixed distance_band only: no coordinates,
 *     no numeric distance, no bearing, no session id.
 *   • Position AND range come from the caller's stored live session. Nothing
 *     in the request body reaches the query, so `lat`, `lng` and `range_m`
 *     cannot move the query point or probe distance with smaller ranges.
 *   • Pre-Phase-2 builds (they always send `lat`/`lng`/`range_m`; this build
 *     sends `{}`) get an empty list: they would place a driver with no
 *     `approximate_distance_m` at a NaN map coordinate, which MapKit rejects.
 *     Returning nothing is strictly less information, never more.
 *   • Bands are quantized (~250 m grid) and held for 30 s per caller and
 *     target session inside get_nearby_drivers_v3, so polling, refetching or
 *     restarting cannot sample more often.
 *   • Visibility is mutual (both stepped ranges), live-only and unexpired, and
 *     excludes banned, shadow-banned and blocked (either way) users.
 *   • The caller must be authenticated, not banned and live. Rate-limited.
 *
 * There is no path to get_nearby_drivers_v2 (deprecated, kept for rollback).
 */

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { ok, err } from '../_shared/errors.ts';
import { toPublicDriver, type PublicNearbyDriver } from '../_shared/proximity.ts';
import type { RateLimitBucket } from '../_shared/rateLimit.ts';

export interface NearbyDeps {
  getAuthUser: (req: Request) => Promise<User | null>;
  createAdminClient: () => SupabaseClient;
  isRateLimited: (admin: SupabaseClient, userId: string, bucket: RateLimitBucket) => Promise<boolean>;
}

/** True for the request shape of builds before Phase 2. */
async function isLegacyRequest(req: Request): Promise<boolean> {
  try {
    const body: unknown = await req.json();
    return (
      typeof body === 'object' && body !== null &&
      ('lat' in body || 'lng' in body || 'range_m' in body)
    );
  } catch {
    return false;
  }
}

export async function handleGetNearbyDrivers(req: Request, deps: NearbyDeps): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const user = await deps.getAuthUser(req);
    if (!user) return err(401, 'Unauthorized');

    const admin = deps.createAdminClient();

    if (await deps.isRateLimited(admin, user.id, 'nearby')) {
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
    // Only live users can see other live users. (The RPC re-checks this,
    // including expiry; this lookup only gives the client a clear error.)
    const { data: session } = await admin
      .from('live_sessions')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (!session) {
      return err(403, 'You must have an active session to see nearby drivers');
    }

    if (await isLegacyRequest(req)) {
      return ok({ drivers: [] });
    }

    // ── Proximity query ──────────────────────────────────────────────────────
    const { data: rows, error: queryError } = await admin.rpc('get_nearby_drivers_v3', {
      p_caller_id: user.id,
    });

    if (queryError) {
      console.error('get_nearby_drivers_v3 RPC error:', queryError);
      return err(500, 'Failed to fetch nearby drivers');
    }

    const drivers: PublicNearbyDriver[] = [];
    for (const row of Array.isArray(rows) ? rows : []) {
      const d = toPublicDriver(row);
      if (d !== null) drivers.push(d);
      else console.error('get_nearby_drivers_v3 returned a row outside the contract');
    }

    return ok({ drivers });
  } catch (e) {
    console.error('get-nearby-drivers unhandled error:', e);
    return err(500, 'Internal server error');
  }
}

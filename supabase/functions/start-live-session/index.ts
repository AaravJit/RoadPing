/**
 * start-live-session
 *
 * Creates a new live session for the authenticated user and inserts their
 * initial GPS position into location_presence (making them visible on radar).
 *
 * Safety rules enforced:
 *  • User must not be banned
 *  • vehicle_id must belong to the requesting user
 *  • Starting inside a private zone is blocked (returns 403)
 *  • Any existing active session is cleanly ended first
 *  • Rate-limited per user
 *  • range_m is floored to an allowed range (a distance-band edge)
 *  • GPS coordinates are NEVER returned to the client
 */

import { corsHeaders } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/client.ts';
import { getAuthUser } from '../_shared/auth.ts';
import { ok, err } from '../_shared/errors.ts';
import { isUUID, isLat, isLng, isRangeM, broadcastRangeFor } from '../_shared/validate.ts';
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

    const { vehicle_id, range_m, lat, lng, heading, speed_mps, accuracy_m } = body;

    // ── Validate required fields ─────────────────────────────────────────────
    if (!isLat(lat)) return err(400, 'lat must be a number between -90 and 90');
    if (!isLng(lng)) return err(400, 'lng must be a number between -180 and 180');
    if (!isRangeM(range_m)) return err(400, 'range_m must be between 100 and 5000');
    // Store only an allowed range (a distance-band edge), floored so nobody's
    // radius grows. Older builds offered ¼ mi / 500 m; those are refused with
    // a message rather than silently widened to ½ mi.
    const rangeStep = broadcastRangeFor(range_m);
    if (rangeStep === null) {
      return err(400, 'The smallest range is now ½ mile (800 m). Choose a larger range and try again.');
    }
    if (vehicle_id !== undefined && !isUUID(vehicle_id)) {
      return err(400, 'vehicle_id must be a valid UUID');
    }
    // Optional numeric fields — just validate type if present
    if (heading !== undefined && (typeof heading !== 'number' || !isFinite(heading as number))) {
      return err(400, 'heading must be a number');
    }

    const admin = createAdminClient();

    if (await isRateLimited(admin, user.id, 'startLive')) {
      return err(429, 'Too many requests');
    }

    // ── Profile + ban check ──────────────────────────────────────────────────
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('id, is_banned')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) return err(404, 'Profile not found');
    if ((profile as { is_banned: boolean }).is_banned) {
      return err(403, 'Account suspended');
    }

    // ── Vehicle ownership check ──────────────────────────────────────────────
    if (vehicle_id) {
      const { data: vehicle } = await admin
        .from('vehicles')
        .select('id')
        .eq('id', vehicle_id)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();

      if (!vehicle) {
        return err(400, 'Vehicle not found or not owned by you');
      }
    }

    // ── Private zone check ───────────────────────────────────────────────────
    const { data: inZone, error: zoneError } = await admin.rpc(
      'check_private_zone',
      { p_user_id: user.id, p_lat: lat, p_lng: lng },
    );
    if (zoneError) {
      console.error('check_private_zone error:', zoneError);
      return err(500, 'Internal server error');
    }
    if (inZone) {
      return err(403, 'Cannot start session inside a private zone');
    }

    // ── Clean up any existing active session ─────────────────────────────────
    const { data: existingSession } = await admin
      .from('live_sessions')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (existingSession) {
      const { error: endError } = await admin.rpc('end_live_session', {
        p_session_id: (existingSession as { id: string }).id,
        p_user_id: user.id,
        p_reason: 'user_stopped',
      });
      if (endError) {
        console.error('end_live_session error:', endError);
        return err(500, 'Internal server error');
      }
    }

    // ── Create new live session ──────────────────────────────────────────────
    const { data: session, error: sessionError } = await admin
      .from('live_sessions')
      .insert({
        user_id: user.id,
        vehicle_id: (vehicle_id as string | undefined) ?? null,
        range_m: rangeStep,
      })
      .select('id, expires_at')
      .single();

    if (sessionError || !session) {
      console.error('live_sessions insert error:', sessionError);
      return err(500, 'Failed to start session');
    }

    const { id: session_id, expires_at } = session as { id: string; expires_at: string };

    // ── Insert location presence ─────────────────────────────────────────────
    const { error: presenceError } = await admin.rpc('upsert_location_presence', {
      p_user_id: user.id,
      p_session_id: session_id,
      p_lat: lat,
      p_lng: lng,
    });

    if (presenceError) {
      // Roll back: mark session ended so it doesn't linger
      await admin
        .from('live_sessions')
        .update({
          status: 'ended',
          ended_at: new Date().toISOString(),
          ended_reason: 'user_stopped',
        })
        .eq('id', session_id);

      console.error('upsert_location_presence error:', presenceError);
      return err(500, 'Failed to start session');
    }

    // ── Success ──────────────────────────────────────────────────────────────
    // Note: lat/lng are deliberately NOT included in the response.
    return ok({ session_id, expires_at });
  } catch (e) {
    console.error('start-live-session unhandled error:', e);
    return err(500, 'Internal server error');
  }
});

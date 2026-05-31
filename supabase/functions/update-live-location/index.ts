/**
 * update-live-location
 *
 * Heartbeat: updates the authenticated user's GPS position and extends
 * the session + presence expiry window.
 *
 * If the new position falls inside one of the user's private zones,
 * the session is ended immediately (they vanish from radar) and the client
 * is notified via { status: 'session_ended', reason: 'private_zone' }.
 *
 * Called every ~10–15 seconds by the mobile app while driving.
 * GPS coordinates are NEVER returned to the client.
 */

import { corsHeaders } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/client.ts';
import { getAuthUser } from '../_shared/auth.ts';
import { ok, err } from '../_shared/errors.ts';
import { isLat, isLng } from '../_shared/validate.ts';

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

    const { lat, lng } = body;

    if (!isLat(lat)) return err(400, 'lat must be a number between -90 and 90');
    if (!isLng(lng)) return err(400, 'lng must be a number between -180 and 180');

    const admin = createAdminClient();

    // ── Find active session ──────────────────────────────────────────────────
    const { data: session } = await admin
      .from('live_sessions')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (!session) {
      return err(404, 'No active session');
    }

    const session_id = (session as { id: string }).id;

    // ── Private zone check ───────────────────────────────────────────────────
    const { data: inZone, error: zoneError } = await admin.rpc('check_private_zone', {
      p_user_id: user.id,
      p_lat: lat,
      p_lng: lng,
    });

    if (zoneError) {
      console.error('check_private_zone error:', zoneError);
      return err(500, 'Internal server error');
    }

    if (inZone) {
      // User drove into their private zone — stop the session silently
      const { error: endError } = await admin.rpc('end_live_session', {
        p_session_id: session_id,
        p_user_id: user.id,
        p_reason: 'entered_zone',
      });
      if (endError) {
        console.error('end_live_session (entered_zone) error:', endError);
      }
      // Tell the client the session ended so it can update its UI
      return ok({ status: 'session_ended', reason: 'private_zone' });
    }

    // ── Heartbeat: update location + extend expiry ───────────────────────────
    const { data: newExpiry, error: heartbeatError } = await admin.rpc(
      'update_location_heartbeat',
      {
        p_user_id: user.id,
        p_session_id: session_id,
        p_lat: lat,
        p_lng: lng,
      },
    );

    if (heartbeatError) {
      console.error('update_location_heartbeat error:', heartbeatError);
      return err(500, 'Failed to update location');
    }

    // Note: lat/lng are NOT included in the response.
    return ok({ status: 'ok', expires_at: newExpiry });
  } catch (e) {
    console.error('update-live-location unhandled error:', e);
    return err(500, 'Internal server error');
  }
});

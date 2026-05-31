/**
 * start-voice-session
 *
 * Marks the user as currently speaking. Creates a voice_session row with
 * is_speaking = true and a 60-second expiry (auto-closed by expire_stale_sessions
 * if the client crashes or loses connectivity).
 *
 * Rules:
 *   • User must have an active live session
 *   • If room_id is provided, user must be a member of that room
 *   • Any existing open voice session for this live session is closed first
 *   • NO audio is stored anywhere — this is a speaking indicator only
 *   • expires_at is 60 seconds; client must call stop-voice-session when done
 */

import { corsHeaders } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/client.ts';
import { getAuthUser } from '../_shared/auth.ts';
import { ok, err } from '../_shared/errors.ts';
import { isUUID } from '../_shared/validate.ts';

const VOICE_SESSION_SECONDS = 60;

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

    const { live_session_id, room_id } = body;

    if (!isUUID(live_session_id)) {
      return err(400, 'live_session_id must be a valid UUID');
    }
    if (room_id !== undefined && !isUUID(room_id)) {
      return err(400, 'room_id must be a valid UUID');
    }

    const admin = createAdminClient();

    // ── Verify live session ownership + active status ─────────────────────────
    const { data: session } = await admin
      .from('live_sessions')
      .select('id')
      .eq('id', live_session_id)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (!session) {
      return err(403, 'No active session or session does not belong to you');
    }

    // ── Room membership check (if room-scoped) ───────────────────────────────
    if (room_id) {
      const { data: membership } = await admin
        .from('room_members')
        .select('user_id')
        .eq('room_id', room_id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!membership) {
        return err(403, 'You are not a member of this room');
      }
    }

    // ── Close any existing open voice session for this live session ───────────
    await admin
      .from('voice_sessions')
      .update({ is_speaking: false, ended_at: new Date().toISOString() })
      .eq('live_session_id', live_session_id)
      .is('ended_at', null);

    // ── Create new voice session ─────────────────────────────────────────────
    const expiresAt = new Date(
      Date.now() + VOICE_SESSION_SECONDS * 1000,
    ).toISOString();

    const { data: voiceSession, error: insertError } = await admin
      .from('voice_sessions')
      .insert({
        user_id: user.id,
        live_session_id,
        room_id: (room_id as string | undefined) ?? null,
        is_speaking: true,
        expires_at: expiresAt,
      })
      .select('id, expires_at')
      .single();

    if (insertError || !voiceSession) {
      console.error('voice_sessions insert error:', insertError);
      return err(500, 'Failed to start voice session');
    }

    const { id: voice_session_id, expires_at } = voiceSession as {
      id: string;
      expires_at: string;
    };

    return ok({ voice_session_id, expires_at });
  } catch (e) {
    console.error('start-voice-session unhandled error:', e);
    return err(500, 'Internal server error');
  }
});

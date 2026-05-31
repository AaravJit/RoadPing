/**
 * stop-voice-session
 *
 * Ends all active voice sessions for the authenticated user.
 * Sets is_speaking = false and ended_at = now() on all open voice rows.
 *
 * Idempotent: safe to call even if no voice session is active.
 * No audio is stored — this only updates the speaking indicator.
 */

import { corsHeaders } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/client.ts';
import { getAuthUser } from '../_shared/auth.ts';
import { ok, err } from '../_shared/errors.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const user = await getAuthUser(req);
    if (!user) return err(401, 'Unauthorized');

    const admin = createAdminClient();

    // ── End all open voice sessions for this user ────────────────────────────
    // We end by user_id (not voice_session_id) because users can only have one
    // active speaking state at a time, and this is simpler for the client.
    const { error: updateError } = await admin
      .from('voice_sessions')
      .update({
        is_speaking: false,
        ended_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)
      .is('ended_at', null);

    if (updateError) {
      console.error('voice_sessions update error:', updateError);
      return err(500, 'Failed to stop voice session');
    }

    return ok({ success: true });
  } catch (e) {
    console.error('stop-voice-session unhandled error:', e);
    return err(500, 'Internal server error');
  }
});

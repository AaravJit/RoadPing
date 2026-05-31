/**
 * stop-live-session
 *
 * Ends the authenticated user's active live session.
 * Atomically:
 *   1. Closes any open voice sessions for this live session
 *   2. Deletes the user's location_presence row (they vanish from radar)
 *   3. Marks the live_session as 'ended' with reason 'user_stopped'
 *
 * Idempotent: returns 200 even if no active session exists.
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

    // ── Find active session ──────────────────────────────────────────────────
    const { data: session } = await admin
      .from('live_sessions')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (!session) {
      // Already stopped — idempotent success
      return ok({ success: true });
    }

    const session_id = (session as { id: string }).id;

    // ── Atomic shutdown ──────────────────────────────────────────────────────
    const { error: endError } = await admin.rpc('end_live_session', {
      p_session_id: session_id,
      p_user_id: user.id,
      p_reason: 'user_stopped',
    });

    if (endError) {
      console.error('end_live_session error:', endError);
      return err(500, 'Failed to stop session');
    }

    return ok({ success: true });
  } catch (e) {
    console.error('stop-live-session unhandled error:', e);
    return err(500, 'Internal server error');
  }
});

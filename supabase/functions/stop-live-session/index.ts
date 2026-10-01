/**
 * stop-live-session
 *
 * Ends the authenticated user's active live session.
 * Atomically (end_live_session, migration 013):
 *   1. Closes any open voice sessions and push-to-talk transmissions
 *   2. Deletes the user's location_presence row (they vanish from radar)
 *   3. Deletes the session's PushToTalk token and voice context
 *   4. Marks the live_session as 'ended'
 *
 * Optional body (Phase 3; older builds send none):
 *   session_id  only end this session. A cold launch uses it to stop the
 *               session a previous run left behind without touching a session
 *               the user has since started elsewhere.
 *   reason      'user_stopped' (default) | 'app_background' | 'logout'
 *
 * Idempotent: returns 200 even if no matching active session exists.
 */

import { corsHeaders } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/client.ts';
import { getAuthUser } from '../_shared/auth.ts';
import { ok, err } from '../_shared/errors.ts';
import { isUUID } from '../_shared/validate.ts';

const CLIENT_REASONS = new Set(['user_stopped', 'app_background', 'logout']);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const user = await getAuthUser(req);
    if (!user) return err(401, 'Unauthorized');

    // ── Optional body ────────────────────────────────────────────────────────
    let body: Record<string, unknown> = {};
    try {
      const text = await req.text();
      if (text.trim().length > 0) {
        const parsed: unknown = JSON.parse(text);
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          body = parsed as Record<string, unknown>;
        }
      }
    } catch {
      return err(400, 'Request body must be valid JSON');
    }
    const onlySession = body.session_id ?? null;
    if (onlySession !== null && !isUUID(onlySession)) return err(400, 'session_id must be a UUID');
    const reason = typeof body.reason === 'string' && CLIENT_REASONS.has(body.reason)
      ? body.reason
      : 'user_stopped';

    const admin = createAdminClient();

    // ── Find active session ──────────────────────────────────────────────────
    let query = admin
      .from('live_sessions')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'active');
    if (onlySession !== null) query = query.eq('id', onlySession);
    const { data: session } = await query.maybeSingle();

    if (!session) {
      // Already stopped — idempotent success
      return ok({ success: true });
    }

    const session_id = (session as { id: string }).id;

    // ── Atomic shutdown ──────────────────────────────────────────────────────
    const { error: endError } = await admin.rpc('end_live_session', {
      p_session_id: session_id,
      p_user_id: user.id,
      p_reason: reason,
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

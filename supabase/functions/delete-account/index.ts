/**
 * delete-account
 *
 * Permanently deletes the authenticated user's account and all owned data.
 *
 * Flow:
 *   1. Verify JWT → resolve caller's user_id.
 *   2. Best-effort end any active live session (so the user vanishes from
 *      nearby radars *before* any rows are removed).
 *   3. Delete user-owned rows that we want gone immediately:
 *        location_presence, push_tokens, blocks (as blocker), room memberships.
 *      Tables not listed cascade automatically via auth.users → profiles
 *      foreign keys (vehicles, private_zones, live_sessions, rooms owned,
 *      voice_sessions, reports filed against this user).
 *   4. NULL-out reporter_id on reports filed by this user — preserved for
 *      moderation/safety (migration 009).
 *   5. Call auth.admin.deleteUser(user_id) — service role only, never
 *      exposed to the mobile client. Profiles row cascades from auth.users.
 *
 * Response:
 *   200 { success: true }
 *   401 if no/invalid JWT
 *   500 with safe message on failure (no internal details leaked)
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
    const user = await getAuthUser(req);
    if (!user) return err(401, 'Unauthorized');

    const admin = createAdminClient();
    const userId = user.id;

    // ── 1. End any active live session (vanish from radars first) ──────────
    try {
      const { data: session } = await admin
        .from('live_sessions')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'active')
        .maybeSingle();

      if (session) {
        await admin.rpc('end_live_session', {
          p_session_id: (session as { id: string }).id,
          p_user_id: userId,
          p_reason: 'user_stopped',
        });
      }
    } catch (e) {
      // Non-fatal: continue with deletion even if session cleanup fails.
      console.warn('delete-account: session cleanup failed', e);
    }

    // ── 2. Hard-delete data that should disappear immediately ──────────────
    // (Most of these would cascade from profiles delete, but we delete them
    //  explicitly so a transient cascade failure can't leave residue behind.)
    await admin.from('location_presence').delete().eq('user_id', userId);
    await admin.from('push_tokens').delete().eq('user_id', userId);
    // PTT tokens and open transmissions also cascade with the profile; explicit
    // so a device stops being woken even if the auth delete below fails.
    await admin.rpc('unregister_ptt_token', { p_user_id: userId, p_installation_id: null });
    await admin.rpc('voice_end_transmission', { p_user_id: userId, p_transmission_id: null, p_reason: 'aborted' });
    await admin.from('blocks').delete().eq('blocker_id', userId);
    await admin.from('room_members').delete().eq('user_id', userId);

    // ── 3. Anonymize reports filed BY this user (kept for moderation) ──────
    // Reports filed AGAINST this user cascade away via reported_user_id FK.
    await admin
      .from('reports')
      .update({ reporter_id: null })
      .eq('reporter_id', userId);

    // ── 4. Delete the auth user → cascades to profiles + everything left ───
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) {
      console.error('delete-account: auth.admin.deleteUser failed', delErr);
      return err(500, 'Failed to delete account');
    }

    return ok({ success: true });
  } catch (e) {
    console.error('delete-account: unhandled error', e);
    return err(500, 'Internal server error');
  }
});

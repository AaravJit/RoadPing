/**
 * join-room
 *
 * Adds the authenticated user to a room by invite code.
 * Works for both public and private rooms (private rooms are invite-code only).
 *
 * Checks:
 *   • Room exists with this invite_code
 *   • Room has capacity (current members < max_members)
 *   • User is not already a member (idempotent: returns success if already in)
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

    // ── Parse body ──────────────────────────────────────────────────────────
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return err(400, 'Request body must be valid JSON');
    }

    const { invite_code } = body;

    if (typeof invite_code !== 'string' || invite_code.trim().length === 0) {
      return err(400, 'invite_code is required');
    }

    const admin = createAdminClient();

    // ── Look up room ─────────────────────────────────────────────────────────
    const { data: room } = await admin
      .from('rooms')
      .select('id, name, max_members')
      .eq('invite_code', invite_code.trim().toUpperCase())
      .maybeSingle();

    if (!room) {
      // Intentionally vague — don't reveal whether the code is invalid or expired
      return err(404, 'Invalid invite code');
    }

    const { id: room_id, name, max_members } = room as {
      id: string;
      name: string;
      max_members: number;
    };

    // ── Already a member? (idempotent) ───────────────────────────────────────
    const { data: existing } = await admin
      .from('room_members')
      .select('user_id')
      .eq('room_id', room_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing) {
      return ok({ room_id, name });
    }

    // ── Capacity check ───────────────────────────────────────────────────────
    const { count } = await admin
      .from('room_members')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', room_id);

    if (typeof count === 'number' && count >= max_members) {
      return err(409, 'Room is full');
    }

    // ── Add member ───────────────────────────────────────────────────────────
    const { error: joinError } = await admin
      .from('room_members')
      .insert({ room_id, user_id: user.id });

    if (joinError) {
      console.error('room_members insert error:', joinError);
      return err(500, 'Failed to join room');
    }

    return ok({ room_id, name });
  } catch (e) {
    console.error('join-room unhandled error:', e);
    return err(500, 'Internal server error');
  }
});

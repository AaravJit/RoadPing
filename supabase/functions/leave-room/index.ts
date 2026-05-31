/**
 * leave-room
 *
 * Removes the authenticated user from a room.
 *
 * Owner rule: owners cannot leave while other members are present.
 * They must delete the room instead (the RLS policy allows owner-delete).
 * If the owner is the only remaining member, they can leave (room stays but is empty).
 *
 * Non-owners: membership row is deleted immediately.
 */

import { corsHeaders } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/client.ts';
import { getAuthUser } from '../_shared/auth.ts';
import { ok, err } from '../_shared/errors.ts';
import { isUUID } from '../_shared/validate.ts';

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

    const { room_id } = body;

    if (!isUUID(room_id)) {
      return err(400, 'room_id must be a valid UUID');
    }

    const admin = createAdminClient();

    // ── Verify membership ────────────────────────────────────────────────────
    const { data: membership } = await admin
      .from('room_members')
      .select('user_id')
      .eq('room_id', room_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership) {
      return err(404, 'You are not a member of this room');
    }

    // ── Check if owner ───────────────────────────────────────────────────────
    const { data: room } = await admin
      .from('rooms')
      .select('owner_id')
      .eq('id', room_id)
      .maybeSingle();

    const roomData = room as { owner_id: string } | null;

    if (roomData && roomData.owner_id === user.id) {
      // Count current members
      const { count } = await admin
        .from('room_members')
        .select('*', { count: 'exact', head: true })
        .eq('room_id', room_id);

      if (typeof count === 'number' && count > 1) {
        // Owner leaving with others present is not allowed
        return err(
          400,
          'Owners cannot leave while other members are present. Delete the room instead.',
        );
      }
      // Owner is alone — allow them to leave (room becomes empty)
    }

    // ── Remove membership ────────────────────────────────────────────────────
    const { error: leaveError } = await admin
      .from('room_members')
      .delete()
      .eq('room_id', room_id)
      .eq('user_id', user.id);

    if (leaveError) {
      console.error('room_members delete error:', leaveError);
      return err(500, 'Failed to leave room');
    }

    return ok({ success: true });
  } catch (e) {
    console.error('leave-room unhandled error:', e);
    return err(500, 'Internal server error');
  }
});

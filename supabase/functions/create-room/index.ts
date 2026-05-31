/**
 * create-room
 *
 * Creates a new Drive Room owned by the authenticated user.
 * An invite code is always generated (even for public rooms — makes sharing easy).
 *
 * The handle_new_room() DB trigger automatically adds the owner as a moderator
 * in room_members, so this function does not need to do that explicitly.
 */

import { corsHeaders } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/client.ts';
import { getAuthUser } from '../_shared/auth.ts';
import { ok, err } from '../_shared/errors.ts';

/** Generates an 8-character alphanumeric invite code (no confusing chars). */
function generateInviteCode(): string {
  // Exclude I, O, 0, 1 to prevent confusion
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

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

    const { name, description, is_private, max_members } = body;

    // ── Validate ─────────────────────────────────────────────────────────────
    if (typeof name !== 'string' || name.trim().length === 0) {
      return err(400, 'name is required');
    }
    const trimmedName = name.trim();
    if (trimmedName.length > 80) {
      return err(400, 'name must be 80 characters or fewer');
    }
    if (description !== undefined && typeof description !== 'string') {
      return err(400, 'description must be a string');
    }
    if (description !== undefined && (description as string).length > 300) {
      return err(400, 'description must be 300 characters or fewer');
    }
    if (typeof is_private !== 'boolean') {
      return err(400, 'is_private must be a boolean');
    }
    if (
      max_members !== undefined &&
      (typeof max_members !== 'number' ||
        (max_members as number) < 2 ||
        (max_members as number) > 200)
    ) {
      return err(400, 'max_members must be between 2 and 200');
    }

    const admin = createAdminClient();

    // ── Insert room ──────────────────────────────────────────────────────────
    const { data: room, error: roomError } = await admin
      .from('rooms')
      .insert({
        owner_id: user.id,
        name: trimmedName,
        description:
          typeof description === 'string' ? (description as string).trim() || null : null,
        is_private,
        invite_code: generateInviteCode(),
        max_members: typeof max_members === 'number' ? max_members : 50,
      })
      .select('id, invite_code')
      .single();

    if (roomError || !room) {
      console.error('rooms insert error:', roomError);
      return err(500, 'Failed to create room');
    }

    const { id: room_id, invite_code } = room as {
      id: string;
      invite_code: string;
    };

    // The handle_new_room() trigger already added the owner as moderator.
    return ok({ room_id, invite_code });
  } catch (e) {
    console.error('create-room unhandled error:', e);
    return err(500, 'Internal server error');
  }
});

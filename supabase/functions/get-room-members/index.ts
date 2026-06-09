/**
 * get-room-members
 *
 * Returns the member list for a room, including each member's current
 * speaking state and primary vehicle info (vehicle-first identity display).
 * The requesting user must be a member of the room.
 *
 * Returns safe profile info only: no raw GPS, no ban status, no email.
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

    // ── Membership gate ──────────────────────────────────────────────────────
    const { data: selfMembership } = await admin
      .from('room_members')
      .select('user_id')
      .eq('room_id', room_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!selfMembership) {
      return err(403, 'You are not a member of this room');
    }

    // ── Fetch members with profile info ──────────────────────────────────────
    const { data: members, error: membersError } = await admin
      .from('room_members')
      .select(`
        user_id,
        joined_at,
        is_moderator,
        profiles (
          display_name,
          handle,
          avatar_url
        )
      `)
      .eq('room_id', room_id)
      .order('joined_at', { ascending: true });

    if (membersError) {
      console.error('room_members select error:', membersError);
      return err(500, 'Failed to fetch members');
    }

    // ── Hide blocked users (either direction) from the member list ───────────
    // Mutual block: the requester should not see members they blocked, nor
    // members who blocked them.
    const { data: blockRows } = await admin
      .from('blocks')
      .select('blocker_id, blocked_id')
      .or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`);

    const hiddenUserIds = new Set<string>();
    for (const b of blockRows ?? []) {
      const row = b as { blocker_id: string; blocked_id: string };
      hiddenUserIds.add(row.blocker_id === user.id ? row.blocked_id : row.blocker_id);
    }
    hiddenUserIds.delete(user.id); // always keep self visible to self

    const memberList = (members ?? []).filter(
      (m: Record<string, unknown>) => !hiddenUserIds.has(m.user_id as string),
    );
    const userIds = memberList.map((m: Record<string, unknown>) => m.user_id as string);

    // ── Fetch speaking state for this room ───────────────────────────────────
    const { data: activeSpeakers } = await admin
      .from('voice_sessions')
      .select('user_id')
      .eq('room_id', room_id)
      .eq('is_speaking', true)
      .is('ended_at', null);

    const speakingSet = new Set(
      (activeSpeakers ?? []).map((s: Record<string, unknown>) => s.user_id as string),
    );

    // ── Fetch primary vehicles for all members ───────────────────────────────
    const vehiclesQuery = userIds.length > 0
      ? await admin
          .from('vehicles')
          .select('user_id, vehicle_type, label, make, model, color')
          .in('user_id', userIds)
          .eq('is_active', true)
      : { data: [] as Record<string, unknown>[] };

    const vehicleMap = new Map(
      (vehiclesQuery.data ?? []).map((v: Record<string, unknown>) => [
        v.user_id as string,
        v,
      ]),
    );

    // ── Shape the response — only safe fields ────────────────────────────────
    const safeMembers = memberList.map((m: Record<string, unknown>) => {
      const profile = m.profiles as
        | { display_name: string; handle: string | null; avatar_url: string | null }
        | null;
      const vehicle = vehicleMap.get(m.user_id as string);
      return {
        user_id: m.user_id,
        display_name: profile?.display_name ?? null,
        handle: profile?.handle ?? null,
        avatar_url: profile?.avatar_url ?? null,
        is_moderator: m.is_moderator,
        joined_at: m.joined_at,
        is_speaking: speakingSet.has(m.user_id as string),
        vehicle_type: vehicle?.vehicle_type ?? null,
        vehicle_label: vehicle?.label ?? null,
        vehicle_color: vehicle?.color ?? null,
        vehicle_make: vehicle?.make ?? null,
        vehicle_model: vehicle?.model ?? null,
      };
    });

    return ok({ members: safeMembers });
  } catch (e) {
    console.error('get-room-members unhandled error:', e);
    return err(500, 'Internal server error');
  }
});

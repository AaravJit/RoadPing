// ============================================================================
// RoadPing — Room service
//
// Rooms (drive rooms / convoys) use direct Supabase queries.
// RLS: members can read rooms they're in; only the owner can write.
//
// NOTE: There is NO message / chat / history storage in rooms.
//       Rooms are presence channels for voice — they hold member lists only.
//       Do NOT add any messaging, clip, or history functionality here.
// ============================================================================

import { supabase } from './supabase';
import { ServiceError } from './types';
import type { Room, RoomCreate, RoomUpdate, RoomMember } from './types';
import type { RealtimeChannel } from '@supabase/supabase-js';

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * List all rooms the signed-in user is a member of.
 */
export async function listMyRooms(): Promise<Room[]> {
  // room_members → rooms join via RLS: is_room_member(id, auth.uid())
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) throw new ServiceError('DB_ERROR', error.message);
  return (data ?? []) as Room[];
}

/**
 * Fetch a single room by ID.
 * Throws `NOT_FOUND` if it doesn't exist or the caller is not a member.
 */
export async function getRoom(id: string): Promise<Room> {
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) throw new ServiceError('NOT_FOUND', 'Room not found.');
  return data as Room;
}

/**
 * Create a new room.
 * The DB trigger automatically adds the creator as the owner in room_members.
 */
export async function createRoom(input: RoomCreate): Promise<Room> {
  if (!input.name?.trim()) throw new ServiceError('INVALID_INPUT', 'Room name is required.');

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new ServiceError('NOT_AUTHENTICATED', 'Not signed in.', 401);

  const { data, error } = await supabase
    .from('rooms')
    .insert({
      owner_id:    user.id,
      name:        input.name.trim(),
      description: input.description ?? null,
      is_private:  input.is_private ?? true,
    })
    .select()
    .single();

  if (error) throw new ServiceError('DB_ERROR', error.message);
  return data as Room;
}

/**
 * Update room metadata (name, description, is_private).
 * Only the room owner can update.
 */
export async function updateRoom(id: string, updates: RoomUpdate): Promise<Room> {
  if (Object.keys(updates).length === 0) {
    throw new ServiceError('INVALID_INPUT', 'No fields to update.');
  }

  const patch: Record<string, unknown> = {};
  if (updates.name        !== undefined) patch.name        = updates.name?.trim();
  if (updates.description !== undefined) patch.description = updates.description;
  if (updates.is_private  !== undefined) patch.is_private  = updates.is_private;

  const { data, error } = await supabase
    .from('rooms')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new ServiceError('DB_ERROR', error.message);
  if (!data) throw new ServiceError('NOT_FOUND', 'Room not found or not the owner.');
  return data as Room;
}

/**
 * Delete a room. Only the owner can do this.
 * Cascade deletes all room_members rows.
 */
export async function deleteRoom(id: string): Promise<void> {
  const { error } = await supabase
    .from('rooms')
    .delete()
    .eq('id', id);

  if (error) throw new ServiceError('DB_ERROR', error.message);
}

// ── Membership ────────────────────────────────────────────────────────────────

/**
 * Look up a room by its invite code.
 * Throws `NOT_FOUND` if no room with that code exists.
 */
export async function findByInviteCode(code: string): Promise<Room> {
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('invite_code', code.trim().toLowerCase())
    .single();

  if (error || !data) throw new ServiceError('NOT_FOUND', 'No room found for that invite code.');
  return data as Room;
}

/**
 * Join a room via its invite code.
 * Returns the room. Idempotent — if already a member, re-activates the membership.
 */
export async function joinByInviteCode(code: string): Promise<Room> {
  const room = await findByInviteCode(code);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new ServiceError('NOT_AUTHENTICATED', 'Not signed in.', 401);

  const { error } = await supabase
    .from('room_members')
    .upsert(
      { room_id: room.id, user_id: user.id, role: 'member', is_active: true },
      { onConflict: 'room_id,user_id' },
    );

  if (error) throw new ServiceError('DB_ERROR', error.message);
  return room;
}

/**
 * Leave a room (sets is_active = false rather than deleting the row,
 * so the owner can see who was ever a member).
 */
export async function leaveRoom(roomId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new ServiceError('NOT_AUTHENTICATED', 'Not signed in.', 401);

  const { error } = await supabase
    .from('room_members')
    .update({ is_active: false })
    .eq('room_id', roomId)
    .eq('user_id', user.id);

  if (error) throw new ServiceError('DB_ERROR', error.message);
}

/**
 * List active members of a room.
 * Joins with profiles to return handle / display_name / avatar_url.
 */
export async function listMembers(roomId: string): Promise<RoomMember[]> {
  const { data, error } = await supabase
    .from('room_members')
    .select(`
      room_id,
      user_id,
      role,
      is_active,
      joined_at,
      profile:profiles ( handle, display_name, avatar_url )
    `)
    .eq('room_id', roomId)
    .eq('is_active', true)
    .order('joined_at', { ascending: true });

  if (error) throw new ServiceError('DB_ERROR', error.message);
  return (data ?? []) as unknown as RoomMember[];
}

// ── Realtime ──────────────────────────────────────────────────────────────────

export type RoomMemberEvent =
  | { type: 'joined';  member: RoomMember }
  | { type: 'left';    user_id: string }
  | { type: 'updated'; member: RoomMember };

/**
 * Subscribe to live member changes in a room.
 * Returns an unsubscribe function.
 *
 * Room membership is read-accessible to all members (RLS: is_room_member).
 * Safe to subscribe once the user has joined.
 *
 * @example
 *   const unsub = subscribeToRoom(roomId, (event) => {
 *     if (event.type === 'joined')  addMember(event.member);
 *     if (event.type === 'left')    removeMember(event.user_id);
 *     if (event.type === 'updated') updateMember(event.member);
 *   });
 *   return unsub;
 */
export function subscribeToRoom(
  roomId: string,
  onEvent: (event: RoomMemberEvent) => void,
): () => void {
  const channel: RealtimeChannel = supabase
    .channel(`room:${roomId}`)
    .on(
      'postgres_changes',
      {
        event:  '*',
        schema: 'public',
        table:  'room_members',
        filter: `room_id=eq.${roomId}`,
      },
      (payload) => {
        const { eventType, new: newRow, old: oldRow } = payload;

        if (eventType === 'INSERT') {
          onEvent({ type: 'joined', member: newRow as RoomMember });
        } else if (eventType === 'DELETE') {
          onEvent({ type: 'left', user_id: (oldRow as { user_id: string }).user_id });
        } else if (eventType === 'UPDATE') {
          const updated = newRow as RoomMember;
          if (!updated.is_active) {
            onEvent({ type: 'left', user_id: updated.user_id });
          } else {
            onEvent({ type: 'updated', member: updated });
          }
        }
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

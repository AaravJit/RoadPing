/**
 * Rooms service — create, join, leave, delete rooms, list members.
 *
 * create/join/leave go through Edge Functions (server-side validation,
 * capacity checks, membership enforcement).
 * listMyRooms and deleteRoom use the supabase anon client (RLS-gated).
 */
import { supabase } from './supabase';
import { edgeFnUrl } from './api';
import type {
  CreateRoomRequest,
  CreateRoomResponse,
  JoinRoomRequest,
  JoinRoomResponse,
  LeaveRoomRequest,
  LeaveRoomResponse,
  GetRoomMembersRequest,
  GetRoomMembersResponse,
  RoomMember,
} from './api';
import type { RoomRow } from './types';

// ─── Auth helper (same pattern as moderation/liveSession) ────────────────────

async function accessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  if (data.session === null) throw new Error('Not authenticated.');
  return data.session.access_token;
}

async function post<Req, Res>(name: string, body: Req): Promise<Res> {
  const token = await accessToken();
  const res = await fetch(edgeFnUrl(name), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { error?: string } & Res;
  if (!res.ok) {
    throw new Error(json.error ?? `Server error (${res.status})`);
  }
  return json;
}

// ─── Room CRUD ────────────────────────────────────────────────────────────────

export async function createRoom(
  req: CreateRoomRequest,
): Promise<CreateRoomResponse> {
  return post<CreateRoomRequest, CreateRoomResponse>('create-room', req);
}

export async function joinRoom(inviteCode: string): Promise<JoinRoomResponse> {
  return post<JoinRoomRequest, JoinRoomResponse>('join-room', {
    invite_code: inviteCode.trim().toUpperCase(),
  });
}

export async function leaveRoom(roomId: string): Promise<void> {
  await post<LeaveRoomRequest, LeaveRoomResponse>('leave-room', {
    room_id: roomId,
  });
}

/** Owner-only. Cascades: room_members + voice_sessions are deleted by DB. */
export async function deleteRoom(roomId: string): Promise<void> {
  const { error } = await supabase.from('rooms').delete().eq('id', roomId);
  if (error) throw error;
}

// ─── Members ──────────────────────────────────────────────────────────────────

export async function getRoomMembers(roomId: string): Promise<RoomMember[]> {
  const resp = await post<GetRoomMembersRequest, GetRoomMembersResponse>(
    'get-room-members',
    { room_id: roomId },
  );
  return resp.members;
}

// ─── Room list ────────────────────────────────────────────────────────────────

/** Returns rooms the authenticated user is a member of, newest first. */
export async function listMyRooms(): Promise<RoomRow[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session === null) return [];

  const { data: memberships, error: mErr } = await supabase
    .from('room_members')
    .select('room_id')
    .eq('user_id', session.user.id);

  if (mErr || !memberships || memberships.length === 0) return [];

  const roomIds = memberships.map((m) => m.room_id);

  const { data: rooms, error: rErr } = await supabase
    .from('rooms')
    .select('*')
    .in('id', roomIds)
    .order('updated_at', { ascending: false });

  if (rErr) throw rErr;
  return (rooms ?? []) as RoomRow[];
}

/** Query the user's current active live session ID, needed for room PTT. */
export async function getActiveLiveSessionId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session === null) return null;

  const { data } = await supabase
    .from('live_sessions')
    .select('id')
    .eq('user_id', session.user.id)
    .eq('status', 'active')
    .maybeSingle();

  return (data as { id: string } | null)?.id ?? null;
}

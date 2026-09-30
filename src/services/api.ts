/**
 * Edge Function API contract types for RoadPing (Phase 4 client service layer).
 *
 * These types define the exact request/response shapes for each Edge Function.
 * The Phase 4 service layer (src/services/session.ts, src/services/radar.ts, etc.)
 * will use these types to call the Supabase Edge Functions via fetch.
 *
 * Base URL pattern:
 *   ${EXPO_PUBLIC_SUPABASE_URL}/functions/v1/<function-name>
 *
 * All requests:
 *   - Method: POST
 *   - Header: Authorization: Bearer <supabase_access_token>
 *   - Header: Content-Type: application/json
 *   - Body: JSON (see Request types below)
 *
 * All error responses:
 *   { error: string }  with a 4xx or 5xx HTTP status
 */

import type { NearbyDriverCard, ReportReason, ReportContext, VehicleType } from './types';
import { ENV } from './env';

// ─── Common ───────────────────────────────────────────────────────────────────

/** Shape of every error response from an Edge Function. */
export interface ApiError {
  error: string;
}

// ─── start-live-session ───────────────────────────────────────────────────────

export interface StartSessionRequest {
  /** Active vehicle UUID (optional — user may not have a vehicle set up). */
  vehicle_id?: string;
  /** Broadcast range in metres. Must be 100–5000. Stored in the session. */
  range_m: number;
  /** Current latitude from expo-location. */
  lat: number;
  /** Current longitude from expo-location. */
  lng: number;
  /** Compass heading in degrees (0–360). Optional. */
  heading?: number;
  /** Speed in metres per second. Optional. */
  speed_mps?: number;
  /** GPS accuracy in metres. Optional. */
  accuracy_m?: number;
}

export interface StartSessionResponse {
  session_id: string;
  /** ISO 8601 timestamp — client should schedule next heartbeat before this. */
  expires_at: string;
}

// ─── stop-live-session ────────────────────────────────────────────────────────

// No request body needed — user identity comes from the JWT.
export interface StopSessionResponse {
  success: true;
}

// ─── update-live-location ────────────────────────────────────────────────────

export interface UpdateLocationRequest {
  lat: number;
  lng: number;
  heading?: number;
  speed_mps?: number;
  accuracy_m?: number;
}

export type UpdateLocationResponse =
  /** Normal heartbeat — session still active. */
  | { status: 'ok'; expires_at: string }
  /** User drove into a private zone — session was ended server-side. */
  | { status: 'session_ended'; reason: 'private_zone' };

// ─── get-nearby-drivers ───────────────────────────────────────────────────────

// No request fields. Position and range come from the caller's stored live
// session; `lat`, `lng` and `range_m` sent by older builds are ignored.

export interface GetNearbyDriversResponse {
  /** Validated by src/services/proximity.ts; each has a distance_band only. */
  drivers: NearbyDriverCard[];
}

// ─── block-user ───────────────────────────────────────────────────────────────

export interface BlockUserRequest {
  blocked_user_id: string;
}

export interface BlockUserResponse {
  success: true;
}

// ─── report-user ─────────────────────────────────────────────────────────────

export interface ReportUserRequest {
  reported_user_id: string;
  reason: ReportReason;
  context: ReportContext;
  /** Optional freeform details (max 500 chars). */
  details?: string;
}

/** Always returns this shape — even if the report failed internally. */
export interface ReportUserResponse {
  success: true;
}

// ─── create-room ─────────────────────────────────────────────────────────────

export interface CreateRoomRequest {
  name: string;
  description?: string;
  /** true = invite-code only; false = anyone can search and join. */
  is_private: boolean;
  /** Defaults to 50. Must be 2–200. */
  max_members?: number;
}

export interface CreateRoomResponse {
  room_id: string;
  /** Always generated (share this for easy joining). */
  invite_code: string;
}

// ─── join-room ────────────────────────────────────────────────────────────────

export interface JoinRoomRequest {
  invite_code: string;
}

export interface JoinRoomResponse {
  room_id: string;
  name: string;
}

// ─── leave-room ───────────────────────────────────────────────────────────────

export interface LeaveRoomRequest {
  room_id: string;
}

export interface LeaveRoomResponse {
  success: true;
}

// ─── get-room-members ────────────────────────────────────────────────────────

export interface GetRoomMembersRequest {
  room_id: string;
}

export interface RoomMember {
  user_id: string;
  display_name: string | null;
  handle: string | null;
  avatar_url: string | null;
  is_moderator: boolean;
  joined_at: string;
  is_speaking: boolean;
  vehicle_type: VehicleType | null;
  vehicle_label: string | null;
  vehicle_color: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
}

export interface GetRoomMembersResponse {
  members: RoomMember[];
}

// ─── start-voice-session ────────────────────────────────────────────────────

export interface StartVoiceSessionRequest {
  /** Must be the caller's current active live_session.id. */
  live_session_id: string;
  /**
   * If provided, speaking state is scoped to this room.
   * If omitted (null), it's an open-channel broadcast visible to all nearby.
   */
  room_id?: string;
}

export interface StartVoiceSessionResponse {
  voice_session_id: string;
  /** Client must call stop-voice-session before this time. */
  expires_at: string;
}

// ─── stop-voice-session ─────────────────────────────────────────────────────

// No request body needed.
export interface StopVoiceSessionResponse {
  success: true;
}

// ─── create-agora-token ──────────────────────────────────────────────────────

export interface CreateAgoraTokenRequest {
  /** "room" → shared room channel; "nearby" → caller's live-session channel. */
  target: 'nearby' | 'room';
  /** Required when target === "nearby": the caller's active live_session.id. */
  session_id?: string;
  /** Required when target === "room": the room to join. */
  room_id?: string;
}

export interface CreateAgoraTokenResponse {
  /** Agora App ID — public, safe on the client. */
  appId: string;
  /** Channel to join. Both peers must use the same name to hear each other. */
  channelName: string;
  /** Short-lived RTC token authorizing this uid on this channel. */
  token: string;
  /** Deterministic 32-bit uid for this user (stable across joins). */
  uid: number;
  /** ISO 8601 — token/privilege expiry. Re-request before this time. */
  expiresAt: string;
}

// ─── expire-stale-sessions (admin/cron only) ─────────────────────────────────

// No request body. Protected by CRON_SECRET, not JWT.
export interface ExpireStaleSessionsResponse {
  success: true;
  ran_at: string;
}

// ─── Edge Function URL builder (Phase 4 utility) ────────────────────────────

/**
 * Builds the full Edge Function URL for a given function name.
 *
 * Usage in Phase 4 service layer:
 *   const res = await fetch(edgeFnUrl('start-live-session'), {
 *     method: 'POST',
 *     headers: {
 *       Authorization: `Bearer ${session.access_token}`,
 *       'Content-Type': 'application/json',
 *     },
 *     body: JSON.stringify(request),
 *   });
 */
export function edgeFnUrl(name: string): string {
  return `${ENV.SUPABASE_URL}/functions/v1/${name}`;
}

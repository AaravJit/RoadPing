// ============================================================================
// RoadPing — shared TypeScript types
// Derived 1-to-1 from the Supabase schema (migrations/0001_roadping_init.sql).
// ============================================================================

// ── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: AuthUser;
}

export interface AuthUser {
  id: string;
  email?: string;
  phone?: string;
  created_at: string;
}

// ── Profile ──────────────────────────────────────────────────────────────────

export interface Profile {
  id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  /** Visibility radius in metres (100–5000). */
  default_range_m: number;
  /** Do-not-disturb: mutes incoming live voice. */
  dnd: boolean;
  /** Hard admin ban: cannot go live. */
  is_banned: boolean;
  /** Shadow-suppressed: silently hidden from nearby drivers. */
  is_shadow_suppressed: boolean;
  created_at: string;
  updated_at: string;
}

export type ProfileUpdate = Partial<
  Pick<Profile, 'display_name' | 'avatar_url' | 'default_range_m' | 'dnd'>
>;

// ── Vehicle ──────────────────────────────────────────────────────────────────

export type VehicleBodyType =
  | 'sedan' | 'coupe' | 'hatchback' | 'wagon' | 'suv' | 'pickup'
  | 'van' | 'crossover' | 'sportsCar' | 'supercar' | 'motorcycle';

export interface Vehicle {
  id: string;
  owner_id: string;
  make: string;
  model: string;
  year: number | null;
  color: string | null;
  nickname: string | null;
  body_type: VehicleBodyType;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

export interface VehicleCreate {
  make: string;
  model: string;
  year?: number | null;
  color?: string | null;
  nickname?: string | null;
  body_type?: VehicleBodyType;
  is_primary?: boolean;
}

export type VehicleUpdate = Partial<VehicleCreate>;

// ── Private Zone ─────────────────────────────────────────────────────────────

export type ZoneKind = 'home' | 'work' | 'custom';

export interface PrivateZone {
  id: string;
  user_id: string;
  name: string;
  /** Deserialized from PostGIS geography(Point). */
  lat: number;
  lng: number;
  radius_m: number;
  kind: ZoneKind;
  created_at: string;
  updated_at: string;
}

export interface ZoneCreate {
  name: string;
  lat: number;
  lng: number;
  radius_m?: number;
  kind?: ZoneKind;
}

export interface ZoneBlockResult {
  blocked: boolean;
  /** 'safe' when clear; 'too_close' when inside a zone. */
  status: 'safe' | 'too_close';
  zone: {
    id: string;
    name: string;
    distance_m: number;
  } | null;
}

// ── Live Session ─────────────────────────────────────────────────────────────

export type SessionEndReason = 'user' | 'expired' | 'entered_zone' | 'banned';

export interface LiveSession {
  id: string;
  user_id: string;
  vehicle_id: string | null;
  range_m: number;
  started_at: string;
  last_heartbeat_at: string;
  expires_at: string;
  ended_at: string | null;
  ended_reason: SessionEndReason | null;
}

export interface StartSessionParams {
  lat: number;
  lng: number;
  range_m?: number;
  vehicle_id?: string | null;
  heading?: number | null;
  speed?: number | null;
  accuracy?: number | null;
}

export interface StartSessionResult {
  live: true;
  session: LiveSession;
}

// ── Location / Heartbeat ─────────────────────────────────────────────────────

export interface HeartbeatParams {
  lat: number;
  lng: number;
  heading?: number | null;
  speed?: number | null;
  accuracy?: number | null;
}

export type HeartbeatResult =
  | { live: true; session_id: string; expires_at: string }
  | { live: false; reason: SessionEndReason };

// ── Nearby Drivers ───────────────────────────────────────────────────────────

export interface NearbyVehicle {
  make?: string;
  model?: string;
  year?: number;
  color?: string;
  nickname?: string;
  body_type?: VehicleBodyType;
}

export interface NearbyDriver {
  user_id: string;
  handle: string;
  display_name: string | null;
  /** Metres from the query point. */
  distance_m: number;
  /** Coarsened to ~11 m (4 decimal places). */
  lat: number;
  lng: number;
  heading: number | null;
  speed_mps: number | null;
  vehicle: NearbyVehicle | null;
  /**
   * Always false from the API — talking state is Realtime-only and
   * is never stored. Mutated locally by the voice layer.
   */
  is_talking: boolean;
}

// ── Blocks ───────────────────────────────────────────────────────────────────

export interface Block {
  blocker_id: string;
  blocked_id: string;
  created_at: string;
}

// ── Reports ──────────────────────────────────────────────────────────────────

export type ReportContext = 'map' | 'room' | 'voice' | 'profile';
export type ReportStatus = 'open' | 'reviewing' | 'actioned' | 'dismissed';

export interface Report {
  id: string;
  reporter_id: string;
  reported_id: string;
  reason: string;
  context: ReportContext | null;
  session_id: string | null;
  status: ReportStatus;
  created_at: string;
}

export interface ReportCreate {
  reported_id: string;
  reason: string;
  context?: ReportContext | null;
  session_id?: string | null;
}

// ── Rooms ─────────────────────────────────────────────────────────────────────

export interface Room {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  is_private: boolean;
  invite_code: string;
  created_at: string;
  updated_at: string;
}

export interface RoomCreate {
  name: string;
  description?: string | null;
  is_private?: boolean;
}

export type RoomUpdate = Partial<RoomCreate>;

export type RoomRole = 'owner' | 'member';

export interface RoomMember {
  room_id: string;
  user_id: string;
  role: RoomRole;
  is_active: boolean;
  joined_at: string;
  /** Joined via a select on profiles. */
  profile?: Pick<Profile, 'handle' | 'display_name' | 'avatar_url'>;
}

// ── Service errors ────────────────────────────────────────────────────────────

/** Known error codes returned by Edge Functions and the DB. */
export type ErrorCode =
  | 'NOT_AUTHENTICATED'
  | 'USER_BANNED'
  | 'TOO_CLOSE_TO_ZONE'
  | 'NO_ACTIVE_SESSION'
  | 'INVALID_INPUT'
  | 'DB_ERROR'
  | 'NETWORK_ERROR'
  | 'NOT_FOUND'
  | 'UNKNOWN';

export class ServiceError extends Error {
  readonly code: ErrorCode | string;
  readonly httpStatus: number;

  constructor(code: string, message: string, httpStatus = 400) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
    this.httpStatus = httpStatus;
  }

  get isTooCloseToZone() { return this.code === 'TOO_CLOSE_TO_ZONE'; }
  get isBanned()         { return this.code === 'USER_BANNED'; }
  get isUnauthenticated(){ return this.code === 'NOT_AUTHENTICATED' || this.httpStatus === 401; }
  get isNoSession()      { return this.code === 'NO_ACTIVE_SESSION'; }
}

/**
 * Database type definitions for RoadPing.
 *
 * These hand-authored types mirror the SQL schema in supabase/migrations/.
 * Run `supabase gen types typescript --linked > src/services/types.generated.ts`
 * after linking your project to auto-generate and then reconcile with these.
 *
 * PRIVACY RULES:
 *  • lat/lng coordinates never appear in client-facing types.
 *  • location_presence has no client-readable row type (no SELECT RLS policy).
 *  • Nearby driver data comes only via get_nearby_drivers() RPC return type.
 */

// ─── Enums (mirror SQL enum types exactly) ───────────────────────────────────

export type SessionStatus = 'active' | 'ended' | 'expired';

export type SessionEndedReason =
  | 'user_stopped'
  | 'expired'
  | 'entered_zone'
  | 'banned'
  | 'app_background'
  | 'logout';

export type VehicleType = 'car' | 'motorcycle' | 'truck' | 'van' | 'bicycle' | 'other';

/**
 * Fine-grained body style. SQL enum uses snake_case; TypeScript uses camelCase.
 * Bridge: 'sports_car' (SQL) ↔ 'sportsCar' (TS) — convert on read/write.
 */
export type BodyType =
  | 'sedan'
  | 'coupe'
  | 'hatchback'
  | 'wagon'
  | 'suv'
  | 'pickup'
  | 'van'
  | 'crossover'
  | 'sports_car'   // SQL: sports_car
  | 'supercar'
  | 'motorcycle';

export type ReportReason =
  | 'harassment'
  | 'threats'
  | 'hate_or_discrimination'
  | 'inappropriate_content'
  | 'spam'
  | 'impersonation'
  | 'dangerous_driving'
  | 'other';

export type ReportContext = 'map' | 'room' | 'voice' | 'profile';

export type ReportStatus = 'open' | 'reviewing' | 'actioned' | 'dismissed';

export type PlatformType = 'ios' | 'android';

export type ModerationActionType = 'warn' | 'shadow_ban' | 'ban' | 'dismiss';

// ─── Table Row Types ──────────────────────────────────────────────────────────

export type ProfileRow = {
  id: string;
  /** Unique @username. Alphanumeric + underscores, 3-25 chars. NULL until set. */
  handle: string | null;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  /** Do Not Disturb — suppresses is_speaking in nearby radar. */
  dnd_mode: boolean;
  /** User's preferred default broadcast radius in metres (100–5000). */
  default_range_m: number;
  is_banned: boolean;
  is_shadow_banned: boolean;
  /** When the user last accepted the Terms/EULA. NULL until first accepted. */
  accepted_terms_at: string | null;
  /** Version string of the Terms the user accepted. NULL until first accepted. */
  accepted_terms_version: string | null;
  created_at: string;
  updated_at: string;
}

export type VehicleRow = {
  id: string;
  user_id: string;
  label: string;
  vehicle_type: VehicleType;
  body_type: BodyType | null;
  make: string | null;
  model: string | null;
  color: string | null;
  year: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type LiveSessionRow = {
  id: string;
  user_id: string;
  vehicle_id: string | null;
  /** User's chosen broadcast radius in metres (100–5000). */
  range_m: number;
  status: SessionStatus;
  started_at: string;
  ended_at: string | null;
  last_heartbeat_at: string;
  expires_at: string;
  ended_reason: SessionEndedReason | null;
}

/**
 * PrivateZoneRow — center (geography) and radius_m are intentionally omitted.
 * They exist in Postgres but must never be exposed to client code.
 */
export type ZoneKind = 'home' | 'work' | 'custom';

export type PrivateZoneRow = {
  id: string;
  owner_id: string;
  name: string;
  kind: ZoneKind;
  /** Radius in metres (1–5000). Shown to owner for editing; never shared. */
  radius_m: number;
  // ⛔ center (geography) intentionally omitted — raw GPS coords never returned
  created_at: string;
  updated_at: string;
}

/**
 * LocationPresenceRow — no client-accessible type is intentional.
 * The location column contains raw GPS coordinates.
 * It is not returned by any client-facing SELECT.
 */
// export type LocationPresenceRow = { ... }  ← intentionally absent

export type BlockRow = {
  blocker_id: string;
  blocked_id: string;
  created_at: string;
}

export type ReportRow = {
  id: string;
  reporter_id: string;
  reported_user_id: string;
  reason: ReportReason;
  context: ReportContext;
  details: string | null;
  status: ReportStatus;
  created_at: string;
  updated_at: string;
}

export type RoomRow = {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  is_private: boolean;
  invite_code: string | null;
  max_members: number;
  created_at: string;
  updated_at: string;
}

export type RoomMemberRow = {
  room_id: string;
  user_id: string;
  joined_at: string;
  is_moderator: boolean;
}

export type VoiceSessionRow = {
  id: string;
  user_id: string;
  live_session_id: string;
  room_id: string | null;
  is_speaking: boolean;
  started_at: string;
  ended_at: string | null;
  /** Auto-expiry sentinel. expire_stale_sessions() clears stuck rows after this. */
  expires_at: string | null;
}

export type PushTokenRow = {
  user_id: string;
  token: string;
  platform: PlatformType;
  updated_at: string;
}

export type ModerationActionRow = {
  id: string;
  moderator_id: string;
  target_user_id: string;
  report_id: string | null;
  action: ModerationActionType;
  reason: string | null;
  created_at: string;
}

// ─── RPC Return Types ─────────────────────────────────────────────────────────

/**
 * Shape returned by the get_nearby_drivers() Postgres function / Edge Function.
 * NEVER includes raw coordinates — only approximate distance.
 * approximate_distance_m is rounded to the nearest 50 m for privacy.
 */
export type NearbyDriverCard = {
  user_id: string;
  handle: string | null;
  display_name: string;
  avatar_url: string | null;
  vehicle_type: VehicleType | null;
  vehicle_label: string | null;
  vehicle_color: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  /** Rounded to nearest 50 m — never exact */
  approximate_distance_m: number;
  is_speaking: boolean;
  session_id: string;
  /** Do Not Disturb — client should suppress voice UI for this driver. */
  dnd: boolean;
}

// ─── Supabase Database shape (used by createClient<Database>) ─────────────────
//
// IMPORTANT: Every table entry MUST include `Relationships: []`.
// supabase-js v2 defines GenericTable as requiring `Relationships: GenericRelationship[]`.
// If any table is missing this field, Database['public'] does not satisfy GenericSchema,
// createClient resolves Schema as `never`, and every .update()/.insert() call
// fails with "parameter of type 'never'".
//
// Similarly, `Views` must be present for GenericSchema compatibility.

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Omit<ProfileRow, 'created_at' | 'updated_at' | 'is_banned' | 'is_shadow_banned'>;
        Update: Partial<Pick<ProfileRow, 'handle' | 'display_name' | 'avatar_url' | 'bio' | 'dnd_mode' | 'default_range_m' | 'accepted_terms_at' | 'accepted_terms_version'>>;
        Relationships: [];
      };
      vehicles: {
        Row: VehicleRow;
        // Only user_id, label, vehicle_type are NOT NULL with no default.
        // body_type/make/model/color/year are nullable; is_active defaults to true.
        Insert:
          & Pick<VehicleRow, 'user_id' | 'label' | 'vehicle_type'>
          & Partial<
              Pick<
                VehicleRow,
                'body_type' | 'make' | 'model' | 'color' | 'year' | 'is_active'
              >
            >;
        Update: Partial<
          Pick<
            VehicleRow,
            | 'label'
            | 'vehicle_type'
            | 'body_type'
            | 'make'
            | 'model'
            | 'color'
            | 'year'
            | 'is_active'
          >
        >;
        Relationships: [];
      };
      live_sessions: {
        Row: LiveSessionRow;
        Insert: Pick<LiveSessionRow, 'user_id' | 'range_m'> &
          Partial<Pick<LiveSessionRow, 'vehicle_id' | 'status' | 'ended_at' | 'ended_reason'>>;
        Update: Partial<
          Pick<LiveSessionRow, 'status' | 'ended_at' | 'last_heartbeat_at' | 'expires_at' | 'ended_reason'>
        >;
        Relationships: [];
      };
      /**
       * location_presence: write-only from client.
       * No Row type (no SELECT policy). Insert/Update go through Edge Functions.
       */
      location_presence: {
        Row: Record<string, never>;
        Insert: Record<string, never>; // written only via Edge Function RPC
        Update: Record<string, never>;
        Relationships: [];
      };
      private_zones: {
        Row: PrivateZoneRow;
        Insert: Omit<PrivateZoneRow, 'id' | 'created_at' | 'updated_at'> & {
          // center is required at insert; it is WKT 'POINT(lon lat)' (GIS convention).
          // It is NOT in PrivateZoneRow.Row — raw coords are never returned to the client.
          center: string;
        };
        Update: Partial<Pick<PrivateZoneRow, 'name' | 'kind' | 'radius_m'>>;
        Relationships: [];
      };
      blocks: {
        Row: BlockRow;
        Insert: Pick<BlockRow, 'blocker_id' | 'blocked_id'>;
        Update: Record<string, never>;
        Relationships: [];
      };
      reports: {
        Row: ReportRow;
        Insert: Pick<ReportRow, 'reporter_id' | 'reported_user_id' | 'reason' | 'context'> &
          Partial<Pick<ReportRow, 'details'>>;
        Update: Partial<Pick<ReportRow, 'status'>>;
        Relationships: [];
      };
      rooms: {
        Row: RoomRow;
        Insert: Omit<RoomRow, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<RoomRow, 'id' | 'owner_id' | 'created_at'>>;
        Relationships: [];
      };
      room_members: {
        Row: RoomMemberRow;
        Insert: Pick<RoomMemberRow, 'room_id' | 'user_id'> &
          Partial<Pick<RoomMemberRow, 'is_moderator'>>;
        Update: Partial<Pick<RoomMemberRow, 'is_moderator'>>;
        Relationships: [];
      };
      voice_sessions: {
        Row: VoiceSessionRow;
        Insert: Pick<VoiceSessionRow, 'user_id' | 'live_session_id'> &
          Partial<Pick<VoiceSessionRow, 'room_id' | 'is_speaking' | 'expires_at'>>;
        Update: Partial<Pick<VoiceSessionRow, 'is_speaking' | 'ended_at'>>;
        Relationships: [];
      };
      push_tokens: {
        Row: PushTokenRow;
        Insert: PushTokenRow;
        Update: Partial<PushTokenRow>;
        Relationships: [];
      };
      moderation_actions: {
        Row: ModerationActionRow;
        Insert: Omit<ModerationActionRow, 'id' | 'created_at'>;
        Update: Record<string, never>;
        Relationships: [];
      };
    };
    // Required by GenericSchema — RoadPing uses no database views.
    Views: Record<string, never>;
    Functions: {
      // ── Phase 3 Edge Function helpers (called via admin RPC) ──────────────
      get_nearby_drivers: {
        Args: {
          p_lat: number;
          p_lng: number;
          p_range_m: number;
          p_caller_id: string;
        };
        Returns: NearbyDriverCard[];
      };
      check_private_zone: {
        Args: { p_user_id: string; p_lat: number; p_lng: number };
        Returns: boolean;
      };
      upsert_location_presence: {
        Args: {
          p_user_id: string;
          p_session_id: string;
          p_lat: number;
          p_lng: number;
        };
        Returns: string; // timestamptz → ISO string
      };
      update_location_heartbeat: {
        Args: {
          p_user_id: string;
          p_session_id: string;
          p_lat: number;
          p_lng: number;
        };
        Returns: string; // timestamptz → ISO string
      };
      end_live_session: {
        Args: {
          p_session_id: string;
          p_user_id: string;
          p_reason: SessionEndedReason;
        };
        Returns: void;
      };
      // ── Phase 2 helpers (unchanged) ───────────────────────────────────────
      is_blocked: {
        Args: { a: string; b: string };
        Returns: boolean;
      };
      is_room_member: {
        Args: { p_room: string; p_user: string };
        Returns: boolean;
      };
      is_room_owner: {
        Args: { p_room: string; p_user: string };
        Returns: boolean;
      };
      is_user_inside_private_zone: {
        Args: { p_user: string; p_point: string }; // p_point = WKT geography
        Returns: boolean;
      };
      expire_stale_sessions: {
        Args: Record<never, never>;
        Returns: void;
      };
    };
  };
}

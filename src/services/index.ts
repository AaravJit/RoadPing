// ============================================================================
// RoadPing — service layer barrel export
//
// Import from here in your components:
//   import { auth, profile, vehicle, liveSession, … } from '@/services';
//
// Or import specific services:
//   import * as liveSession from '@/services/liveSession.service';
//
// Setup checklist:
//   1. npx expo install @supabase/supabase-js @react-native-async-storage/async-storage
//   2. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env
//   3. (Optional) add "EXPO_PUBLIC_SUPABASE_URL" to app.json extra → eas.build env
// ============================================================================

// ── Core client ──────────────────────────────────────────────────────────────
export { supabase, callEdgeFn } from './supabase';

// ── Types ─────────────────────────────────────────────────────────────────────
export type {
  AuthSession,
  AuthUser,
  Profile,
  ProfileUpdate,
  Vehicle,
  VehicleBodyType,
  VehicleCreate,
  VehicleUpdate,
  PrivateZone,
  ZoneCreate,
  ZoneKind,
  ZoneBlockResult,
  LiveSession,
  StartSessionParams,
  StartSessionResult,
  SessionEndReason,
  HeartbeatParams,
  HeartbeatResult,
  NearbyDriver,
  NearbyVehicle,
  Block,
  Report,
  ReportCreate,
  ReportContext,
  ReportStatus,
  Room,
  RoomCreate,
  RoomUpdate,
  RoomMember,
  RoomRole,
  ErrorCode,
} from './types';

export { ServiceError } from './types';

// ── Auth ─────────────────────────────────────────────────────────────────────
export * as auth from './auth.service';
export {
  signInWithEmail,
  signUpWithEmail,
  signInWithMagicLink,
  signOut,
  getSession,
  getCurrentUser,
  onAuthStateChange,
  refreshSession,
} from './auth.service';

// ── Profile ──────────────────────────────────────────────────────────────────
export * as profile from './profile.service';
export {
  getMyProfile,
  updateProfile,
  checkHandleAvailable,
  setHandle,
} from './profile.service';

// ── Vehicle ──────────────────────────────────────────────────────────────────
export * as vehicle from './vehicle.service';
export {
  listVehicles,
  getVehicle,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  setPrimary,
} from './vehicle.service';

// ── Private zones ─────────────────────────────────────────────────────────────
export * as privateZone from './privateZone.service';
export {
  listZones,
  getZone,
  createZone,
  deleteZone,
  checkBlock,
} from './privateZone.service';

// ── Live session ──────────────────────────────────────────────────────────────
export * as liveSession from './liveSession.service';
export {
  startSession,
  stopSession,
  getActiveSession,
  isLive,
} from './liveSession.service';

// ── Location presence (heartbeat) ────────────────────────────────────────────
export * as locationPresence from './locationPresence.service';
export {
  sendHeartbeat,
  HeartbeatManager,
} from './locationPresence.service';
export type { HeartbeatManagerOptions, ForceEndReason } from './locationPresence.service';

// ── Nearby drivers ────────────────────────────────────────────────────────────
export * as nearbyDrivers from './nearbyDrivers.service';
export {
  fetchNearbyDrivers,
  subscribeNearbyDrivers,
  mergeTalkingState,
} from './nearbyDrivers.service';
export type {
  DriversUpdateCallback,
  DriversErrorCallback,
  SubscribeOptions,
  Position,
  PositionGetter,
} from './nearbyDrivers.service';

// ── Rooms ─────────────────────────────────────────────────────────────────────
export * as room from './room.service';
export {
  listMyRooms,
  getRoom,
  createRoom,
  updateRoom,
  deleteRoom,
  findByInviteCode,
  joinByInviteCode,
  leaveRoom,
  listMembers,
  subscribeToRoom,
} from './room.service';
export type { RoomMemberEvent } from './room.service';

// ── Moderation ────────────────────────────────────────────────────────────────
export * as moderation from './moderation.service';
export {
  reportUser,
  listMyReports,
  blockUser,
  unblockUser,
  listMyBlocks,
  hasBlocked,
} from './moderation.service';

// ── Mock data ─────────────────────────────────────────────────────────────────
// Deliberately NOT re-exported here. Unconnected screens must import mocks
// explicitly from '@/services/mock' so real and mock data never blend on the
// main service surface (and mocks can't be shipped by accident).

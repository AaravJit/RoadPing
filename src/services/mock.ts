// ============================================================================
// RoadPing — mock data for screens not yet wired to the backend.
//
// Import from here directly in unconnected screens:
//   import { MOCK_DRIVERS, MOCK_PROFILE } from '@/services/mock';
//
// Remove the import and replace with the real service call when connecting.
// ============================================================================

import type { NearbyDriver, Profile, Vehicle, Room, PrivateZone } from './types';

// ── Nearby Drivers ────────────────────────────────────────────────────────────

export const MOCK_DRIVERS: NearbyDriver[] = [
  {
    user_id: 'mock-user-1',
    handle: 'JakeDrives',
    display_name: 'Jake',
    distance_m: 644,          // ~0.4 mi
    lat: 37.7752,
    lng: -122.4194,
    heading: 45,
    speed_mps: 11.2,          // ~25 mph
    vehicle: {
      make: 'BMW',
      model: 'M3',
      year: 2021,
      color: '#1a1a2e',
      nickname: 'The Beast',
      body_type: 'sedan',
    },
    is_talking: false,
  },
  {
    user_id: 'mock-user-2',
    handle: 'nightcruiser',
    display_name: null,
    distance_m: 1207,         // ~0.75 mi
    lat: 37.7768,
    lng: -122.4201,
    heading: 180,
    speed_mps: 8.9,
    vehicle: {
      make: 'Nissan',
      model: 'GT-R',
      year: 2020,
      color: '#ff4500',
      nickname: null,
      body_type: 'coupe',
    },
    is_talking: true,
  },
  {
    user_id: 'mock-user-3',
    handle: 'RoadWarrior99',
    display_name: 'Alex R.',
    distance_m: 2414,         // ~1.5 mi
    lat: 37.7790,
    lng: -122.4210,
    heading: 270,
    speed_mps: 0,
    vehicle: {
      make: 'Ford',
      model: 'Mustang GT',
      year: 2019,
      color: '#2d6a4f',
      nickname: 'Midnight',
      body_type: 'sportsCar',
    },
    is_talking: false,
  },
  {
    user_id: 'mock-user-4',
    handle: 'velvetshift',
    display_name: null,
    distance_m: 3219,         // ~2 mi
    lat: 37.7810,
    lng: -122.4215,
    heading: 90,
    speed_mps: 15.6,
    vehicle: {
      make: 'Porsche',
      model: '911 GT3',
      year: 2022,
      color: '#ffd700',
      nickname: null,
      body_type: 'sportsCar',
    },
    is_talking: false,
  },
  {
    user_id: 'mock-user-5',
    handle: 'turbo_kay',
    display_name: 'Kay',
    distance_m: 4023,         // ~2.5 mi
    lat: 37.7825,
    lng: -122.4230,
    heading: 315,
    speed_mps: 22.4,          // ~50 mph
    vehicle: {
      make: 'Subaru',
      model: 'WRX STI',
      year: 2023,
      color: '#c0c0c0',
      nickname: 'Sparky',
      body_type: 'sedan',
    },
    is_talking: false,
  },
];

// ── Profile ──────────────────────────────────────────────────────────────────

export const MOCK_PROFILE: Profile = {
  id: 'mock-self-user',
  handle: 'driver_you',
  display_name: null,
  avatar_url: null,
  default_range_m: 500,
  dnd: false,
  is_banned: false,
  is_shadow_suppressed: false,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// ── Vehicles ─────────────────────────────────────────────────────────────────

export const MOCK_VEHICLES: Vehicle[] = [
  {
    id: 'mock-vehicle-1',
    owner_id: 'mock-self-user',
    make: 'Toyota',
    model: 'GR86',
    year: 2023,
    color: '#ffffff',
    nickname: 'White Noise',
    body_type: 'sportsCar',
    is_primary: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

// ── Private Zones ─────────────────────────────────────────────────────────────

export const MOCK_ZONES: PrivateZone[] = [
  {
    id: 'mock-zone-1',
    user_id: 'mock-self-user',
    name: 'Home',
    lat: 37.7740,
    lng: -122.4189,
    radius_m: 300,
    kind: 'home',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

// ── Rooms ─────────────────────────────────────────────────────────────────────

export const MOCK_ROOMS: Room[] = [
  {
    id: 'mock-room-1',
    owner_id: 'mock-self-user',
    name: 'Friday Night Run',
    description: 'Bay Bridge to the reservoir',
    is_private: false,
    invite_code: 'abc123',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'mock-room-2',
    owner_id: 'mock-user-1',
    name: 'East Bay Crew',
    description: null,
    is_private: true,
    invite_code: 'xyz789',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

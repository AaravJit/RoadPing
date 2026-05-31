/**
 * Screenshot/demo mode — local-only fixture data for App Store screenshots.
 *
 * Activated by setting `EXPO_PUBLIC_SCREENSHOT_MODE=true` in `.env` before
 * starting the dev server. The flag is read at module load (see `env.ts`)
 * and `nearbyDrivers.ts` checks it before issuing the network call.
 *
 * Safety:
 *   • Never set in production / TestFlight builds.
 *   • Never writes to the backend.
 *   • Never represents real users — every `user_id` here is a clearly
 *     synthetic UUID prefix (`demo-...`).
 *   • Drive screen overlays a "DEMO MODE" badge whenever this is active.
 */
import type { NearbyDriverCard } from './types';

/** Fixture used by getNearbyDrivers() when SCREENSHOT_MODE is on. */
export const DEMO_DRIVERS: NearbyDriverCard[] = [
  {
    user_id: 'demo-00000000-0000-0000-0000-000000000001',
    handle: 'miguel_speed',
    display_name: 'Miguel',
    avatar_url: null,
    vehicle_type: 'car',
    vehicle_label: 'Midnight Blue Tesla Model 3',
    vehicle_color: 'blue',
    vehicle_make: 'Tesla',
    vehicle_model: 'Model 3',
    approximate_distance_m: 50,
    is_speaking: true,
    session_id: 'demo-session-1',
    dnd: false,
  },
  {
    user_id: 'demo-00000000-0000-0000-0000-000000000002',
    handle: 'drivequeen',
    display_name: 'Anita',
    avatar_url: null,
    vehicle_type: 'car',
    vehicle_label: 'Black Honda Civic',
    vehicle_color: 'black',
    vehicle_make: 'Honda',
    vehicle_model: 'Civic',
    approximate_distance_m: 350,
    is_speaking: false,
    session_id: 'demo-session-2',
    dnd: false,
  },
  {
    user_id: 'demo-00000000-0000-0000-0000-000000000003',
    handle: 'redm3',
    display_name: 'Jordan',
    avatar_url: null,
    vehicle_type: 'car',
    vehicle_label: 'Red BMW 320i',
    vehicle_color: 'red',
    vehicle_make: 'BMW',
    vehicle_model: '320i',
    approximate_distance_m: 900,
    is_speaking: false,
    session_id: 'demo-session-3',
    dnd: false,
  },
  {
    user_id: 'demo-00000000-0000-0000-0000-000000000004',
    handle: 'monsterrider',
    display_name: 'Sam',
    avatar_url: null,
    vehicle_type: 'motorcycle',
    vehicle_label: 'Yellow Ducati Monster',
    vehicle_color: 'yellow',
    vehicle_make: 'Ducati',
    vehicle_model: 'Monster',
    approximate_distance_m: 1500,
    is_speaking: false,
    session_id: 'demo-session-4',
    dnd: false,
  },
  {
    user_id: 'demo-00000000-0000-0000-0000-000000000005',
    handle: 'quietcrz',
    display_name: 'Priya',
    avatar_url: null,
    vehicle_type: 'car',
    vehicle_label: 'Silver Toyota Corolla',
    vehicle_color: 'silver',
    vehicle_make: 'Toyota',
    vehicle_model: 'Corolla',
    approximate_distance_m: 2200,
    is_speaking: false,
    session_id: 'demo-session-5',
    dnd: true,
  },
];

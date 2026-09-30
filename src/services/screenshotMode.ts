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
 *   • Uses the Phase 2 contract: a distance band per driver, never a
 *     distance, coordinate or direction (docs/PHASE2_PROXIMITY_PRIVACY.md).
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
    distance_band: 'within_800m',
    is_speaking: true,
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
    distance_band: 'within_800m',
    is_speaking: false,
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
    distance_band: '800m_to_1600m',
    is_speaking: false,
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
    distance_band: '800m_to_1600m',
    is_speaking: false,
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
    distance_band: '1600m_to_3200m',
    is_speaking: false,
    dnd: true,
  },
];

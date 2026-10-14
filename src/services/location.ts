/**
 * Location service — When In Use permission and one-off fixes.
 *
 * Privacy rules upheld here:
 *  - Only When In Use permission is requested. Always is never requested.
 *    Background updates while live come from the native module's own
 *    location manager (modules/roadping-native, Phase 3), which iOS allows
 *    under When In Use for a session started in the foreground.
 *  - Exact coordinates never appear in UI — callers pass them straight to
 *    Edge Functions (start-live-session, update-live-location) and to the
 *    NearbyMap component (which uses them only for map centering, not display).
 *  - No location history is stored anywhere in the app.
 */
import * as Location from 'expo-location';

export type LocationPermissionStatus = 'granted' | 'denied' | 'undetermined';

export interface Coords {
  lat: number;
  lng: number;
  /** Compass bearing in degrees 0–360, if available. */
  heading?: number;
  /** Speed in m/s, if available. */
  speedMps?: number;
  /** GPS accuracy radius in metres, if available. */
  accuracyM?: number;
}

export async function getLocationPermissionStatus(): Promise<LocationPermissionStatus> {
  const { status } = await Location.getForegroundPermissionsAsync();
  if (status === Location.PermissionStatus.GRANTED) return 'granted';
  if (status === Location.PermissionStatus.DENIED) return 'denied';
  return 'undetermined';
}

export async function requestLocationPermission(): Promise<LocationPermissionStatus> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status === Location.PermissionStatus.GRANTED) return 'granted';
  if (status === Location.PermissionStatus.DENIED) return 'denied';
  return 'undetermined';
}

/**
 * Quiet, best-effort fix used to pre-center the map *before* the user taps
 * Start RoadPing. Never prompts for permission, never starts a live session,
 * never sends data to the backend. Returns null if permission is not already
 * granted or if the OS refuses a fix.
 */
export async function getQuietCoords(): Promise<Coords | null> {
  try {
    const perm = await getLocationPermissionStatus();
    if (perm !== 'granted') return null;
    return await getCurrentCoords();
  } catch {
    return null;
  }
}

/**
 * Returns the current GPS fix. Throws if location services are unavailable.
 * The returned coords are passed to Edge Functions and map centering only —
 * they are never stored persistently or displayed as text in the UI.
 */
export async function getCurrentCoords(): Promise<Coords> {
  const loc = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  const { latitude, longitude, heading, speed, accuracy } = loc.coords;
  return {
    lat: latitude,
    lng: longitude,
    heading:
      typeof heading === 'number' && heading >= 0 ? heading : undefined,
    speedMps:
      typeof speed === 'number' && speed >= 0 ? speed : undefined,
    accuracyM:
      typeof accuracy === 'number' && accuracy > 0 ? accuracy : undefined,
  };
}

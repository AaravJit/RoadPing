// Location bridge — the ONLY place expo-location is touched.
// Screens and the live-session layer call these; they never import expo-location
// directly. A failure here must surface clearly so the app never pretends the
// user is live without a real fix.

import * as Location from 'expo-location';

export interface Fix {
  lat: number;
  lng: number;
  heading: number | null;
  speed: number | null;   // m/s
  accuracy: number | null; // m
}

export class LocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocationError';
  }
}

/**
 * Ensure foreground location permission is granted.
 * Throws `LocationError` if the user denies — callers must NOT proceed to go live.
 */
export async function ensurePermission(): Promise<void> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new LocationError(
      'Location permission is off. RoadPing needs your location to go live and find drivers nearby.',
    );
  }
}

/**
 * Read the device's current position.
 * Ensures permission first. Throws `LocationError` if unavailable.
 */
export async function getCurrentFix(): Promise<Fix> {
  await ensurePermission();
  let pos: Location.LocationObject;
  try {
    pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  } catch (e) {
    throw new LocationError(
      `Could not read your location: ${(e as Error).message}. Move to open sky and try again.`,
    );
  }
  const c = pos.coords;
  return {
    lat: c.latitude,
    lng: c.longitude,
    heading: c.heading ?? null,
    speed: c.speed ?? null,
    accuracy: c.accuracy ?? null,
  };
}

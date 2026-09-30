/**
 * Synthetic map placement for nearby drivers — shared by the real map and the
 * fallback radar so both follow the same privacy rule.
 *
 * The angle around you is a deterministic hash of the driver's user_id, NOT
 * their real bearing; only the (server-rounded) distance is real. The map
 * therefore never reveals which direction another driver is in.
 */

function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h * 33) ^ s.charCodeAt(i)) & 0x7fffffff;
  }
  return h;
}

/** Stable pseudo-angle for a driver, in radians. Not a bearing. */
export function syntheticAngleRad(userId: string): number {
  return ((djb2(userId) % 360) * Math.PI) / 180;
}

/** Angle = user_id hash mod 360 (NOT true bearing); radius = server-rounded distance. */
export function syntheticCoord(
  userLat: number,
  userLng: number,
  distanceM: number,
  userId: string,
): { latitude: number; longitude: number } {
  const angleRad = syntheticAngleRad(userId);
  const latPerMetre = 1 / 111_320;
  const lngPerMetre = 1 / (111_320 * Math.cos((userLat * Math.PI) / 180));
  return {
    latitude: userLat + distanceM * Math.cos(angleRad) * latPerMetre,
    longitude: userLng + distanceM * Math.sin(angleRad) * lngPerMetre,
  };
}

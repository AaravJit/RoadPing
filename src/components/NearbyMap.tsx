/**
 * NearbyMap — locked, pitched, vehicle-follow driving radar for Drive.
 *
 * Phase 16D correction patch:
 *   • The camera is LOCKED to the user. There is no 2D/3D toggle and no free
 *     map browsing — scroll / zoom / rotate / pitch *gestures* are disabled.
 *     The 3D pitch is applied programmatically via the Camera API, so the user
 *     can never flatten the map back to a 2D top-down browse view.
 *   • Always pitched (3D-style) where the OS map provider supports camera
 *     pitch (Apple Maps on iOS, Google Maps on Android). See rangeToZoom /
 *     PITCH below and the limitation note in buildCamera().
 *   • Close-up framing around the user's active vehicle, derived from rangeM.
 *   • Compass-follow: the camera heading tracks the device compass (foreground
 *     watchHeadingAsync — magnetometer, NOT background location) so the world
 *     rotates around a centered, upright user. Falls back to the GPS course
 *     heading, then the last heading, then north-up. The "You" vehicle icon is
 *     an upright billboard and never spins with the map.
 *   • The user marker uses the current user's active vehicle category icon.
 *   • Nearby drivers appear as vehicle-category blips with a clean gamertag
 *     label (display name / @handle) floating above each one.
 *   • `recenterTick` prop — drive.tsx bumps it to re-lock onto the user.
 *   • Fallback: if `react-native-maps` is unavailable we fall through to
 *     MockMapView so the screen still works.
 *
 * Privacy invariants (unchanged from Phase 7):
 *   • userCoords are used only for centering the camera and the Circle radius.
 *     They are never displayed as text.
 *   • Driver markers are placed at SYNTHETIC positions: angle is a
 *     deterministic hash of user_id (NOT the real bearing). No directional
 *     info leaks.
 *   • No lat/lng is ever rendered as a label.
 */
import React, { useEffect, useRef } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Colors } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';
import { FontSize, FontWeight } from '@/theme/typography';
import { Radius, Spacing } from '@/theme/spacing';
import * as Location from 'expo-location';
import type { NearbyDriverCard } from '@/services/types';
import type { Coords } from '@/services/location';
import { MockMapView } from './MockMapView';
import { DriverMarker } from './DriverMarker';

// ─── Try to load react-native-maps ────────────────────────────────────────────

interface MapsModule {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  MapView: React.ComponentType<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Marker: React.ComponentType<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Circle: React.ComponentType<any>;
}

function tryLoadMaps(): MapsModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const m = require('react-native-maps') as {
      default: MapsModule['MapView'];
      Marker: MapsModule['Marker'];
      Circle: MapsModule['Circle'];
    };
    return { MapView: m.default, Marker: m.Marker, Circle: m.Circle };
  } catch {
    return null;
  }
}

const maps = tryLoadMaps();

// ─── Camera tuning ──────────────────────────────────────────────────────────────

/**
 * Programmatic 3D tilt. Applied via the Camera API regardless of pitch
 * gestures (which are disabled) so the view is ALWAYS pitched where supported.
 */
const PITCH = 55;

/** Animation duration when the camera re-locks onto the user (ms). */
const FOLLOW_MS = 600;

/**
 * Compass-follow tuning. The camera heading tracks the device compass so the
 * world rotates around a centered, upright user (navigation feel).
 *   • THRESHOLD: ignore sub-threshold wobble so the map doesn't jitter.
 *   • ANIM_MS: short, so rotation feels responsive but still smoothed by the
 *     map's own camera interpolation.
 */
const HEADING_THRESHOLD_DEG = 4;
const HEADING_ANIM_MS = 250;

/** Smallest absolute angle (0–180°) between two compass bearings. */
function angularDelta(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Close-up zoom for Android/Google Maps, derived from the broadcast range.
 * Smaller range → higher zoom (closer). Tuned so the broadcast ring fills a
 * comfortable portion of the screen for a live-driving feel.
 */
function rangeToZoom(rangeM: number): number {
  const delta = Math.max((rangeM / 111_320) * 1.6, 0.004);
  return Math.log2(360 / delta);
}

/** iOS/Apple Maps camera altitude (metres above ground) for the same framing. */
function rangeToAltitude(rangeM: number): number {
  return Math.max(rangeM * 1.1, 450);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h * 33) ^ s.charCodeAt(i)) & 0x7fffffff;
  }
  return h;
}

/** Angle = user_id hash mod 360 (NOT true bearing); radius = server-rounded distance. */
function syntheticCoord(
  userLat: number,
  userLng: number,
  distanceM: number,
  userId: string,
): { latitude: number; longitude: number } {
  const angleDeg = djb2(userId) % 360;
  const angleRad = (angleDeg * Math.PI) / 180;
  const latPerMetre = 1 / 111_320;
  const lngPerMetre = 1 / (111_320 * Math.cos((userLat * Math.PI) / 180));
  return {
    latitude: userLat + distanceM * Math.cos(angleRad) * latPerMetre,
    longitude: userLng + distanceM * Math.sin(angleRad) * lngPerMetre,
  };
}

// ─── Dark map style (Android / Google Maps only — iOS uses userInterfaceStyle) ─

const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#0c0c14' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#7a7f95' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0c0c14' }] },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#9aa0b4' }],
  },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1c1c2e' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#22223a' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2a2a48' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#0c0c14' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#8a8fa8' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#070b18' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#33446a' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#0e0e18' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#0f1a14' }] },
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.attraction', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.medical', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.school', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.sports_complex', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.government', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

/** Wide US-centered fallback camera when we have no fix — never an all-black map. */
const FALLBACK_CAMERA = {
  center: { latitude: 37.0902, longitude: -95.7129 },
  pitch: 0,
  heading: 0,
  zoom: 3,
  altitude: 4_000_000,
} as const;

/** Show gamertag labels for everyone until the map gets crowded. */
const LABEL_CAP = 10;

// ─── YouMarker ────────────────────────────────────────────────────────────────

function YouMarker({ vehicleEmoji }: { vehicleEmoji: string | null }) {
  const { accent } = useTheme();
  return (
    <View style={youStyles.outer} pointerEvents="none">
      <View style={[youStyles.label, { borderColor: accent.accent }]}>
        <Text style={youStyles.labelText}>You</Text>
      </View>
      <View style={youStyles.stack}>
        <View
          style={[
            youStyles.ringOuter,
            { backgroundColor: accent.accentMuted, borderColor: accent.accent },
          ]}
        />
        {vehicleEmoji !== null ? (
          <View
            style={[
              youStyles.body,
              { backgroundColor: accent.accentMuted, borderColor: accent.accent },
            ]}
          >
            <Text style={youStyles.emoji}>{vehicleEmoji}</Text>
          </View>
        ) : (
          <View style={[youStyles.dot, { backgroundColor: accent.accent }]} />
        )}
      </View>
    </View>
  );
}

const youStyles = StyleSheet.create({
  outer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    backgroundColor: 'rgba(10, 10, 20, 0.92)',
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    marginBottom: 4,
  },
  labelText: {
    fontSize: FontSize.micro,
    fontWeight: FontWeight.bold,
    color: '#fff',
    letterSpacing: 0.4,
  },
  stack: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringOuter: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 107, 53, 0.18)',
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  body: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 18,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.primary,
    borderWidth: 2,
    borderColor: '#fff',
  },
});

// ─── RealMapView ──────────────────────────────────────────────────────────────

interface RealMapProps {
  drivers: NearbyDriverCard[];
  rangeM: number;
  selectedDriverId: string | null;
  isLive: boolean;
  userCoords: Coords | null;
  userVehicleEmoji: string | null;
  onMarkerPress: (driver: NearbyDriverCard) => void;
  recenterTick: number;
  onHeadingChange?: (deg: number) => void;
}

function RealMapView({
  drivers,
  rangeM,
  selectedDriverId,
  isLive,
  userCoords,
  userVehicleEmoji,
  onMarkerPress,
  recenterTick,
  onHeadingChange,
}: RealMapProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  const { accent } = useTheme();

  // ── Refs read by the (stable) compass callback + imperative camera moves ────
  /** Current heading the camera is following. Survives fixes that lack one. */
  const headingRef = useRef(0);
  /** Heading the camera was last animated to — throttles sub-threshold wobble. */
  const lastAppliedHeadingRef = useRef(0);
  /** True once the device compass has produced a heading (it then owns heading). */
  const compassActiveRef = useRef(false);
  /** Latest props, readable inside the once-created heading subscription. */
  const userCoordsRef = useRef<Coords | null>(userCoords);
  userCoordsRef.current = userCoords;
  const rangeMRef = useRef(rangeM);
  rangeMRef.current = rangeM;
  // Surface the camera heading (rounded degrees) to the parent's compass.
  const onHeadingChangeRef = useRef(onHeadingChange);
  onHeadingChangeRef.current = onHeadingChange;
  const lastEmittedHeadingRef = useRef(-1);

  function emitHeading(deg: number) {
    const r = Math.round(((deg % 360) + 360) % 360);
    if (r === lastEmittedHeadingRef.current) return;
    lastEmittedHeadingRef.current = r;
    onHeadingChangeRef.current?.(r);
  }

  /**
   * Build the locked, pitched, heading-follow camera from the current refs.
   *
   * Limitation: programmatic pitch + heading are honoured by Apple Maps (iOS)
   * and Google Maps (Android), but each provider may clamp the effective tilt
   * at very high zooms and briefly ease heading on its own. The result is a
   * "pitched 3D-style" compass view rather than a guaranteed fixed angle. There
   * is no 2D fallback exposed to the user.
   */
  function buildCamera() {
    const coords = userCoordsRef.current;
    if (!coords) return FALLBACK_CAMERA;
    return {
      center: { latitude: coords.lat, longitude: coords.lng },
      pitch: PITCH,
      heading: headingRef.current,
      zoom: rangeToZoom(rangeMRef.current),
      altitude: rangeToAltitude(rangeMRef.current),
    };
  }

  // Compass-follow: subscribe to the device heading and rotate the camera so
  // the world turns around the centered, upright user. Foreground only — this
  // uses the magnetometer/compass, NOT background location. Starts once we have
  // a fix (which implies foreground location permission is already granted).
  const hasCoords = userCoords !== null;
  useEffect(() => {
    if (!hasCoords) return;
    let sub: { remove: () => void } | null = null;
    let cancelled = false;
    void (async () => {
      try {
        const s = await Location.watchHeadingAsync((h) => {
          // Prefer true (geographic) heading; fall back to magnetic.
          const raw = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
          if (!Number.isFinite(raw) || raw < 0) return;
          compassActiveRef.current = true;
          headingRef.current = raw;
          emitHeading(raw);
          if (
            !mapRef.current ||
            userCoordsRef.current === null ||
            angularDelta(raw, lastAppliedHeadingRef.current) < HEADING_THRESHOLD_DEG
          ) {
            return;
          }
          lastAppliedHeadingRef.current = raw;
          mapRef.current.animateCamera(buildCamera(), { duration: HEADING_ANIM_MS });
        });
        if (cancelled) s.remove();
        else sub = s;
      } catch {
        // Compass unavailable (e.g. simulator) — camera keeps the last known /
        // GPS-course heading from buildCamera(); no jitter, no crash.
      }
    })();
    return () => {
      cancelled = true;
      if (sub) sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCoords]);

  // Follow/lock: re-center on every new fix (and re-frame on range changes).
  // Heading is owned by the compass above; until it activates we seed from the
  // GPS course heading so the very first frames still point the right way.
  useEffect(() => {
    if (!mapRef.current || !userCoords) return;
    if (!compassActiveRef.current && typeof userCoords.heading === 'number') {
      headingRef.current = userCoords.heading;
      lastAppliedHeadingRef.current = userCoords.heading;
    }
    emitHeading(headingRef.current);
    mapRef.current.animateCamera(buildCamera(), { duration: FOLLOW_MS });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userCoords?.lat, userCoords?.lng, userCoords?.heading, rangeM]);

  // Manual re-center: restore the centered, pitched, heading-follow view.
  useEffect(() => {
    if (recenterTick === 0) return;
    if (!mapRef.current || !userCoords) return;
    mapRef.current.animateCamera(buildCamera(), { duration: 450 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterTick]);

  if (!maps) return null;
  const { MapView, Marker, Circle } = maps;

  const initialCamera = userCoords ? buildCamera() : FALLBACK_CAMERA;

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFillObject}
      provider={undefined}
      userInterfaceStyle="dark"
      customMapStyle={Platform.OS === 'android' ? DARK_MAP_STYLE : undefined}
      initialCamera={initialCamera}
      showsUserLocation={false}
      showsMyLocationButton={false}
      showsScale={false}
      showsTraffic={false}
      showsBuildings={true}
      showsIndoors={false}
      showsPointsOfInterest={false}
      showsCompass={false}
      toolbarEnabled={false}
      // Locked driving view: no free browsing and no manual 2D/3D switch.
      // The 3D pitch is forced through the Camera API above, not gestures.
      scrollEnabled={false}
      zoomEnabled={false}
      rotateEnabled={false}
      pitchEnabled={false}
      mapPadding={{ top: 0, right: 0, bottom: 120, left: 0 }}
    >
      {isLive && userCoords && (
        <Circle
          center={{ latitude: userCoords.lat, longitude: userCoords.lng }}
          radius={rangeM}
          strokeColor={accent.accent}
          strokeWidth={2}
          fillColor={accent.accentMuted}
        />
      )}

      {userCoords && (
        <Marker
          coordinate={{ latitude: userCoords.lat, longitude: userCoords.lng }}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={false}
          // Upright billboard: never lies flat or spins with the map. As the
          // camera heading rotates, the "You" vehicle icon stays facing
          // straight up/forward on screen.
          flat={false}
          rotation={0}
          zIndex={999}
        >
          <YouMarker vehicleEmoji={userVehicleEmoji} />
        </Marker>
      )}

      {isLive &&
        userCoords &&
        drivers.map((d) => {
          const coord = syntheticCoord(
            userCoords.lat,
            userCoords.lng,
            d.approximate_distance_m,
            d.user_id,
          );
          const isSpeaking = d.is_speaking && !d.dnd;
          const isSelected = d.user_id === selectedDriverId;
          const showLabel =
            drivers.length <= LABEL_CAP || isSelected || isSpeaking;
          return (
            <Marker
              key={d.user_id}
              coordinate={coord}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={isSpeaking || isSelected}
              onPress={() => onMarkerPress(d)}
              // Upright billboard — we have no reliable per-driver heading, so
              // their icons stay screen-upright rather than faking a direction.
              flat={false}
              zIndex={isSelected ? 100 : isSpeaking ? 50 : 10}
            >
              <DriverMarker
                driver={d}
                isSpeaking={isSpeaking}
                isSelected={isSelected}
                showLabel={showLabel}
              />
            </Marker>
          );
        })}
    </MapView>
  );
}

// ─── NearbyMap — public component ─────────────────────────────────────────────

export interface NearbyMapProps {
  drivers: NearbyDriverCard[];
  rangeM: number;
  selectedDriverId: string | null;
  isLive: boolean;
  userCoords: Coords | null;
  /** Emoji for the current user's active vehicle category (null → generic dot). */
  userVehicleEmoji?: string | null;
  onMarkerPress: (driver: NearbyDriverCard) => void;
  /** Bump this counter to imperatively re-lock the camera on the user. */
  recenterTick?: number;
  /** Fired (rounded degrees) when the camera heading changes — drives the compass. */
  onHeadingChange?: (deg: number) => void;
}

export function NearbyMap({
  drivers,
  rangeM,
  selectedDriverId,
  isLive,
  userCoords,
  userVehicleEmoji = null,
  onMarkerPress,
  recenterTick = 0,
  onHeadingChange,
}: NearbyMapProps) {
  if (!maps) {
    return (
      <View style={styles.root}>
        <MockMapView
          drivers={drivers}
          rangeM={rangeM}
          selectedDriverId={selectedDriverId}
          isLive={isLive}
          onMarkerPress={onMarkerPress}
        />
        <View style={styles.fallbackBadge} pointerEvents="none">
          <Text style={styles.fallbackBadgeText}>Radar fallback</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <RealMapView
        drivers={drivers}
        rangeM={rangeM}
        selectedDriverId={selectedDriverId}
        isLive={isLive}
        userCoords={userCoords}
        userVehicleEmoji={userVehicleEmoji}
        onMarkerPress={onMarkerPress}
        recenterTick={recenterTick}
        onHeadingChange={onHeadingChange}
      />

      {userCoords === null && (
        <View style={styles.locatingWrap} pointerEvents="none">
          <View style={styles.locatingCard}>
            <Text style={styles.locatingTitle}>Map ready</Text>
            <Text style={styles.locatingBody}>
              Tap Start RoadPing to share your live position and see nearby
              drivers.
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0c0c14',
  },

  locatingWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  locatingCard: {
    backgroundColor: 'rgba(10, 10, 20, 0.78)',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    gap: Spacing.xs,
    maxWidth: 360,
  },
  locatingTitle: {
    fontSize: FontSize.bodySmall,
    fontWeight: FontWeight.semibold,
    color: Colors.primary,
    textAlign: 'center',
  },
  locatingBody: {
    fontSize: FontSize.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: FontSize.caption * 1.5,
  },

  fallbackBadge: {
    position: 'absolute',
    top: 8,
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 107, 53, 0.18)',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md12,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  fallbackBadgeText: {
    fontSize: FontSize.micro,
    fontWeight: FontWeight.semibold,
    color: Colors.primary,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});

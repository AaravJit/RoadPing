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
import { Platform, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';

import type { NearbyDriverCard } from '@/services/types';
import type { Coords } from '@/services/location';
import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import { Radius } from '@/theme/spacing';
import { MockMapView } from './MockMapView';
import { DriverMarker } from './DriverMarker';
import { syntheticCoord } from './mapPlacement';

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

/** Your own position: vehicle in an accent ring, with a small "You" pill. */
function YouMarker({ vehicleEmoji }: { vehicleEmoji: string | null }) {
  const styles = useStyles();
  return (
    <View style={styles.youOuter} pointerEvents="none">
      <View style={styles.youLabel}>
        <Text style={styles.youLabelText} allowFontScaling={false}>
          You
        </Text>
      </View>
      {vehicleEmoji !== null ? (
        <View style={styles.youBody}>
          <Text style={styles.youEmoji} allowFontScaling={false}>
            {vehicleEmoji}
          </Text>
        </View>
      ) : (
        <View style={styles.youDot} />
      )}
    </View>
  );
}

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
  topInset: number;
  bottomInset: number;
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
  topInset,
  bottomInset,
}: RealMapProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  const { accent, scheme } = useTheme();

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
      // Follows the app appearance (Apple Maps light/dark).
      userInterfaceStyle={scheme}
      customMapStyle={Platform.OS === 'android' && scheme === 'dark' ? DARK_MAP_STYLE : undefined}
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
      mapPadding={{ top: topInset, right: 0, bottom: bottomInset, left: 0 }}
    >
      {isLive && userCoords && (
        <Circle
          center={{ latitude: userCoords.lat, longitude: userCoords.lng }}
          radius={rangeM}
          strokeColor={accent.fill}
          strokeWidth={1.5}
          fillColor={accent.muted}
        />
      )}

      {userCoords && (
        <Marker
          coordinate={{ latitude: userCoords.lat, longitude: userCoords.lng }}
          anchor={{ x: 0.5, y: 0.5 }}
          key={`you-${scheme}`}
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
              // Keyed by appearance so the marker bitmap is redrawn when
              // light/dark changes (tracksViewChanges is off when idle).
              key={`${d.user_id}-${scheme}`}
              coordinate={coord}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={isSpeaking || isSelected}
              onPress={() => onMarkerPress(d)}
              accessibilityLabel={isSpeaking ? 'Nearby driver, talking' : 'Nearby driver'}
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
  /** Space covered by floating chrome, so "you" stays centred in what's visible. */
  topInset?: number;
  bottomInset?: number;
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
  topInset = 0,
  bottomInset = 120,
}: NearbyMapProps) {
  const styles = useStyles();
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
        topInset={topInset}
        bottomInset={bottomInset}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const useStyles = makeStyles((t) => ({
  root: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  youOuter: {
    alignItems: 'center',
  },
  youLabel: {
    backgroundColor: t.accent.fill,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 1,
    marginBottom: 3,
  },
  youLabelText: {
    fontSize: 11,
    fontWeight: '700',
    color: t.accent.onFill,
  },
  youBody: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: t.accent.fill,
    backgroundColor: t.colors.mapMarker,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: t.colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: t.scheme === 'dark' ? 0.45 : 0.2,
    shadowRadius: 4,
  },
  youEmoji: {
    fontSize: 20,
  },
  youDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 3,
    borderColor: t.colors.mapMarker,
    backgroundColor: t.accent.fill,
  },
}));

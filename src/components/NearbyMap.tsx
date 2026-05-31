/**
 * NearbyMap — permanent dark map surface for the Drive screen.
 *
 * Phase 13 redesign:
 *   • The real MapView is rendered ALWAYS, not only when live.
 *   • Permanent dark style on both iOS (userInterfaceStyle="dark") and
 *     Android (customMapStyle JSON).
 *   • Visible roads + subtle labels + water/land — never a flat black sheet.
 *   • Range ring (Circle) around the user only when live, sized to rangeM.
 *   • User pin only when we have a fix.
 *   • Custom DriverMarker components; speaking ones pulse.
 *   • `recenterTick` prop — drive.tsx bumps it to re-center the map.
 *   • Empty state: when no coords yet, a small floating card overlays the
 *     map so it never looks broken — the map itself is still drawn behind.
 *   • Fallback: if `react-native-maps` is unavailable we fall through to
 *     MockMapView so the screen still works.
 *
 * Privacy invariants (unchanged from Phase 7):
 *   • userCoords are used only for centering and Circle radius. Never
 *     displayed as text.
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
import { FontSize, FontWeight } from '@/theme/typography';
import { Radius, Spacing } from '@/theme/spacing';
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

function regionDelta(rangeM: number): number {
  return Math.max((rangeM / 111_320) * 2.8, 0.012);
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

/** Wide US-centered fallback when we have no fix — never an all-black map. */
const FALLBACK_REGION = {
  latitude: 37.0902,
  longitude: -95.7129,
  latitudeDelta: 35,
  longitudeDelta: 50,
} as const;

// ─── YouMarker ────────────────────────────────────────────────────────────────

function YouMarker() {
  return (
    <View style={youStyles.outer} pointerEvents="none">
      <View style={youStyles.ringOuter} />
      <View style={youStyles.dot} />
    </View>
  );
}

const youStyles = StyleSheet.create({
  outer: {
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
  onMarkerPress: (driver: NearbyDriverCard) => void;
  recenterTick: number;
}

function RealMapView({
  drivers,
  rangeM,
  selectedDriverId,
  isLive,
  userCoords,
  onMarkerPress,
  recenterTick,
}: RealMapProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  const lastAutoCenterRef = useRef<string | null>(null);

  // Auto-center the first time we acquire a fix, or when rangeM changes.
  useEffect(() => {
    if (!mapRef.current || !userCoords) return;
    const fingerprint = `${userCoords.lat.toFixed(3)},${userCoords.lng.toFixed(3)},${rangeM}`;
    if (lastAutoCenterRef.current === fingerprint) return;
    lastAutoCenterRef.current = fingerprint;
    const delta = regionDelta(rangeM);
    mapRef.current.animateToRegion(
      {
        latitude: userCoords.lat,
        longitude: userCoords.lng,
        latitudeDelta: delta,
        longitudeDelta: delta,
      },
      700,
    );
  }, [userCoords, rangeM]);

  // Manual recenter triggered by parent.
  useEffect(() => {
    if (recenterTick === 0) return;
    if (!mapRef.current || !userCoords) return;
    const delta = regionDelta(rangeM);
    mapRef.current.animateToRegion(
      {
        latitude: userCoords.lat,
        longitude: userCoords.lng,
        latitudeDelta: delta,
        longitudeDelta: delta,
      },
      500,
    );
  }, [recenterTick, userCoords, rangeM]);

  if (!maps) return null;
  const { MapView, Marker, Circle } = maps;

  const initialRegion = userCoords
    ? {
        latitude: userCoords.lat,
        longitude: userCoords.lng,
        latitudeDelta: regionDelta(rangeM),
        longitudeDelta: regionDelta(rangeM),
      }
    : FALLBACK_REGION;

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFillObject}
      provider={undefined}
      userInterfaceStyle="dark"
      customMapStyle={Platform.OS === 'android' ? DARK_MAP_STYLE : undefined}
      initialRegion={initialRegion}
      showsUserLocation={false}
      showsMyLocationButton={false}
      showsCompass={false}
      showsScale={false}
      showsTraffic={false}
      showsBuildings={false}
      showsIndoors={false}
      showsPointsOfInterest={false}
      rotateEnabled={false}
      pitchEnabled={false}
      toolbarEnabled={false}
      mapPadding={{ top: 0, right: 0, bottom: 120, left: 0 }}
    >
      {isLive && userCoords && (
        <Circle
          center={{ latitude: userCoords.lat, longitude: userCoords.lng }}
          radius={rangeM}
          strokeColor="rgba(255, 107, 53, 0.55)"
          strokeWidth={2}
          fillColor="rgba(255, 107, 53, 0.08)"
        />
      )}

      {userCoords && (
        <Marker
          coordinate={{ latitude: userCoords.lat, longitude: userCoords.lng }}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={false}
          zIndex={999}
        >
          <YouMarker />
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
          return (
            <Marker
              key={d.user_id}
              coordinate={coord}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={isSpeaking || isSelected}
              onPress={() => onMarkerPress(d)}
              zIndex={isSelected ? 100 : isSpeaking ? 50 : 10}
            >
              <DriverMarker
                driver={d}
                isSpeaking={isSpeaking}
                isSelected={isSelected}
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
  onMarkerPress: (driver: NearbyDriverCard) => void;
  /** Bump this counter to imperatively recenter the map on the user. */
  recenterTick?: number;
}

export function NearbyMap({
  drivers,
  rangeM,
  selectedDriverId,
  isLive,
  userCoords,
  onMarkerPress,
  recenterTick = 0,
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
        onMarkerPress={onMarkerPress}
        recenterTick={recenterTick}
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

/**
 * MockMapView — full-screen map placeholder.
 *
 * Phase 6: dark canvas with decorative concentric rings and deterministic
 * driver marker positions derived from user_id hash + approximate_distance_m.
 * PRIVACY INVARIANT: real GPS coordinates are NEVER passed to or rendered by
 * this component. No lat/lng in or out.
 *
 * Phase 7: swap this component's internals for MapLibre GL / Mapbox.
 * The prop interface (drivers, rangeM, selectedDriverId, isLive,
 * onMarkerPress) stays the same — only the rendering changes.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Colors } from '@/theme/colors';
import type { NearbyDriverCard, VehicleType } from '@/services/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Deterministic hash: string → non-negative integer. */
function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h * 33) ^ s.charCodeAt(i)) & 0x7fffffff;
  }
  return h;
}

const VEHICLE_EMOJI: Record<VehicleType, string> = {
  car: '🚗',
  motorcycle: '🏍',
  truck: '🛻',
  van: '🚐',
  bicycle: '🚲',
  other: '🛞',
};

/** Fractions of (min dimension / 2) at which concentric rings are drawn. */
const RING_FRACTIONS = [0.22, 0.42, 0.62, 0.82] as const;

/** Diameter of each driver marker dot. */
const MARKER = 36;

// ─── MapMarker ────────────────────────────────────────────────────────────────

interface MarkerProps {
  driver: NearbyDriverCard;
  x: number; // absolute px from left
  y: number; // absolute px from top
  selected: boolean;
  onPress: () => void;
}

function MapMarker({ driver, x, y, selected, onPress }: MarkerProps) {
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0)).current;

  const isSpeaking = driver.is_speaking && !driver.dnd;

  useEffect(() => {
    if (!isSpeaking) {
      pulseScale.setValue(1);
      pulseOpacity.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseScale, {
            toValue: 2.4,
            duration: 900,
            useNativeDriver: true,
          }),
          Animated.timing(pulseOpacity, {
            toValue: 0,
            duration: 900,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(pulseScale, {
            toValue: 1,
            duration: 0,
            useNativeDriver: true,
          }),
          Animated.timing(pulseOpacity, {
            toValue: 0.55,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isSpeaking, pulseScale, pulseOpacity]);

  const emoji =
    driver.vehicle_type !== null ? VEHICLE_EMOJI[driver.vehicle_type] : '🚗';

  return (
    <Pressable
      style={[styles.markerWrap, { left: x - MARKER / 2, top: y - MARKER / 2 }]}
      onPress={onPress}
      hitSlop={14}
      accessibilityRole="button"
      accessibilityLabel={`${driver.display_name} — tap to select`}
    >
      {/* Pulsing ring for speaking drivers */}
      {isSpeaking && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.markerRing,
            { transform: [{ scale: pulseScale }], opacity: pulseOpacity },
          ]}
        />
      )}
      {/* Marker dot */}
      <View
        style={[
          styles.markerDot,
          isSpeaking && styles.markerDotSpeaking,
          selected && styles.markerDotSelected,
        ]}
      >
        <Text style={styles.markerEmoji}>{emoji}</Text>
      </View>
    </Pressable>
  );
}

// ─── MockMapView ──────────────────────────────────────────────────────────────

export interface MockMapViewProps {
  drivers: NearbyDriverCard[];
  rangeM: number;
  selectedDriverId: string | null;
  isLive: boolean;
  onMarkerPress: (driver: NearbyDriverCard) => void;
}

export function MockMapView({
  drivers,
  rangeM,
  selectedDriverId,
  isLive,
  onMarkerPress,
}: MockMapViewProps) {
  const [layout, setLayout] = useState<{ w: number; h: number } | null>(null);
  const youPulse = useRef(new Animated.Value(1)).current;
  const youOpacity = useRef(new Animated.Value(0)).current;

  function onLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    setLayout({ w: width, h: height });
  }

  // "You are here" dot pulses while live.
  useEffect(() => {
    if (!isLive) {
      youPulse.setValue(1);
      youOpacity.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(youPulse, {
            toValue: 2.0,
            duration: 1400,
            useNativeDriver: true,
          }),
          Animated.timing(youOpacity, {
            toValue: 0,
            duration: 1400,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(youPulse, {
            toValue: 1,
            duration: 0,
            useNativeDriver: true,
          }),
          Animated.timing(youOpacity, {
            toValue: 0.5,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isLive, youPulse, youOpacity]);

  /**
   * Compute the pixel position of a driver marker.
   * PRIVACY: only approximate_distance_m / rangeM ratio used for the radius;
   * angle is a pure hash of user_id. No real bearing/heading data is used.
   */
  function markerPos(driver: NearbyDriverCard): { x: number; y: number } | null {
    if (layout === null) return null;
    const cx = layout.w / 2;
    const cy = layout.h / 2;
    // Max visual radius = 38% of the shorter screen dimension.
    const maxR = Math.min(layout.w, layout.h) * 0.38;
    const hash = djb2(driver.user_id);
    const angleRad = (hash % 360) * (Math.PI / 180);
    // Radial distance is proportional to approximate_distance_m, with a
    // 20% floor so no marker sits on the "you" dot.
    const ratio = Math.min(driver.approximate_distance_m / rangeM, 1);
    const r = maxR * (0.2 + ratio * 0.8);
    return {
      x: cx + Math.cos(angleRad) * r,
      y: cy + Math.sin(angleRad) * r,
    };
  }

  return (
    <View style={styles.root} onLayout={onLayout}>
      {/* Decorative concentric rings */}
      {layout !== null &&
        RING_FRACTIONS.map((f) => {
          const r = Math.min(layout.w, layout.h) * f;
          return (
            <View
              key={f}
              pointerEvents="none"
              style={[
                styles.gridRing,
                {
                  width: r * 2,
                  height: r * 2,
                  borderRadius: r,
                  left: layout.w / 2 - r,
                  top: layout.h / 2 - r,
                },
              ]}
            />
          );
        })}

      {/* "You" dot at center */}
      {layout !== null && (
        <View
          pointerEvents="none"
          style={[
            styles.youWrap,
            { left: layout.w / 2 - 20, top: layout.h / 2 - 20 },
          ]}
        >
          <Animated.View
            style={[
              styles.youRing,
              { transform: [{ scale: youPulse }], opacity: youOpacity },
            ]}
          />
          <View style={[styles.youDot, isLive && styles.youDotLive]}>
            <Text style={styles.youLabel}>YOU</Text>
          </View>
        </View>
      )}

      {/* Driver markers */}
      {layout !== null &&
        drivers.map((d) => {
          const pos = markerPos(d);
          if (pos === null) return null;
          return (
            <MapMarker
              key={d.user_id}
              driver={d}
              x={pos.x}
              y={pos.y}
              selected={d.user_id === selectedDriverId}
              onPress={() => onMarkerPress(d)}
            />
          );
        })}

      {/* Phase 6 identifier badge */}
      <View style={styles.badge} pointerEvents="none">
        <Text style={styles.badgeText}>MOCK MAP</Text>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0C0C14',
  },
  gridRing: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 53, 0.07)',
  },

  // Markers
  markerWrap: {
    position: 'absolute',
    width: MARKER,
    height: MARKER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerRing: {
    position: 'absolute',
    width: MARKER,
    height: MARKER,
    borderRadius: MARKER / 2,
    backgroundColor: Colors.liveGlow,
  },
  markerDot: {
    width: MARKER,
    height: MARKER,
    borderRadius: MARKER / 2,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerDotSpeaking: {
    backgroundColor: Colors.liveMuted,
    borderColor: Colors.live,
  },
  markerDotSelected: {
    backgroundColor: Colors.primaryMuted,
    borderColor: Colors.primary,
  },
  markerEmoji: {
    fontSize: 16,
  },

  // You dot
  youWrap: {
    position: 'absolute',
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  youRing: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primaryMuted,
  },
  youDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  youDotLive: {
    backgroundColor: Colors.primaryMuted,
    borderColor: Colors.primary,
  },
  youLabel: {
    fontSize: 7,
    fontWeight: '700' as const,
    color: Colors.textTertiary,
    letterSpacing: 0.5,
  },

  // Phase badge
  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600' as const,
    color: Colors.textTertiary,
    letterSpacing: 1.2,
  },
});

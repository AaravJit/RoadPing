/**
 * DriverMarker — custom map marker for a nearby driver.
 *
 * Visual language:
 *   • Pill-shaped circular body with the vehicle emoji.
 *   • Color halo when the driver's vehicle has a known color string.
 *   • Pulsing red ring while the driver is speaking (and not in DND).
 *   • Lifted/larger amber outline when selected (synced with bottom sheet).
 *
 * Privacy: this component receives a `NearbyDriverCard` only — never any
 * lat/lng. It renders inside react-native-maps <Marker> using the synthetic
 * coordinate computed by NearbyMap.
 *
 * Memoized to keep map re-renders cheap when only a sibling marker changed.
 */
import React, { memo, useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/theme/colors';
import { FontWeight } from '@/theme/typography';
import type { NearbyDriverCard, VehicleType } from '@/services/types';

const VEHICLE_EMOJI: Record<VehicleType, string> = {
  car: '🚗',
  motorcycle: '🏍',
  truck: '🛻',
  van: '🚐',
  bicycle: '🚲',
  other: '🛞',
};

const MARKER_SIZE = 40;
const SELECTED_SIZE = 52;

/**
 * Map a common color name to a visual swatch. Unknown colors fall back to
 * the dark surface tone so the marker still reads cleanly. This is *only*
 * a halo accent — the marker itself is always readable.
 */
const COLOR_SWATCH: Record<string, string> = {
  black: '#1a1a22',
  white: '#e5e5ea',
  silver: '#bfbfc6',
  gray: '#9a9aa3',
  grey: '#9a9aa3',
  red: '#ff3b30',
  blue: '#0a84ff',
  green: '#34c759',
  yellow: '#ffd60a',
  orange: '#ff9f0a',
  purple: '#bf5af2',
  pink: '#ff375f',
  brown: '#8b6f47',
  gold: '#d4af37',
};

function haloColor(color: string | null): string | null {
  if (color === null) return null;
  const key = color.trim().toLowerCase();
  return COLOR_SWATCH[key] ?? null;
}

interface DriverMarkerProps {
  driver: NearbyDriverCard;
  isSpeaking: boolean;
  isSelected: boolean;
}

function DriverMarkerInner({
  driver,
  isSpeaking,
  isSelected,
}: DriverMarkerProps) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isSpeaking) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 750,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 750,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isSpeaking, pulse]);

  const ringOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.25, 0.85],
  });
  const ringScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.55],
  });

  const emoji = VEHICLE_EMOJI[driver.vehicle_type ?? 'car'] ?? '🚗';
  const halo = haloColor(driver.vehicle_color);
  const size = isSelected ? SELECTED_SIZE : MARKER_SIZE;

  return (
    <View
      style={[styles.outer, { width: size + 24, height: size + 24 }]}
      pointerEvents="none"
    >
      {/* Speaking pulse — only when actively speaking */}
      {isSpeaking && (
        <Animated.View
          style={[
            styles.speakingRing,
            {
              width: size + 16,
              height: size + 16,
              borderRadius: (size + 16) / 2,
              opacity: ringOpacity,
              transform: [{ scale: ringScale }],
            },
          ]}
        />
      )}

      {/* Halo behind body — colored if we know the vehicle color */}
      {halo !== null && (
        <View
          style={[
            styles.halo,
            {
              width: size + 8,
              height: size + 8,
              borderRadius: (size + 8) / 2,
              borderColor: halo,
            },
          ]}
        />
      )}

      {/* Marker body */}
      <View
        style={[
          styles.body,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
          isSelected && styles.bodySelected,
          isSpeaking && !isSelected && styles.bodySpeaking,
        ]}
      >
        <Text style={[styles.emoji, isSelected && styles.emojiSelected]}>
          {emoji}
        </Text>
      </View>

      {/* Tiny anchor point underneath, so the marker reads as "pinned" */}
      <View
        style={[
          styles.anchor,
          isSelected && styles.anchorSelected,
          isSpeaking && !isSelected && styles.anchorSpeaking,
        ]}
      />
    </View>
  );
}

export const DriverMarker = memo(DriverMarkerInner, (a, b) => {
  return (
    a.driver.user_id === b.driver.user_id &&
    a.driver.vehicle_type === b.driver.vehicle_type &&
    a.driver.vehicle_color === b.driver.vehicle_color &&
    a.isSpeaking === b.isSpeaking &&
    a.isSelected === b.isSelected
  );
});

const styles = StyleSheet.create({
  outer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  speakingRing: {
    position: 'absolute',
    borderWidth: 3,
    borderColor: Colors.live,
  },
  halo: {
    position: 'absolute',
    borderWidth: 2,
    opacity: 0.85,
  },
  body: {
    backgroundColor: 'rgba(20, 20, 28, 0.96)',
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    // iOS shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.45,
    shadowRadius: 5,
  },
  bodySelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryMuted,
  },
  bodySpeaking: {
    borderColor: Colors.live,
  },
  emoji: {
    fontSize: 20,
  },
  emojiSelected: {
    fontSize: 26,
  },
  anchor: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.textTertiary,
    marginTop: -2,
  },
  anchorSelected: {
    backgroundColor: Colors.primary,
  },
  anchorSpeaking: {
    backgroundColor: Colors.live,
  },
});

/** Exposed for callers (NearbyMap) that need the same emoji mapping. */
export function vehicleEmojiFor(type: VehicleType | null): string {
  return VEHICLE_EMOJI[type ?? 'car'] ?? '🚗';
}

/** Exposed for the "YOU" pin styling consistency. */
export const MARKER_SIZES = {
  default: MARKER_SIZE,
  selected: SELECTED_SIZE,
} as const;

// Re-export so memo + named are both available.
export { FontWeight };

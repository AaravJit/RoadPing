/**
 * MapCompass — compact navigation compass for the Drive map (Phase 17).
 *
 * Sits top-left over the map. The whole dial counter-rotates by the camera
 * heading so the red "N" tick always points to true north on screen:
 *   • heading 0  (north-up)  → N points straight up.
 *   • heading 90 (facing east) → N rotates to point left.
 * If heading is unavailable the parent keeps it at 0 (north-up), so the compass
 * simply shows N up — never blank, never wrong.
 *
 * Small, dark, translucent, premium. pointerEvents="none" so it never eats map
 * or bottom-sheet gestures.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { Colors } from '@/theme/colors';
import { FontWeight } from '@/theme/typography';

const SIZE = 44;
const NORTH_RED = '#FF3B30';

interface MapCompassProps {
  /** Camera heading in degrees (0 = north-up). */
  heading: number;
}

function MapCompassInner({ heading }: MapCompassProps) {
  const { accent } = useTheme();
  return (
    <View
      style={[styles.outer, { borderColor: accent.accent }]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/* Rotating dial — counter-rotate so N tracks true north. */}
      <View style={[styles.dial, { transform: [{ rotate: `${-heading}deg` }] }]}>
        <View style={[styles.northTick, { backgroundColor: NORTH_RED }]} />
        <View style={styles.southTick} />
      </View>
      <Text style={styles.nLabel}>N</Text>
    </View>
  );
}

export const MapCompass = React.memo(MapCompassInner);

const styles = StyleSheet.create({
  outer: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: 'rgba(10, 10, 20, 0.82)',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius: 5,
  },
  dial: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  northTick: {
    position: 'absolute',
    top: 5,
    width: 3,
    height: 13,
    borderRadius: 2,
  },
  southTick: {
    position: 'absolute',
    bottom: 5,
    width: 3,
    height: 13,
    borderRadius: 2,
    backgroundColor: Colors.textTertiary,
  },
  nLabel: {
    fontSize: 13,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
});

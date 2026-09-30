/**
 * MapCompass — small glass compass shown while the map follows your heading.
 *
 * The dial counter-rotates by the camera heading so the red north needle
 * points to true north on screen. With no heading the parent passes 0, so it
 * simply reads north-up. Informational only: it never takes touches.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, GlassSurface } from '@/components/ui';
import { makeStyles, useTheme } from '@/theme/ThemeProvider';

const SIZE = 44;

interface MapCompassProps {
  /** Camera heading in degrees (0 = north-up). */
  heading: number;
}

function MapCompassInner({ heading }: MapCompassProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <GlassSurface radius={SIZE / 2} style={styles.outer}>
        <View style={[styles.dial, { transform: [{ rotate: `${-heading}deg` }] }]}>
          <View style={[styles.tick, styles.north, { backgroundColor: colors.live }]} />
          <View style={[styles.tick, styles.south, { backgroundColor: colors.textTertiary }]} />
        </View>
        <AppText variant="caption2" weight="bold" maxScale={1}>
          N
        </AppText>
      </GlassSurface>
    </View>
  );
}

export const MapCompass = React.memo(MapCompassInner);

const useStyles = makeStyles(() => ({
  outer: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dial: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tick: {
    position: 'absolute',
    width: 3,
    height: 10,
    borderRadius: 1.5,
  },
  north: { top: 4 },
  south: { bottom: 4 },
}));

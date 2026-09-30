/**
 * MockMapView — radar fallback used only when react-native-maps isn't linked
 * (e.g. a JS bundle on a binary without the maps module).
 *
 * PRIVACY: no coordinates in or out. Marker angle is the same synthetic hash
 * the real map uses; radius is proportional to the rounded distance.
 */
import React, { useState } from 'react';
import { Pressable, View, type LayoutChangeEvent } from 'react-native';

import { AppText } from '@/components/ui';
import type { NearbyDriverCard } from '@/services/types';
import { makeStyles } from '@/theme/ThemeProvider';
import { DriverMarker } from './DriverMarker';
import { personName } from './identity';
import { syntheticAngleRad } from './mapPlacement';

/** Fractions of (min dimension / 2) at which range rings are drawn. */
const RING_FRACTIONS = [0.25, 0.5, 0.75] as const;
const HIT = 56;

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
  const styles = useStyles();
  const [layout, setLayout] = useState<{ w: number; h: number } | null>(null);

  function onLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    setLayout({ w: width, h: height });
  }

  function markerPos(driver: NearbyDriverCard): { x: number; y: number } | null {
    if (layout === null) return null;
    const maxR = Math.min(layout.w, layout.h) * 0.38;
    const angle = syntheticAngleRad(driver.user_id);
    const ratio = Math.min(driver.approximate_distance_m / rangeM, 1);
    const r = maxR * (0.2 + ratio * 0.8);
    return { x: layout.w / 2 + Math.cos(angle) * r, y: layout.h / 2 + Math.sin(angle) * r };
  }

  return (
    <View style={styles.root} onLayout={onLayout}>
      {layout !== null &&
        RING_FRACTIONS.map((f) => {
          const r = Math.min(layout.w, layout.h) * f;
          return (
            <View
              key={f}
              pointerEvents="none"
              style={[
                styles.ring,
                { width: r * 2, height: r * 2, borderRadius: r, left: layout.w / 2 - r, top: layout.h / 2 - r },
              ]}
            />
          );
        })}

      {layout !== null && (
        <View
          pointerEvents="none"
          style={[styles.you, isLive && styles.youLive, { left: layout.w / 2 - 8, top: layout.h / 2 - 8 }]}
        />
      )}

      {isLive &&
        drivers.map((d) => {
          const pos = markerPos(d);
          if (pos === null) return null;
          const speaking = d.is_speaking && !d.dnd;
          return (
            <Pressable
              key={d.user_id}
              style={[styles.hit, { left: pos.x - HIT / 2, top: pos.y - HIT / 2 }]}
              onPress={() => onMarkerPress(d)}
              accessibilityRole="button"
              accessibilityLabel={`${personName(d)}${speaking ? ', talking' : ''}`}
            >
              <DriverMarker
                driver={d}
                isSpeaking={speaking}
                isSelected={d.user_id === selectedDriverId}
                showLabel={false}
              />
            </Pressable>
          );
        })}

      <View style={styles.badge} pointerEvents="none">
        <AppText variant="caption2" color="secondary">
          Simplified map
        </AppText>
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: {
    flex: 1,
    backgroundColor: t.colors.surfaceSecondary,
  },
  ring: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: t.colors.separator,
  },
  you: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: t.colors.surface,
    backgroundColor: t.colors.textTertiary,
  },
  youLive: {
    backgroundColor: t.accent.fill,
  },
  hit: {
    position: 'absolute',
    width: HIT,
    height: HIT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
  },
}));

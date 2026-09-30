/**
 * MockMapView — plain fallback used only when react-native-maps isn't linked
 * (e.g. a JS bundle on a binary without the maps module).
 *
 * Shows you at the centre with neutral rings. Like the real map, it draws no
 * other drivers: RoadPing knows only a distance band for them, not where they
 * are, so they are listed in the Nearby sheet instead.
 */
import React, { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';

import { AppText } from '@/components/ui';
import { makeStyles } from '@/theme/ThemeProvider';

/** Fractions of (min dimension / 2) at which decorative rings are drawn. */
const RING_FRACTIONS = [0.25, 0.5, 0.75] as const;

export interface MockMapViewProps {
  isLive: boolean;
}

export function MockMapView({ isLive }: MockMapViewProps) {
  const styles = useStyles();
  const [layout, setLayout] = useState<{ w: number; h: number } | null>(null);

  function onLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    setLayout({ w: width, h: height });
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
  badge: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
  },
}));

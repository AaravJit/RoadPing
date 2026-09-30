/**
 * DriverMarker — a nearby driver on the Drive map.
 *
 *   • Round body with the vehicle-type emoji (vehicle identity, not an icon).
 *   • Optional name pill above (display name / @handle only).
 *   • Thin paint-color ring when the vehicle color is known.
 *   • Speaking: live-red border plus a waveform badge — shape, not just color —
 *     and a calm pulse unless Reduce Motion is on.
 *   • Selected: larger, accent border.
 *
 * Privacy: receives a NearbyDriverCard only, never coordinates. It is drawn at
 * the synthetic position NearbyMap computes; it shows no direction.
 */
import React, { memo, useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { AppText, Icon } from '@/components/ui';
import type { NearbyDriverCard } from '@/services/types';
import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import { Radius, Spacing } from '@/theme/spacing';
import { personName, vehicleEmoji, vehicleSwatch } from './identity';

const MARKER_SIZE = 40;
const SELECTED_SIZE = 50;

interface DriverMarkerProps {
  driver: NearbyDriverCard;
  isSpeaking: boolean;
  isSelected: boolean;
  /** Show the name pill above the marker (hidden when the map is busy). */
  showLabel?: boolean;
}

function DriverMarkerInner({
  driver,
  isSpeaking,
  isSelected,
  showLabel = true,
}: DriverMarkerProps) {
  const { colors, accent, a11y } = useTheme();
  const styles = useStyles();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isSpeaking || a11y.reduceMotion) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1400, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [isSpeaking, pulse, a11y.reduceMotion]);

  const size = isSelected ? SELECTED_SIZE : MARKER_SIZE;
  const swatch = vehicleSwatch(driver.vehicle_color);
  const border = isSpeaking ? colors.live : isSelected ? accent.fill : colors.separatorStrong;

  return (
    <View style={styles.outer} pointerEvents="none">
      {showLabel && (
        <View style={[styles.labelPill, (isSelected || isSpeaking) && { borderColor: border }]}>
          <AppText variant="caption2" weight="semibold" numberOfLines={1} maxScale={1}>
            {personName(driver)}
          </AppText>
        </View>
      )}

      <View style={[styles.stack, { width: size + 16, height: size + 16 }]}>
        {isSpeaking && !a11y.reduceMotion && (
          <Animated.View
            style={[
              styles.pulse,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                borderColor: colors.live,
                opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
                transform: [
                  { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.4] }) },
                ],
              },
            ]}
          />
        )}
        {swatch !== null && (
          <View
            style={[
              styles.swatch,
              {
                width: size + 6,
                height: size + 6,
                borderRadius: (size + 6) / 2,
                borderColor: swatch,
              },
            ]}
          />
        )}
        <View
          style={[
            styles.body,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderColor: border,
              borderWidth: isSpeaking || isSelected ? 2.5 : StyleSheet.hairlineWidth * 2,
            },
          ]}
        >
          <Text style={{ fontSize: isSelected ? 24 : 20 }} allowFontScaling={false}>
            {vehicleEmoji(driver.vehicle_type)}
          </Text>
        </View>
        {isSpeaking && (
          <View style={[styles.badge, { backgroundColor: colors.live }]}>
            <Icon name="waveform" size={11} color={colors.textOnColor} weight="bold" />
          </View>
        )}
      </View>
    </View>
  );
}

export const DriverMarker = memo(
  DriverMarkerInner,
  (a, b) =>
    a.driver.user_id === b.driver.user_id &&
    a.driver.vehicle_type === b.driver.vehicle_type &&
    a.driver.vehicle_color === b.driver.vehicle_color &&
    a.driver.display_name === b.driver.display_name &&
    a.driver.handle === b.driver.handle &&
    a.isSpeaking === b.isSpeaking &&
    a.isSelected === b.isSelected &&
    a.showLabel === b.showLabel,
);

const useStyles = makeStyles((t) => ({
  outer: {
    alignItems: 'center',
  },
  labelPill: {
    maxWidth: 140,
    backgroundColor: t.colors.surface,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.colors.separator,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    marginBottom: -4,
    shadowColor: t.colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: t.scheme === 'dark' ? 0.4 : 0.15,
    shadowRadius: 3,
  },
  stack: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulse: {
    position: 'absolute',
    borderWidth: 3,
  },
  swatch: {
    position: 'absolute',
    borderWidth: 2,
  },
  body: {
    backgroundColor: t.colors.mapMarker,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: t.colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: t.scheme === 'dark' ? 0.45 : 0.2,
    shadowRadius: 4,
  },
  badge: {
    position: 'absolute',
    right: 4,
    top: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: t.colors.mapMarker,
  },
}));

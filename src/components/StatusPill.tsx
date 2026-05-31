/**
 * StatusPill — small colored badge for presence / session state.
 *
 * Variants:
 *  - live    : pulsing red — currently broadcasting
 *  - online  : green — in a live session, not speaking
 *  - away    : amber — session active but no recent heartbeat
 *  - offline : grey — not in a session
 *  - speaking: orange — hold-to-talk active
 */
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { Colors } from '@/theme/colors';
import { FontSize, FontWeight } from '@/theme/typography';
import { Radius, Spacing } from '@/theme/spacing';

export type PillVariant = 'live' | 'online' | 'away' | 'offline' | 'speaking';

interface StatusPillProps {
  variant: PillVariant;
  label?: string;
  style?: ViewStyle;
}

const PILL_CONFIG: Record<
  PillVariant,
  { bg: string; dot: string; text: string; defaultLabel: string; pulse: boolean }
> = {
  live: {
    bg: Colors.liveMuted,
    dot: Colors.live,
    text: Colors.live,
    defaultLabel: 'LIVE',
    pulse: true,
  },
  online: {
    bg: Colors.onlineMuted,
    dot: Colors.online,
    text: Colors.online,
    defaultLabel: 'Online',
    pulse: false,
  },
  away: {
    bg: Colors.warningMuted,
    dot: Colors.warning,
    text: Colors.warning,
    defaultLabel: 'Away',
    pulse: false,
  },
  offline: {
    bg: Colors.surface,
    dot: Colors.textTertiary,
    text: Colors.textTertiary,
    defaultLabel: 'Offline',
    pulse: false,
  },
  speaking: {
    bg: Colors.primaryMuted,
    dot: Colors.primary,
    text: Colors.primary,
    defaultLabel: 'Speaking',
    pulse: true,
  },
};

export function StatusPill({ variant, label, style }: StatusPillProps) {
  const config = PILL_CONFIG[variant];
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!config.pulse) {
      pulseAnim.setValue(1);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [config.pulse, pulseAnim]);

  return (
    <View
      style={[styles.pill, { backgroundColor: config.bg }, style]}
      accessibilityLabel={`Status: ${label ?? config.defaultLabel}`}
    >
      <Animated.View
        style={[
          styles.dot,
          { backgroundColor: config.dot, opacity: pulseAnim },
        ]}
      />
      <Text style={[styles.text, { color: config.text }]}>
        {label ?? config.defaultLabel}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
    gap: 5,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    fontSize: FontSize.micro,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});

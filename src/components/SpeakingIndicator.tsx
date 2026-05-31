/**
 * SpeakingIndicator — pulsing dot used on driver cards to show live voice.
 *
 * `active` toggles the animation. When `false` we render an inert,
 * accessibility-hidden placeholder so the layout doesn't shift.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/theme/colors';
import { FontSize, FontWeight } from '@/theme/typography';
import { Spacing } from '@/theme/spacing';

interface SpeakingIndicatorProps {
  active: boolean;
  /** Hide the "Speaking" label and only show the dot. */
  compact?: boolean;
}

export function SpeakingIndicator({
  active,
  compact = false,
}: SpeakingIndicatorProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    if (!active) {
      scale.setValue(1);
      opacity.setValue(0.6);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 1.6,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 600,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 1,
            duration: 0,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.6,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, scale, opacity]);

  if (!active) {
    return (
      <View style={styles.row} accessibilityElementsHidden>
        <View style={[styles.dot, styles.dotIdle]} />
        {!compact && <Text style={styles.idleText}>Silent</Text>}
      </View>
    );
  }

  return (
    <View style={styles.row} accessibilityLabel="Speaking now">
      <View>
        <Animated.View
          style={[
            styles.ring,
            { transform: [{ scale }], opacity },
          ]}
        />
        <View style={[styles.dot, styles.dotActive]} />
      </View>
      {!compact && <Text style={styles.activeText}>Speaking</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotIdle: {
    backgroundColor: Colors.textTertiary,
  },
  dotActive: {
    backgroundColor: Colors.live,
  },
  ring: {
    position: 'absolute',
    top: -3,
    left: -3,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.liveGlow,
  },
  idleText: {
    fontSize: FontSize.caption,
    color: Colors.textTertiary,
    fontWeight: FontWeight.medium,
  },
  activeText: {
    fontSize: FontSize.caption,
    color: Colors.live,
    fontWeight: FontWeight.semibold,
  },
});

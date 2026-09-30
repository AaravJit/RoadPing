/**
 * SpeakingWave — three small bars that move while someone is talking.
 *
 * Always paired with text ("Talking") by callers, so motion and color are
 * never the only signal. Under Reduce Motion the bars hold a static shape.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

interface SpeakingWaveProps {
  active: boolean;
  color?: string;
  /** Height of the tallest bar. */
  size?: number;
}

const BAR_PHASES = [0, 180, 90] as const;

export function SpeakingWave({ active, color, size = 14 }: SpeakingWaveProps) {
  const { colors, a11y } = useTheme();
  const t = useRef(new Animated.Value(0)).current;
  const animate = active && !a11y.reduceMotion;

  useEffect(() => {
    if (!animate) {
      t.stopAnimation();
      t.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(t, { toValue: 1, duration: 900, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [animate, t]);

  const barColor = color ?? colors.live;
  const barWidth = Math.max(2, Math.round(size / 5));

  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: barWidth, height: size }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {BAR_PHASES.map((phase, i) => {
        const staticScale = active ? [0.55, 1, 0.75][i]! : 0.3;
        const scaleY = animate
          ? t.interpolate({
              inputRange: [0, 0.25, 0.5, 0.75, 1],
              outputRange:
                phase === 0
                  ? [0.35, 1, 0.5, 0.85, 0.35]
                  : phase === 180
                    ? [1, 0.45, 0.9, 0.4, 1]
                    : [0.6, 0.8, 0.35, 1, 0.6],
            })
          : staticScale;
        return (
          <Animated.View
            key={phase}
            style={{
              width: barWidth,
              height: size,
              borderRadius: barWidth / 2,
              backgroundColor: active ? barColor : colors.textTertiary,
              transform: [{ scaleY }],
            }}
          />
        );
      })}
    </View>
  );
}

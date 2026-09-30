/**
 * PressableScale — Pressable with iOS-style press feedback: a short scale-down
 * on touch and a spring back on release. With Reduce Motion on, feedback
 * becomes a plain dim instead of movement.
 */
import React, { useRef } from 'react';
import {
  Animated,
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

export interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  /** How far to scale down while pressed (0.96 = 4%). */
  pressedScale?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

export function PressableScale({
  pressedScale = 0.96,
  style,
  onPressIn,
  onPressOut,
  disabled,
  children,
  ...rest
}: PressableScaleProps) {
  const { a11y } = useTheme();
  const progress = useRef(new Animated.Value(0)).current;

  function animateTo(value: number) {
    if (a11y.reduceMotion) {
      progress.setValue(value);
      return;
    }
    Animated.spring(progress, {
      toValue: value,
      useNativeDriver: true,
      speed: 40,
      bounciness: value === 0 ? 6 : 0,
    }).start();
  }

  const animatedStyle = a11y.reduceMotion
    ? { opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.6] }) }
    : {
        transform: [
          { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, pressedScale] }) },
        ],
      };

  return (
    <Pressable
      disabled={disabled}
      onPressIn={(e: GestureResponderEvent) => {
        animateTo(1);
        onPressIn?.(e);
      }}
      onPressOut={(e: GestureResponderEvent) => {
        animateTo(0);
        onPressOut?.(e);
      }}
      {...rest}
    >
      <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>
    </Pressable>
  );
}

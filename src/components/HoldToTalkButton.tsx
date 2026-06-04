/**
 * HoldToTalkButton — large press-and-hold voice button for the Drive screen.
 *
 * Driving-safe: HOLD_TO_TALK_SIZE (120 dp) circular target, single gesture,
 * loud visual states (idle → arming → speaking).
 *
 * Phase 6: rendering + animation only. Audio capture starts in Phase 7
 * inside `src/services/voice.ts`.
 */
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Colors } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';
import { FontSize, FontWeight } from '@/theme/typography';
import { HOLD_TO_TALK_SIZE, Spacing } from '@/theme/spacing';
import type { HoldState } from '@/hooks/useHoldToTalk';

interface HoldToTalkButtonProps {
  state: HoldState;
  disabled: boolean;
  onPressIn: () => void;
  onPressOut: () => void;
}

export function HoldToTalkButton({
  state,
  disabled,
  onPressIn,
  onPressOut,
}: HoldToTalkButtonProps) {
  const { accent } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;
  const ringScale = useRef(new Animated.Value(1)).current;
  const ringOpacity = useRef(new Animated.Value(0)).current;

  const speaking = state === 'speaking';
  const pending = state === 'arming' || state === 'releasing';

  // Scale the button down when held; bounce back on release.
  useEffect(() => {
    Animated.spring(scale, {
      toValue: pending || speaking ? 0.95 : 1,
      useNativeDriver: true,
      speed: 18,
      bounciness: 6,
    }).start();
  }, [pending, speaking, scale]);

  // Pulsing ring while speaking.
  useEffect(() => {
    if (!speaking) {
      ringScale.setValue(1);
      ringOpacity.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(ringScale, {
            toValue: 1.5,
            duration: 900,
            useNativeDriver: true,
          }),
          Animated.timing(ringOpacity, {
            toValue: 0,
            duration: 900,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(ringScale, {
            toValue: 1,
            duration: 0,
            useNativeDriver: true,
          }),
          Animated.timing(ringOpacity, {
            toValue: 0.7,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [speaking, ringScale, ringOpacity]);

  const label =
    state === 'speaking'
      ? 'SPEAKING'
      : state === 'arming'
        ? 'STARTING…'
        : state === 'releasing'
          ? 'STOPPING…'
          : 'HOLD TO TALK';

  return (
    <View style={styles.wrap} pointerEvents={disabled ? 'none' : 'auto'}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.ring,
          { transform: [{ scale: ringScale }], opacity: ringOpacity },
        ]}
      />
      <Pressable
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel="Hold to talk"
        accessibilityState={{ disabled, busy: pending, selected: speaking }}
        hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
      >
        <Animated.View
          style={[
            styles.button,
            // Idle/ready accent is themed; speaking & disabled override below.
            { backgroundColor: accent.accent, borderColor: accent.accentDim },
            speaking && styles.buttonSpeaking,
            disabled && styles.buttonDisabled,
            { transform: [{ scale }] },
          ]}
        >
          <Text style={styles.icon}>🎙</Text>
          <Text
            style={[
              styles.label,
              { color: accent.onAccent },
              speaking && styles.labelSpeaking,
            ]}
          >
            {label}
          </Text>
        </Animated.View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.md,
  },
  ring: {
    position: 'absolute',
    width: HOLD_TO_TALK_SIZE,
    height: HOLD_TO_TALK_SIZE,
    borderRadius: HOLD_TO_TALK_SIZE / 2,
    backgroundColor: Colors.liveGlow,
  },
  button: {
    width: HOLD_TO_TALK_SIZE,
    height: HOLD_TO_TALK_SIZE,
    borderRadius: HOLD_TO_TALK_SIZE / 2,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: Colors.primaryDim,
  },
  buttonSpeaking: {
    backgroundColor: Colors.live,
    borderColor: Colors.live,
  },
  buttonDisabled: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
  },
  icon: {
    fontSize: 32,
  },
  label: {
    marginTop: Spacing.xs,
    fontSize: FontSize.label,
    fontWeight: FontWeight.bold,
    color: Colors.textInverse,
    letterSpacing: 1,
  },
  labelSpeaking: {
    color: Colors.textPrimary,
  },
});

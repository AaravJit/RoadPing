/**
 * HoldToTalkButton — the physical-feeling push-to-talk control.
 *
 *   ready     accent fill, mic glyph, "Hold to Talk"
 *   pressed   presses in (scale + darker fill) the instant a finger lands
 *   talking   live red with a single expanding ring; "Talking"
 *   disabled  neutral well, dimmed glyph — plus the reason, from the caller
 *
 * State text changes with the fill, so transmitting is never shown by color
 * alone. Haptics: the voice hook fires an impact on press; this control adds
 * a firmer tick when transmission is actually confirmed. Reduce Motion keeps
 * the press-in (functional) and replaces the pulsing ring with a static one.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, View } from 'react-native';

import { AppText, Icon, haptic } from '@/components/ui';
import type { HoldState } from '@/hooks/useHoldToTalk';
import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import { HOLD_TO_TALK_SIZE } from '@/theme/spacing';

interface HoldToTalkButtonProps {
  state: HoldState;
  disabled: boolean;
  onPressIn: () => void;
  onPressOut: () => void;
  /** Who hears you, for the VoiceOver hint ("nearby drivers", "the room"). */
  audience?: string;
  size?: number;
}

const LABEL: Record<HoldState, string> = {
  idle: 'Hold to Talk',
  arming: 'Connecting',
  speaking: 'Talking',
  releasing: 'Ending',
};

export function HoldToTalkButton({
  state,
  disabled,
  onPressIn,
  onPressOut,
  audience = 'nearby drivers',
  size = HOLD_TO_TALK_SIZE,
}: HoldToTalkButtonProps) {
  const { colors, accent, a11y } = useTheme();
  const styles = useStyles();
  const press = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;

  const speaking = state === 'speaking';
  const engaged = state !== 'idle';

  // Press-in is functional feedback — kept under Reduce Motion, just faster.
  useEffect(() => {
    Animated.spring(press, {
      toValue: engaged ? 1 : 0,
      useNativeDriver: true,
      speed: a11y.reduceMotion ? 60 : 32,
      bounciness: engaged || a11y.reduceMotion ? 0 : 5,
    }).start();
  }, [engaged, press, a11y.reduceMotion]);

  // One calm expanding ring while transmitting.
  useEffect(() => {
    if (!speaking) {
      ring.stopAnimation();
      ring.setValue(0);
      return;
    }
    haptic.transmitStart();
    if (a11y.reduceMotion) {
      ring.setValue(0.5);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(ring, { toValue: 1, duration: 1400, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [speaking, ring, a11y.reduceMotion]);

  const fill = disabled
    ? colors.fill
    : speaking
      ? colors.live
      : engaged
        ? accent.fillPressed
        : accent.fill;
  const fg = disabled ? colors.textTertiary : speaking ? colors.textOnColor : accent.onFill;

  const ringStyle = a11y.reduceMotion
    ? { opacity: speaking ? 0.5 : 0, transform: [{ scale: 1.14 }] }
    : {
        opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
        transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] }) }],
      };

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.ring,
          { width: size, height: size, borderRadius: size / 2, borderColor: colors.live },
          ringStyle,
        ]}
      />
      <Pressable
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={disabled}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Hold to talk"
        accessibilityHint={
          disabled
            ? undefined
            : `Touch and hold to talk to ${audience}. Release to stop.`
        }
        accessibilityValue={{ text: disabled ? 'Unavailable' : LABEL[state] }}
        accessibilityState={{ disabled, selected: speaking, busy: state === 'arming' }}
      >
        <Animated.View
          style={[
            styles.button,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: fill,
              transform: [
                { scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.93] }) },
              ],
            },
            !disabled && styles.raised,
          ]}
        >
          <Icon name="mic.fill" size={size * 0.3} color={fg} weight="semibold" />
          <AppText
            variant="caption1"
            weight="bold"
            align="center"
            numberOfLines={1}
            maxScale={1.15}
            style={{ color: fg }}
          >
            {LABEL[state]}
          </AppText>
        </Animated.View>
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    borderWidth: 4,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  raised: {
    shadowColor: t.colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: t.scheme === 'dark' ? 0.5 : 0.22,
    shadowRadius: 12,
  },
}));

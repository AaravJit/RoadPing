/**
 * app/welcome.tsx — first-time introduction and permission priming.
 *
 * Shown once to a signed-in user before profile setup:
 *   1. You choose when you're visible.
 *   2. Location — explained first, then the system prompt only if the user
 *      taps Allow. "Not Now" moves on without prompting.
 *   3. Microphone — same pattern.
 *
 * Finishing or skipping marks the flag and hands back to the route gate,
 * which continues to profile → vehicle → appearance → Drive. Nothing here is
 * required: Drive asks again, in context, if a permission is still missing.
 *
 * App Store-safe copy only — no cops/checkpoints/racing/speeding/surveillance.
 */
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, View } from 'react-native';
import { useRouter } from 'expo-router';

import { AppText, Button, Icon, Screen, type IconName } from '@/components/ui';
import { useOnboardingSeen } from '@/hooks/useOnboardingSeen';
import { getLocationPermissionStatus, requestLocationPermission } from '@/services/location';
import { getMicPermissionStatus, requestMicPermission } from '@/services/voice';
import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import { SCREEN_INSET, Spacing } from '@/theme/spacing';

type StepKind = 'intro' | 'location' | 'microphone';

interface Step {
  kind: StepKind;
  icon: IconName;
  title: string;
  copy: string;
  primary: string;
}

const STEPS: readonly Step[] = [
  {
    kind: 'intro',
    icon: 'eye.slash.fill',
    title: "You're invisible until you go live",
    copy: 'Nothing is shared until you tap Go Live, and you stay live only until you end it.',
    primary: 'Continue',
  },
  {
    kind: 'location',
    icon: 'location.fill',
    title: 'Location',
    copy: 'See and be seen by nearby live drivers while you are live. Choose While Using the App.',
    primary: 'Allow Location',
  },
  {
    kind: 'microphone',
    icon: 'mic.fill',
    title: 'Microphone',
    copy: "Hold to talk. RoadPing doesn't record your conversations.",
    primary: 'Allow Microphone',
  },
];

export default function WelcomeScreen() {
  const router = useRouter();
  const styles = useStyles();
  const { accent, a11y } = useTheme();
  const { markSeen } = useOnboardingSeen();

  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const fade = useRef(new Animated.Value(1)).current;
  const step = STEPS[index]!; // index is always clamped to 0..STEPS.length-1
  const isLast = index === STEPS.length - 1;

  useEffect(() => {
    fade.setValue(a11y.reduceMotion ? 1 : 0);
    if (!a11y.reduceMotion) {
      Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    }
    AccessibilityInfo.announceForAccessibility(`Step ${index + 1} of ${STEPS.length}. ${step.title}`);
  }, [index, fade, a11y.reduceMotion, step.title]);

  function finish() {
    markSeen();
    router.replace('/');
  }

  function advance() {
    if (isLast) finish();
    else setIndex((i) => i + 1);
  }

  async function handlePrimary() {
    if (step.kind === 'intro') {
      advance();
      return;
    }
    setBusy(true);
    try {
      if (step.kind === 'location') {
        if ((await getLocationPermissionStatus()) === 'undetermined') {
          await requestLocationPermission();
        }
      } else if ((await getMicPermissionStatus()) === 'undetermined') {
        await requestMicPermission();
      }
    } catch {
      // A failed prompt isn't fatal here; Drive asks again in context.
    } finally {
      setBusy(false);
      advance();
    }
  }

  return (
    <Screen>
      <View style={styles.top}>
        <AppText variant="footnote" color="secondary" tabular>
          {index + 1} of {STEPS.length}
        </AppText>
        {index === 0 && (
          <Button label="Skip" variant="plain" size="sm" onPress={finish} accessibilityLabel="Skip introduction" />
        )}
      </View>

      <Animated.View
        style={[
          styles.body,
          {
            opacity: fade,
            transform: a11y.reduceMotion
              ? []
              : [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
          },
        ]}
      >
        <View style={[styles.iconWell, { backgroundColor: accent.muted }]}>
          <Icon name={step.icon} size={40} color={accent.text} />
        </View>
        <AppText variant="title1" weight="bold" align="center" accessibilityRole="header">
          {step.title}
        </AppText>
        <AppText variant="body" color="secondary" align="center">
          {step.copy}
        </AppText>
      </Animated.View>

      <View style={styles.footer}>
        <Button
          label={step.primary}
          size="lg"
          fullWidth
          loading={busy}
          onPress={() => void handlePrimary()}
        />
        {step.kind !== 'intro' && (
          <Button label="Not Now" variant="plain" fullWidth disabled={busy} onPress={advance} />
        )}
      </View>
    </Screen>
  );
}

const useStyles = makeStyles(() => ({
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: SCREEN_INSET,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  iconWell: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  footer: {
    gap: Spacing.sm,
    paddingHorizontal: SCREEN_INSET,
    paddingBottom: Spacing.md,
  },
}));

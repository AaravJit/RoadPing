/**
 * app/onboarding.tsx — First-launch sign-in landing.
 *
 * Shown to users who are not authenticated (routed here by app/index.tsx).
 *
 *   • RoadPing mark, name and one line of purpose
 *   • Sign in with Apple (native button, follows light/dark)
 *   • Continue with Email → /auth?mode=signup
 *   • Already have an account? Sign In → /auth?mode=signin
 *
 * APPLE SIGN-IN: real, not a placeholder. Uses expo-apple-authentication to
 * obtain an identity token, then supabase.auth.signInWithIdToken. The native
 * Apple button is only rendered when the OS reports the capability; it is
 * never imitated.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';

import { RoadPingLogo } from '@/components/RoadPingLogo';
import { AppText, Button, Notice, Screen } from '@/components/ui';
import {
  friendlyAppleError,
  isAppleAuthAvailable,
  isAppleCancel,
  signInWithApple,
} from '@/services/auth';
import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import { Radius, SCREEN_INSET, Spacing } from '@/theme/spacing';

const APPLE_BUTTON_HEIGHT = 56;

export default function OnboardingScreen() {
  const router = useRouter();
  const styles = useStyles();
  const { scheme, colors } = useTheme();

  const [appleAvailable, setAppleAvailable] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [appleError, setAppleError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void isAppleAuthAvailable().then((ok) => {
      if (active) setAppleAvailable(ok);
    });
    return () => {
      active = false;
    };
  }, []);

  async function handleApple() {
    if (appleLoading) return;
    setAppleError(null);
    setAppleLoading(true);
    try {
      await signInWithApple();
      // Session lands via onAuthStateChange; the route gate picks the next screen.
      router.replace('/');
    } catch (err) {
      // User dismissed the Apple sheet — silent.
      if (!isAppleCancel(err)) {
        setAppleError(friendlyAppleError(err));
      }
    } finally {
      setAppleLoading(false);
    }
  }

  return (
    <Screen>
      <View style={styles.container}>
        <View style={styles.brand}>
          <RoadPingLogo size={96} />
          <AppText variant="largeTitle" weight="bold" align="center" accessibilityRole="header">
            RoadPing
          </AppText>
          <AppText variant="title3" color="secondary" align="center">
            Talk with drivers nearby.
          </AppText>
        </View>

        <View style={styles.actions}>
          {appleAvailable && (
            <View>
              <AppleAuthentication.AppleAuthenticationButton
                // Re-mount when appearance flips so the native style updates.
                key={scheme}
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                buttonStyle={
                  scheme === 'dark'
                    ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                    : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                }
                cornerRadius={APPLE_BUTTON_HEIGHT / 2}
                style={styles.apple}
                onPress={() => void handleApple()}
              />
              {appleLoading && (
                <View style={styles.appleLoading} pointerEvents="none">
                  <ActivityIndicator color={colors.textSecondary} />
                </View>
              )}
            </View>
          )}

          <Button
            label="Continue with Email"
            icon="envelope.fill"
            variant={appleAvailable ? 'secondary' : 'primary'}
            size="lg"
            fullWidth
            disabled={appleLoading}
            onPress={() => router.push('/auth?mode=signup')}
          />

          {appleError !== null && (
            <Notice tone="danger" title="Sign in with Apple didn't work" message={appleError} />
          )}

          <Button
            label="I Already Have an Account"
            variant="plain"
            fullWidth
            disabled={appleLoading}
            onPress={() => router.push('/auth?mode=signin')}
          />

          <AppText variant="footnote" color="secondary" align="center">
            Use RoadPing only when it's safe and legal to do so.
          </AppText>
        </View>
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  container: {
    flex: 1,
    paddingHorizontal: SCREEN_INSET,
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.md,
    justifyContent: 'space-between',
  },
  brand: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  actions: {
    gap: Spacing.md12,
  },
  apple: {
    width: '100%',
    height: APPLE_BUTTON_HEIGHT,
  },
  appleLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full,
    backgroundColor: t.colors.scrim,
  },
}));

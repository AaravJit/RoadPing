/**
 * app/onboarding.tsx — First-launch auth landing screen.
 *
 * Shown to users who are not authenticated (routed here by app/index.tsx).
 *
 * Minimal, premium dark landing:
 *   • RoadPing mark + name + single tagline
 *   • Primary: Continue with email  → /auth?mode=signup
 *   • Apple:   Continue with Apple  → REAL native Sign in with Apple (Phase 16E)
 *   • Footer:  Already have an account? Sign in → /auth?mode=signin
 *
 * APPLE SIGN-IN (Phase 16E): real, not a placeholder.
 * Uses expo-apple-authentication to obtain an identity token, then
 * supabase.auth.signInWithIdToken({ provider: 'apple' }). On success the
 * AuthProvider's onAuthStateChange updates the session and the route gate
 * (app/index.tsx) sends the user to profile / vehicle / drive as needed.
 * The native Apple button is only rendered when the OS reports the capability
 * available; otherwise a polished disabled state is shown. We never fake it.
 */
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as AppleAuthentication from 'expo-apple-authentication';

import { AppButton } from '@/components/AppButton';
import { RoadPingLogo } from '@/components/RoadPingLogo';
import { Colors } from '@/theme/colors';
import { FontSize, FontWeight, TextStyles } from '@/theme/typography';
import { MIN_TOUCH_TARGET, Radius, Spacing } from '@/theme/spacing';
import {
  isAppleAuthAvailable,
  isAppleCancel,
  signInWithApple,
  friendlyAppleError,
} from '@/services/auth';

const APPLE_BUTTON_HEIGHT = 56;

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const router = useRouter();

  const [appleAvailable, setAppleAvailable] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [appleError, setAppleError] = useState<string | null>(null);

  // Check native Apple availability once on mount (iOS + capability present).
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
      // Session lands via onAuthStateChange; the route gate handles the
      // next screen (profile → vehicle → drive).
      router.replace('/');
    } catch (err) {
      // User dismissed the Apple sheet — silent, no error banner.
      if (!isAppleCancel(err)) {
        setAppleError(friendlyAppleError(err));
      }
    } finally {
      setAppleLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.container}>
        {/* ── Brand (centered) ──────────────────────────────────────────────── */}
        <View style={styles.brand}>
          <RoadPingLogo size={108} />
          <Text style={styles.appName}>
            Road<Text style={styles.appNamePing}>Ping</Text>
          </Text>
          <Text style={styles.tagline}>Go live when you drive.</Text>
        </View>

        {/* ── Actions (bottom) ──────────────────────────────────────────────── */}
        <View style={styles.actions}>
          <AppButton
            label="Continue with email"
            variant="primary"
            size="lg"
            fullWidth
            disabled={appleLoading}
            onPress={() => {
              router.push('/auth?mode=signup');
            }}
          />

          {/* Apple — real native Sign in with Apple when available. */}
          {appleAvailable ? (
            <View style={styles.appleWrap}>
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={
                  AppleAuthentication.AppleAuthenticationButtonType.CONTINUE
                }
                buttonStyle={
                  AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                }
                cornerRadius={APPLE_BUTTON_HEIGHT / 2}
                style={styles.appleButtonNative}
                onPress={() => {
                  void handleApple();
                }}
              />
              {appleLoading && (
                <View style={styles.appleLoadingOverlay}>
                  <ActivityIndicator color={Colors.background} />
                </View>
              )}
            </View>
          ) : (
            <View
              style={[styles.appleButton, styles.appleButtonDisabled]}
              accessibilityRole="button"
              accessibilityState={{ disabled: true }}
              accessibilityLabel="Continue with Apple, not available on this device"
            >
              <Text style={styles.appleGlyph}></Text>
              <Text style={styles.appleLabel}>Continue with Apple</Text>
            </View>
          )}

          {!appleAvailable && (
            <Text style={styles.appleUnavailableNote}>
              Sign in with Apple isn’t available on this device — continue with
              email instead.
            </Text>
          )}

          {appleError !== null && (
            <Text style={styles.appleErrorText} accessibilityRole="alert">
              {appleError}
            </Text>
          )}

          {/* Existing account */}
          <Pressable
            style={styles.signInLink}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="link"
            accessibilityLabel="Already have an account? Sign in"
            disabled={appleLoading}
            onPress={() => {
              router.push('/auth?mode=signin');
            }}
          >
            <Text style={styles.signInText}>
              Already have an account? <Text style={styles.signInTextBrand}>Sign in</Text>
            </Text>
          </Pressable>

          <Text style={styles.footnote}>
            Use RoadPing only when it is safe and legal to do so.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.xl,
    justifyContent: 'space-between',
  },

  // ── Brand ─────────────────────────────────────────────────────────────────
  brand: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  appName: {
    ...TextStyles.display,
    color: Colors.textPrimary,
    letterSpacing: -1,
    marginTop: Spacing.sm,
  },
  appNamePing: {
    color: Colors.primary,
  },
  tagline: {
    ...TextStyles.bodyLarge,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: FontSize.bodyLarge * 1.5,
  },

  // ── Actions ───────────────────────────────────────────────────────────────
  actions: {
    gap: Spacing.md,
  },

  // Native Apple button
  appleWrap: {
    width: '100%',
    height: APPLE_BUTTON_HEIGHT,
    justifyContent: 'center',
  },
  appleButtonNative: {
    width: '100%',
    height: APPLE_BUTTON_HEIGHT,
  },
  appleLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.55)',
    borderRadius: APPLE_BUTTON_HEIGHT / 2,
  },

  // Apple button (disabled fallback — unavailable device)
  appleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    minHeight: APPLE_BUTTON_HEIGHT,
    paddingHorizontal: Spacing.xl,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  appleButtonDisabled: {
    opacity: 0.55,
  },
  appleGlyph: {
    fontSize: FontSize.subheading,
    color: Colors.textPrimary,
    marginRight: Spacing.sm,
    marginTop: -2,
  },
  appleLabel: {
    fontSize: FontSize.subheading,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    letterSpacing: 0.2,
  },
  appleUnavailableNote: {
    fontSize: FontSize.caption,
    color: Colors.textTertiary,
    textAlign: 'center',
    lineHeight: FontSize.caption * 1.5,
  },
  appleErrorText: {
    fontSize: FontSize.caption,
    color: Colors.error,
    textAlign: 'center',
    lineHeight: FontSize.caption * 1.5,
  },

  // Existing account link
  signInLink: {
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signInText: {
    fontSize: FontSize.body,
    color: Colors.textSecondary,
  },
  signInTextBrand: {
    color: Colors.textBrand,
    fontWeight: FontWeight.semibold,
  },

  // Footer
  footnote: {
    fontSize: FontSize.caption,
    color: Colors.textTertiary,
    textAlign: 'center',
  },
});

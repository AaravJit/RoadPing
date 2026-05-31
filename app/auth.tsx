/**
 * app/auth.tsx — Sign-in / Sign-up screen.
 *
 * Accepts `?mode=signin` or `?mode=signup` (default: signin).
 * The user can toggle between modes with the tab switcher at the top.
 *
 * After successful auth:
 *   - Sign-in → router.replace('/') — route gate in index.tsx handles next redirect
 *   - Sign-up + email confirmation required → shows "Check your email" UI
 *   - Sign-up + no email confirmation → router.replace('/') (session is live)
 */
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppInput } from '@/components/AppInput';
import { AppButton } from '@/components/AppButton';
import { Colors } from '@/theme/colors';
import { FontSize, FontWeight, TextStyles } from '@/theme/typography';
import { Radius, Spacing } from '@/theme/spacing';
import { signInWithPassword, signUp, friendlyAuthError } from '@/services/auth';

type Mode = 'signin' | 'signup';

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AuthScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();

  // Derive initial mode from query param; fall back to sign-in.
  const [mode, setMode] = useState<Mode>(
    params.mode === 'signup' ? 'signup' : 'signin',
  );

  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailConfirmSent, setEmailConfirmSent] = useState(false);

  // ── Mode toggle ──────────────────────────────────────────────────────────
  function switchMode(next: Mode) {
    if (next === mode) return;
    setMode(next);
    setError(null);
    setEmailConfirmSent(false);
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    setError(null);

    // Client-side validation
    if (email.trim().length === 0) {
      setError('Please enter your email address.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'signin') {
        await signInWithPassword(email, password);
        // onAuthStateChange fires → AuthProvider updates → index.tsx redirects.
        router.replace('/');
      } else {
        const result = await signUp(email, password);
        if (result.needsEmailConfirmation) {
          setEmailConfirmSent(true);
        } else {
          // Confirmation disabled — session is live, proceed normally.
          router.replace('/');
        }
      }
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  // ── Email confirmation sent ───────────────────────────────────────────────
  if (emailConfirmSent) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.confirmContainer}>
          <Text style={styles.confirmIcon}>📧</Text>

          <Text style={styles.confirmTitle}>Check your email</Text>

          <Text style={styles.confirmBody}>
            We sent a confirmation link to{'\n'}
            <Text style={styles.confirmEmail}>{email}</Text>
            {'\n\n'}
            Tap the link to activate your account, then come back and sign in.
          </Text>

          <AppButton
            label="Back to Sign In"
            variant="primary"
            size="lg"
            fullWidth
            onPress={() => {
              setEmailConfirmSent(false);
              setMode('signin');
              setPassword('');
              setConfirmPassword('');
              setError(null);
            }}
          />
        </View>
      </SafeAreaView>
    );
  }

  // ── Main form ─────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Back ───────────────────────────────────────────────────────── */}
          <Pressable
            onPress={() => {
              router.back();
            }}
            style={styles.backButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <Text style={styles.backText}>← Back</Text>
          </Pressable>

          {/* ── Header ─────────────────────────────────────────────────────── */}
          <View style={styles.header}>
            <Text style={styles.title}>
              {mode === 'signin' ? 'Welcome back' : 'Create account'}
            </Text>
            <Text style={styles.subtitle}>
              {mode === 'signin'
                ? 'Sign in to your RoadPing account.'
                : 'Join RoadPing — it only takes a minute.'}
            </Text>
          </View>

          {/* ── Mode tabs ──────────────────────────────────────────────────── */}
          <View style={styles.tabs} accessibilityRole="tablist">
            <Pressable
              style={[styles.tab, mode === 'signin' && styles.tabActive]}
              onPress={() => switchMode('signin')}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === 'signin' }}
              accessibilityLabel="Sign In tab"
            >
              <Text
                style={[styles.tabLabel, mode === 'signin' && styles.tabLabelActive]}
              >
                Sign In
              </Text>
            </Pressable>

            <Pressable
              style={[styles.tab, mode === 'signup' && styles.tabActive]}
              onPress={() => switchMode('signup')}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === 'signup' }}
              accessibilityLabel="Create Account tab"
            >
              <Text
                style={[styles.tabLabel, mode === 'signup' && styles.tabLabelActive]}
              >
                Create Account
              </Text>
            </Pressable>
          </View>

          {/* ── Form fields ────────────────────────────────────────────────── */}
          <View style={styles.form}>
            <AppInput
              label="Email"
              placeholder="you@example.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
            />

            <AppInput
              label="Password"
              placeholder={
                mode === 'signin' ? 'Your password' : 'At least 6 characters'
              }
              value={password}
              onChangeText={setPassword}
              secure
              textContentType={mode === 'signin' ? 'password' : 'newPassword'}
              returnKeyType={mode === 'signup' ? 'next' : 'go'}
              onSubmitEditing={mode === 'signin' ? handleSubmit : undefined}
            />

            {mode === 'signup' && (
              <AppInput
                label="Confirm Password"
                placeholder="Repeat your password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secure
                textContentType="newPassword"
                returnKeyType="go"
                onSubmitEditing={handleSubmit}
              />
            )}

            {/* Error banner */}
            {error !== null && (
              <View style={styles.errorBanner} accessibilityRole="alert">
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <AppButton
              label={mode === 'signin' ? 'Sign In' : 'Create Account'}
              variant="primary"
              size="lg"
              fullWidth
              loading={loading}
              onPress={handleSubmit}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  kav: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xxl,
    gap: Spacing.xl,
    flexGrow: 1,
  },

  // ── Back button ───────────────────────────────────────────────────────────
  backButton: {
    alignSelf: 'flex-start',
  },
  backText: {
    fontSize: FontSize.body,
    fontWeight: FontWeight.medium,
    color: Colors.textBrand,
  },

  // ── Header ───────────────────────────────────────────────────────────────
  header: {
    gap: Spacing.sm,
  },
  title: {
    ...TextStyles.headingLarge,
    color: Colors.textPrimary,
  },
  subtitle: {
    ...TextStyles.body,
    color: Colors.textSecondary,
  },

  // ── Mode tabs ─────────────────────────────────────────────────────────────
  tabs: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.xs,
    gap: Spacing.xs,
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing.md12,
    borderRadius: Radius.xs,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.borderFocused,
  },
  tabLabel: {
    fontSize: FontSize.body,
    fontWeight: FontWeight.medium,
    color: Colors.textTertiary,
  },
  tabLabelActive: {
    color: Colors.textPrimary,
  },

  // ── Form ─────────────────────────────────────────────────────────────────
  form: {
    gap: Spacing.md,
  },
  errorBanner: {
    backgroundColor: Colors.errorMuted,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.error,
    padding: Spacing.md,
  },
  errorText: {
    fontSize: FontSize.bodySmall,
    color: Colors.error,
    textAlign: 'center',
  },

  // ── Email confirmation ────────────────────────────────────────────────────
  confirmContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.xl,
  },
  confirmIcon: {
    fontSize: 72,
  },
  confirmTitle: {
    ...TextStyles.headingLarge,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  confirmBody: {
    ...TextStyles.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: FontSize.body * 1.6,
  },
  confirmEmail: {
    color: Colors.textBrand,
    fontWeight: FontWeight.semibold,
  },
});

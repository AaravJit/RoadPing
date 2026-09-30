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
import { View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { RoadPingLogo } from '@/components/RoadPingLogo';
import {
  AppText,
  Button,
  Notice,
  Screen,
  ScreenScroll,
  SegmentedControl,
  TextField,
} from '@/components/ui';
import { makeStyles } from '@/theme/ThemeProvider';
import { SCREEN_INSET, Spacing } from '@/theme/spacing';
import {
  signInWithPassword,
  signUp,
  resendVerificationEmail,
  friendlyAuthError,
} from '@/services/auth';

type Mode = 'signin' | 'signup';

// ─── Screen ───────────────────────────────────────────────────────────────────

const MODE_SEGMENTS = [
  { value: 'signin' as const, label: 'Sign In' },
  { value: 'signup' as const, label: 'Create Account' },
];

export default function AuthScreen() {
  const router = useRouter();
  const styles = useStyles();
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
  const [resending, setResending] = useState(false);
  const [resendNote, setResendNote] = useState<string | null>(null);

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

  // ── Resend confirmation email ──────────────────────────────────────────────
  async function handleResend() {
    setResendNote(null);
    setResending(true);
    try {
      await resendVerificationEmail(email);
      setResendNote('Sent — check your inbox again.');
    } catch (err) {
      setResendNote(friendlyAuthError(err));
    } finally {
      setResending(false);
    }
  }

  // ── Email confirmation sent ───────────────────────────────────────────────
  if (emailConfirmSent) {
    return (
      <Screen edges={['bottom']}>
        <Stack.Screen options={{ title: '' }} />
        <View style={styles.confirm}>
          <RoadPingLogo size={72} />
          <AppText variant="title1" weight="bold" align="center" accessibilityRole="header">
            Check your email
          </AppText>
          <AppText variant="body" color="secondary" align="center">
            We sent a verification link to{'\n'}
            <AppText variant="body" weight="semibold">
              {email}
            </AppText>
          </AppText>
          <AppText variant="footnote" color="secondary" align="center">
            Open it on this iPhone and you&apos;ll come straight back into RoadPing, already signed in.
          </AppText>

          {resendNote !== null && (
            <AppText variant="footnote" color="secondary" align="center" accessibilityLiveRegion="polite">
              {resendNote}
            </AppText>
          )}

          <View style={styles.confirmActions}>
            <Button
              label="Resend Email"
              variant="secondary"
              size="lg"
              fullWidth
              loading={resending}
              onPress={() => void handleResend()}
            />
            <Button
              label="Back to Sign In"
              variant="plain"
              fullWidth
              onPress={() => {
                setEmailConfirmSent(false);
                setResendNote(null);
                setMode('signin');
                setPassword('');
                setConfirmPassword('');
                setError(null);
              }}
            />
          </View>
        </View>
      </Screen>
    );
  }

  // ── Main form ─────────────────────────────────────────────────────────────
  return (
    <ScreenScroll contentStyle={styles.content}>
      <Stack.Screen options={{ title: mode === 'signin' ? 'Sign In' : 'Create Account' }} />

      <AppText variant="body" color="secondary">
        {mode === 'signin'
          ? 'Welcome back. Sign in with your email.'
          : 'It only takes a minute. You choose your name and vehicle next.'}
      </AppText>

      <SegmentedControl<Mode>
        segments={MODE_SEGMENTS}
        value={mode}
        onChange={switchMode}
        accessibilityLabel="Sign in or create account"
      />

      <View style={styles.fields}>
        <TextField
          label="Email"
          placeholder="you@example.com"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
        />
        <TextField
          label="Password"
          placeholder={mode === 'signin' ? 'Your password' : 'At least 6 characters'}
          value={password}
          onChangeText={setPassword}
          secure
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          textContentType={mode === 'signin' ? 'password' : 'newPassword'}
          returnKeyType={mode === 'signup' ? 'next' : 'go'}
          onSubmitEditing={mode === 'signin' ? () => void handleSubmit() : undefined}
        />
        {mode === 'signup' && (
          <TextField
            label="Confirm password"
            placeholder="Repeat your password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secure
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="go"
            onSubmitEditing={() => void handleSubmit()}
          />
        )}
      </View>

      {error !== null && <Notice tone="danger" message={error} />}

      <Button
        label={mode === 'signin' ? 'Sign In' : 'Create Account'}
        size="lg"
        fullWidth
        loading={loading}
        onPress={() => void handleSubmit()}
      />
    </ScreenScroll>
  );
}

const useStyles = makeStyles(() => ({
  content: {
    paddingHorizontal: SCREEN_INSET,
    gap: Spacing.lg,
  },
  fields: {
    gap: Spacing.md,
  },
  confirm: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md12,
  },
  confirmActions: {
    alignSelf: 'stretch',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
}));

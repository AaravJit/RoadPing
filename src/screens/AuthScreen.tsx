import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { signInWithEmail, signUpWithEmail } from '@/services';
import { Screen, Title, Subtitle, Field, Button, Notice } from '@/components/ui';
import { colors } from '@/theme';

// On success, AuthProvider's onAuthStateChange fires and RootNavigator swaps
// to the main flow — this screen does not navigate itself.
export function AuthScreen() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === 'signin') {
        await signInWithEmail(email.trim(), password);
      } else {
        const session = await signUpWithEmail(email.trim(), password);
        if (!session) {
          setInfo('Check your email to confirm your account, then sign in.');
          setMode('signin');
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <View style={{ marginTop: 40 }}>
        <Title>RoadPing</Title>
        <Subtitle>
          {mode === 'signin'
            ? 'Sign in to go live and find drivers nearby.'
            : 'Create an account. You stay hidden until you press Start.'}
        </Subtitle>
      </View>

      {error && <Notice text={error} />}
      {info && <Notice text={info} tone="info" />}

      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        placeholder="you@example.com"
      />
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password"
        placeholder="••••••••"
      />

      <Button
        title={mode === 'signin' ? 'Sign in' : 'Create account'}
        onPress={submit}
        loading={busy}
        disabled={!email.trim() || password.length < 6}
      />

      <Pressable onPress={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); }} style={{ marginTop: 18 }}>
        <Text style={{ color: colors.accent, textAlign: 'center', fontSize: 14 }}>
          {mode === 'signin' ? "New here? Create an account" : 'Already have an account? Sign in'}
        </Text>
      </Pressable>
    </Screen>
  );
}

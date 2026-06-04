/**
 * Root layout — wraps every screen in RoadPing.
 *
 * Responsibilities:
 *  1. Validate environment variables before anything renders.
 *  2. Provide AuthProvider so every screen can access the current session.
 *  3. Set global status bar style (dark theme → light content).
 *  4. Provide SafeAreaProvider for the whole tree.
 *  5. Export the Expo Router Stack.
 */
import 'react-native-url-polyfill/auto'; // Must be before any Supabase import
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { envErrorMessage, isEnvConfigured, DISABLE_AGORA } from '@/services/env';
import { AuthProvider } from '@/hooks/useAuth';
import { EntitlementProvider } from '@/hooks/useEntitlement';
import { UnitsProvider } from '@/hooks/useUnits';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { Colors } from '@/theme/colors';
import { FontSize, FontWeight } from '@/theme/typography';
import { Spacing } from '@/theme/spacing';

// Minimal, secret-free startup breadcrumbs. Visible in Xcode device logs /
// Console.app even on a release TestFlight build (where Metro is not attached).
console.log('[RoadPing] app startup');

/** Minimal error screen shown if env vars are missing. Not the main ErrorState component
 *  because we can't risk importing anything that touches the Supabase client. */
function EnvErrorScreen({ message }: { message: string }) {
  return (
    <View style={errorStyles.container}>
      <Text style={errorStyles.title}>⚠️ Configuration Error</Text>
      <Text style={errorStyles.message}>{message}</Text>
    </View>
  );
}

const errorStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  title: {
    fontSize: FontSize.heading,
    fontWeight: FontWeight.bold,
    color: Colors.error,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  message: {
    fontSize: FontSize.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: FontSize.body * 1.6,
    fontFamily: 'monospace',
  },
});

export default function RootLayout() {
  // Computed synchronously (never throws) so a misconfigured build renders a
  // readable screen on first frame instead of crashing the JS bundle.
  const configured = isEnvConfigured();

  useEffect(() => {
    console.log('[RoadPing] root layout mounted');
    console.log(`[RoadPing] env checked — supabase config ${configured ? 'ok' : 'MISSING'}`);
    console.log(
      `[RoadPing] Agora native require is lazy; DISABLE_AGORA=${DISABLE_AGORA}`,
    );
  }, [configured]);

  if (!configured) {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
          <EnvErrorScreen message={envErrorMessage() ?? 'Missing configuration.'} />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  // AuthProvider touches the Supabase client — only mount it once we know the
  // env is present, so the lazy client is never constructed unconfigured.
  return (
    <ThemeProvider>
      <AuthProvider>
        <EntitlementProvider>
          <UnitsProvider>
          <SafeAreaProvider>
            <StatusBar style="light" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: Colors.background },
                animation: 'fade',
              }}
            />
          </SafeAreaProvider>
          </UnitsProvider>
        </EntitlementProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

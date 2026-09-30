/**
 * Root layout — wraps every screen in RoadPing.
 *
 * Responsibilities:
 *  1. Validate environment variables before anything renders.
 *  2. Provide AuthProvider so every screen can access the current session.
 *  3. ThemeProvider outermost, so every screen (and the status bar) follows
 *     the resolved appearance. Rendering waits for saved appearance prefs so
 *     there is no flash of the wrong appearance.
 *  4. Provide SafeAreaProvider for the whole tree.
 *  5. Export the Expo Router Stack with native iOS navigation bars for
 *     pushed screens; full-bleed screens (Drive, onboarding) hide the bar.
 */
import 'react-native-url-polyfill/auto'; // Must be before any Supabase import
import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { envErrorMessage, isEnvConfigured, DISABLE_AGORA } from '@/services/env';
import { AuthProvider } from '@/hooks/useAuth';
import { EntitlementProvider } from '@/hooks/useEntitlement';
import { UnitsProvider } from '@/hooks/useUnits';
import { ErrorState } from '@/components/ErrorState';
import { Screen } from '@/components/ui';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

// Minimal, secret-free startup breadcrumbs. Visible in Xcode device logs /
// Console.app even on a release TestFlight build (where Metro is not attached).
console.log('[RoadPing] app startup');

/** Shown if env vars are missing. Uses only UI components, never Supabase. */
function EnvErrorScreen({ message }: { message: string }) {
  return (
    <Screen>
      <ErrorState title="Configuration error" message={message} />
    </Screen>
  );
}

/** Screens that are pushed on top of Drive / Settings get a native nav bar. */
const PUSHED_SCREENS: Record<string, string> = {
  settings: 'Settings',
  profile: 'Profile',
  vehicle: 'Vehicles',
  rooms: 'Rooms',
  'room/[roomId]': 'Room',
  'private-zones': 'Private Zones',
  'blocked-users': 'Blocked Drivers',
  privacy: 'Privacy Policy',
  safety: 'Safety & Community',
  'delete-account': 'Delete Account',
  auth: 'Sign In',
};

function AppStack() {
  const { colors, accent, hydrated } = useTheme();
  // Wait for saved appearance/accent so the first frame is already right.
  if (!hydrated) return null;
  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: accent.text,
          headerTitleStyle: { color: colors.textPrimary },
          headerLargeTitleStyle: { color: colors.textPrimary },
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
        }}
      >
        <Stack.Screen name="drive" options={{ animation: 'fade' }} />
        {Object.entries(PUSHED_SCREENS).map(([name, title]) => (
          <Stack.Screen
            key={name}
            name={name}
            options={{
              headerShown: true,
              title,
              headerLargeTitle: name === 'settings',
            }}
          />
        ))}
      </Stack>
    </>
  );
}

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
      <ThemeProvider>
        <SafeAreaProvider>
          <StatusBar style="auto" />
          <EnvErrorScreen message={envErrorMessage() ?? 'Missing configuration.'} />
        </SafeAreaProvider>
      </ThemeProvider>
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
              <AppStack />
            </SafeAreaProvider>
          </UnitsProvider>
        </EntitlementProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

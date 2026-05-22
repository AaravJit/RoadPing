import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuth } from '@/state/AuthContext';
import { LiveSessionProvider, useLiveSession } from '@/state/LiveSessionContext';
import { NavigationProvider, useNavigation, Route } from '@/state/NavigationContext';
import { getMyProfile, listVehicles } from '@/services';
import { colors } from '@/theme';

import { AuthScreen } from '@/screens/AuthScreen';
import { ProfileSetupScreen } from '@/screens/ProfileSetupScreen';
import { VehicleSetupScreen } from '@/screens/VehicleSetupScreen';
import { PrivateZonesScreen } from '@/screens/PrivateZonesScreen';
import { AddZoneScreen } from '@/screens/AddZoneScreen';
import { HiddenScreen } from '@/screens/HiddenScreen';
import { LiveMapScreen } from '@/screens/LiveMapScreen';

function Splash() {
  return (
    <View style={styles.splash}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

// Decides where a signed-in user lands: finish onboarding, or go to Hidden.
function decideInitialRoute(hasName: boolean, hasVehicle: boolean): Route {
  if (!hasName) return 'profile';
  if (!hasVehicle) return 'vehicle';
  return 'hidden';
}

function FlowScreens() {
  const { route } = useNavigation();
  const { status } = useLiveSession();

  // While live (or tearing down), the live map owns the screen regardless of route.
  if (status === 'live' || status === 'stopping') return <LiveMapScreen />;

  switch (route) {
    case 'profile': return <ProfileSetupScreen />;
    case 'vehicle': return <VehicleSetupScreen />;
    case 'zones': return <PrivateZonesScreen />;
    case 'addZone': return <AddZoneScreen />;
    case 'hidden': return <HiddenScreen />;
    default: return <HiddenScreen />;
  }
}

function MainFlow() {
  const [initialRoute, setInitialRoute] = useState<Route | null>(null);

  useEffect(() => {
    let mounted = true;
    Promise.all([getMyProfile(), listVehicles()])
      .then(([profile, vehicles]) => {
        if (mounted) {
          setInitialRoute(decideInitialRoute(!!profile.display_name, vehicles.length > 0));
        }
      })
      .catch(() => { if (mounted) setInitialRoute('profile'); });
    return () => { mounted = false; };
  }, []);

  if (!initialRoute) return <Splash />;

  return (
    <LiveSessionProvider>
      <NavigationProvider initialRoute={initialRoute}>
        <FlowScreens />
      </NavigationProvider>
    </LiveSessionProvider>
  );
}

export function RootNavigator() {
  const { loading, session } = useAuth();
  if (loading) return <Splash />;
  if (!session) return <AuthScreen />;
  return <MainFlow />;
}

const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
});

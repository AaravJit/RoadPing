/**
 * app/settings.tsx — Settings, grouped the iOS way:
 * Account · Appearance · Drive · Voice · Privacy & Safety · Units · About.
 *
 * Sign out stops the live session server-side before clearing the local auth
 * session, so the user's presence disappears from nearby maps immediately.
 */
import React, { useEffect, useState } from 'react';
import { Alert, Linking, View } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';

import { AccentPicker, AppearancePicker } from '@/components/AppearanceSettings';
import { LoadingState } from '@/components/LoadingState';
import { RangeSelector } from '@/components/RangeSelector';
import {
  Avatar,
  ListRow,
  ListSection,
  ListSwitchRow,
  ScreenScroll,
  SegmentedControl,
} from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useUnits } from '@/hooks/useUnits';
import { useVehicles } from '@/hooks/useVehicles';
import { stopLiveSession } from '@/services/liveSession';
import { updateProfile } from '@/services/profile';
import { DEFAULT_RANGE_M, type UnitSystem } from '@/services/units';
import { makeStyles } from '@/theme/ThemeProvider';
import { Spacing } from '@/theme/spacing';

const APP_VERSION: string =
  (Constants.expoConfig?.version as string | undefined) ?? '1.0.0';

const SUPPORT_EMAIL = 'support@roadping.app';

const UNIT_SEGMENTS = [
  { value: 'imperial' as const, label: 'Miles', accessibilityLabel: 'Miles and feet' },
  { value: 'metric' as const, label: 'Kilometers', accessibilityLabel: 'Kilometers and meters' },
];

export default function SettingsScreen() {
  const router = useRouter();
  const styles = useStyles();
  const { system, setSystem } = useUnits();
  const { user, signOut } = useAuth();
  const { profile, isLoading: profileLoading, refresh: refreshProfile } =
    useProfile(user?.id ?? null);
  const { primary: primaryVehicle } = useVehicles(user?.id ?? null);

  const [dndMode, setDndMode] = useState(false);
  const [rangeM, setRangeM] = useState(DEFAULT_RANGE_M);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (profile !== null) {
      setDndMode(profile.dnd_mode);
      setRangeM(profile.default_range_m);
    }
  }, [profile]);

  if (profileLoading && profile === null) {
    return <LoadingState message="Loading…" />;
  }

  async function handleToggleDnd(value: boolean) {
    if (user === null) return;
    setDndMode(value);
    setSaving(true);
    try {
      await updateProfile(user.id, { dnd_mode: value });
      await refreshProfile();
    } catch {
      setDndMode(!value);
      Alert.alert("Couldn't update Do Not Disturb", 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRangeChange(value: number) {
    if (user === null) return;
    setRangeM(value);
    setSaving(true);
    try {
      await updateProfile(user.id, { default_range_m: value });
      await refreshProfile();
    } catch {
      setRangeM(profile?.default_range_m ?? DEFAULT_RANGE_M);
      Alert.alert("Couldn't update range", 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function handleSignOut() {
    Alert.alert('Sign out of RoadPing?', 'If you are live, your session ends first.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setSigningOut(true);
            try {
              // Best-effort: end server session before clearing local auth.
              await stopLiveSession();
            } catch {
              // Session may already be ended — proceed regardless.
            }
            try {
              await signOut();
              router.replace('/onboarding');
            } catch {
              Alert.alert("Couldn't sign out", 'Please try again.');
              setSigningOut(false);
            }
          })();
        },
      },
    ]);
  }

  const name = profile?.display_name ?? profile?.handle ?? 'Your profile';
  const handle = profile?.handle != null ? `@${profile.handle}` : undefined;

  return (
    <ScreenScroll>
      <ListSection header="Account">
        <ListRow
          title={name}
          subtitle={handle ?? 'Name, photo and handle'}
          leading={<Avatar name={name} uri={profile?.avatar_url ?? null} size={44} self />}
          onPress={() => router.push('/profile')}
          accessibilityLabel={`${name}${handle !== undefined ? `, ${handle}` : ''}. Edit profile`}
        />
        <ListRow
          title={signingOut ? 'Signing Out…' : 'Sign Out'}
          onPress={handleSignOut}
          disabled={signingOut}
          destructive
        />
      </ListSection>

      <ListSection
        header="Appearance"
        footer="Accent colors change buttons and highlights. Live, warning and delete colors always stay the same."
      >
        <View style={styles.block}>
          <AppearancePicker />
        </View>
        <View style={styles.block}>
          <AccentPicker />
        </View>
      </ListSection>

      <ListSection
        header="Drive"
        footer="RoadPing only shares your location while you're live with the app open. Leaving the app ends your live session."
      >
        <View style={styles.block}>
          <RangeSelector
            label="Default range"
            value={rangeM}
            onChange={(v) => void handleRangeChange(v)}
            disabled={saving}
          />
        </View>
        <ListRow
          icon="car.fill"
          iconTone="accent"
          title="Vehicles"
          value={primaryVehicle?.label ?? 'None'}
          onPress={() => router.push('/vehicle')}
        />
      </ListSection>

      <ListSection
        header="Voice"
        footer="Talking is hold-to-talk only. RoadPing doesn't record your conversations."
      >
        <ListSwitchRow
          icon="moon.fill"
          iconTone="neutral"
          title="Do Not Disturb"
          subtitle="Hide your talking status from nearby drivers"
          value={dndMode}
          onValueChange={(v) => void handleToggleDnd(v)}
          disabled={saving}
        />
        <ListRow
          icon="mic.fill"
          iconTone="neutral"
          title="Microphone Access"
          value="Settings"
          onPress={() => void Linking.openSettings()}
          accessibilityHint="Opens iPhone Settings for RoadPing"
        />
        <ListRow
          icon="person.3.fill"
          iconTone="neutral"
          title="Rooms"
          onPress={() => router.push('/rooms')}
        />
      </ListSection>

      <ListSection header="Privacy & Safety">
        <ListRow
          icon="mappin.circle.fill"
          iconTone="neutral"
          title="Private Zones"
          onPress={() => router.push('/private-zones')}
        />
        <ListRow
          icon="nosign"
          iconTone="neutral"
          title="Blocked Drivers"
          onPress={() => router.push('/blocked-users')}
        />
        <ListRow
          icon="shield.lefthalf.filled"
          iconTone="neutral"
          title="Safety & Community"
          onPress={() => router.push('/safety')}
        />
        <ListRow
          icon="lock.fill"
          iconTone="neutral"
          title="Privacy Policy"
          onPress={() => router.push('/privacy')}
        />
      </ListSection>

      <ListSection header="Units">
        <View style={styles.block}>
          <SegmentedControl<UnitSystem>
            segments={UNIT_SEGMENTS}
            value={system}
            onChange={setSystem}
            accessibilityLabel="Distance units"
          />
        </View>
      </ListSection>

      <ListSection header="About">
        <ListRow title="Version" value={APP_VERSION} />
        <ListRow
          icon="envelope.fill"
          iconTone="neutral"
          title="Contact Support"
          value={SUPPORT_EMAIL}
          onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
        />
      </ListSection>

      <ListSection footer="You'll see exactly what is removed before anything is deleted.">
        <ListRow
          title="Delete Account"
          onPress={() => router.push('/delete-account')}
          destructive
        />
      </ListSection>
    </ScreenScroll>
  );
}

const useStyles = makeStyles(() => ({
  block: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md12,
  },
}));

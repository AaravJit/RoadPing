import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useProfile } from '@/hooks/useProfile';
import { useNavigation } from '@/state/NavigationContext';
import { Screen, Title, Subtitle, Field, Button, Notice } from '@/components/ui';

export function ProfileSetupScreen() {
  const { profile, loading, save, changeHandle } = useProfile();
  const { navigate } = useNavigation();

  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setHandle(profile.handle);
      setDisplayName(profile.display_name ?? '');
    }
  }, [profile]);

  const onContinue = async () => {
    setBusy(true);
    setError(null);
    try {
      // Only change the handle if the user edited it (handles are unique).
      if (profile && handle.trim().toLowerCase() !== profile.handle) {
        await changeHandle(handle.trim().toLowerCase());
      }
      await save({ display_name: displayName.trim() || null });
      navigate('vehicle');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your profile.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <View style={{ marginTop: 24 }}>
        <Title>Your driver profile</Title>
        <Subtitle>This is what nearby drivers see when you are live. Keep it anonymous if you like.</Subtitle>
      </View>

      {error && <Notice text={error} />}

      <Field
        label="Handle"
        value={handle}
        onChangeText={(t) => setHandle(t.toLowerCase())}
        autoCapitalize="none"
        placeholder="fortyfive_drift"
      />
      <Field
        label="Display name (optional)"
        value={displayName}
        onChangeText={setDisplayName}
        placeholder="Shown alongside your handle"
      />

      <Button
        title="Continue"
        onPress={onContinue}
        loading={busy || loading}
        disabled={handle.trim().length < 3}
      />
    </Screen>
  );
}

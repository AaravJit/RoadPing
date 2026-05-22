import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useZones } from '@/hooks/useZones';
import { useNavigation } from '@/state/NavigationContext';
import { Screen, Title, Subtitle, Field, Button, Notice, Label } from '@/components/ui';
import { colors, radius } from '@/theme';
import { getCurrentFix, LocationError } from '@/lib/location';
import type { ZoneKind } from '@/services';

const RADII = [300, 500, 700];
const KINDS: ZoneKind[] = ['home', 'work', 'custom'];

// The zone is centred on the user's CURRENT location (a privacy choice: you set
// a zone by standing where you want to stay hidden). A full map picker can
// replace this later; the wiring to the service is the same.
export function AddZoneScreen() {
  const { create } = useZones();
  const { navigate } = useNavigation();

  const [name, setName] = useState('');
  const [radiusM, setRadiusM] = useState(500);
  const [kind, setKind] = useState<ZoneKind>('home');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const fix = await getCurrentFix();
      await create({ name: name.trim(), lat: fix.lat, lng: fix.lng, radius_m: radiusM, kind });
      navigate('zones');
    } catch (e) {
      const msg = e instanceof LocationError
        ? e.message
        : e instanceof Error ? e.message : 'Could not save zone.';
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <View style={{ marginTop: 24 }}>
        <Title>Add Private Zone</Title>
        <Subtitle>Centred on where you are now. RoadPing will block Start when you are this close.</Subtitle>
      </View>

      {error && <Notice text={error} />}

      <Field label="Zone name" value={name} onChangeText={setName} placeholder="Home · Studio · Storage" />

      <Label>Kind</Label>
      <View style={st.row}>
        {KINDS.map((k) => (
          <Pressable key={k} onPress={() => setKind(k)} style={[st.chip, kind === k && st.chipActive]}>
            <Text style={[st.chipText, kind === k && st.chipTextActive]}>{k}</Text>
          </Pressable>
        ))}
      </View>

      <Label>Radius</Label>
      <View style={st.row}>
        {RADII.map((r) => (
          <Pressable key={r} onPress={() => setRadiusM(r)} style={[st.chip, radiusM === r && st.chipActive]}>
            <Text style={[st.chipText, radiusM === r && st.chipTextActive]}>{r}m</Text>
          </Pressable>
        ))}
      </View>

      <Button title="Save Private Zone" onPress={save} loading={busy} disabled={!name.trim()} />
      <Button title="Cancel" onPress={() => navigate('zones')} variant="ghost" />
    </Screen>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  chip: {
    flex: 1, paddingVertical: 12, borderRadius: radius.sm, alignItems: 'center',
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
  },
  chipActive: { backgroundColor: colors.accentDim, borderColor: colors.accentBorder },
  chipText: { color: colors.text, fontSize: 14 },
  chipTextActive: { color: colors.accent },
});

import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useVehicles } from '@/hooks/useVehicles';
import { useNavigation } from '@/state/NavigationContext';
import { Screen, Title, Subtitle, Field, Button, Notice, Card, Label } from '@/components/ui';
import { colors, radius } from '@/theme';
import type { VehicleBodyType } from '@/services';

const BODY_TYPES: VehicleBodyType[] = [
  'sedan', 'coupe', 'hatchback', 'suv', 'pickup', 'sportsCar', 'motorcycle',
];

export function VehicleSetupScreen() {
  const { vehicles, primary, loading, create, choosePrimary } = useVehicles();
  const { navigate } = useNavigation();

  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [body, setBody] = useState<VehicleBodyType>('sedan');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addVehicle = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await create({
        make: make.trim(),
        model: model.trim(),
        body_type: body,
      });
      // First vehicle becomes primary so Start has a vehicle to attach.
      if (vehicles.length === 0) await choosePrimary(created.id);
      setMake('');
      setModel('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add vehicle.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <View style={{ marginTop: 24 }}>
        <Title>Your vehicle</Title>
        <Subtitle>Add the car you drive. It shows on your card when you are live.</Subtitle>
      </View>

      {error && <Notice text={error} />}

      {vehicles.map((v) => (
        <Pressable key={v.id} onPress={() => choosePrimary(v.id)}>
          <Card style={v.id === primary?.id ? st.cardActive : undefined}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={st.vehicleName}>{v.make} {v.model}</Text>
              {v.id === primary?.id && <Text style={st.primaryTag}>PRIMARY</Text>}
            </View>
            <Text style={st.vehicleMeta}>{v.body_type}</Text>
          </Card>
        </Pressable>
      ))}

      <Card>
        <Label>Add a vehicle</Label>
        <Field label="Make" value={make} onChangeText={setMake} placeholder="Toyota" />
        <Field label="Model" value={model} onChangeText={setModel} placeholder="GR Corolla" />

        <Label>Body type</Label>
        <View style={st.chips}>
          {BODY_TYPES.map((bt) => (
            <Pressable key={bt} onPress={() => setBody(bt)} style={[st.chip, body === bt && st.chipActive]}>
              <Text style={[st.chipText, body === bt && st.chipTextActive]}>{bt}</Text>
            </Pressable>
          ))}
        </View>

        <Button
          title="Add vehicle"
          onPress={addVehicle}
          loading={busy}
          disabled={!make.trim() || !model.trim()}
          variant="ghost"
        />
      </Card>

      <Button
        title="Continue"
        onPress={() => navigate('zones')}
        loading={loading}
        disabled={vehicles.length === 0}
      />
    </Screen>
  );
}

const st = StyleSheet.create({
  cardActive: { borderColor: colors.accentBorder, backgroundColor: colors.accentDim },
  vehicleName: { color: colors.text, fontSize: 16, fontWeight: '600' },
  vehicleMeta: { color: colors.textDim, fontSize: 13, marginTop: 4 },
  primaryTag: { color: colors.accent, fontSize: 11, letterSpacing: 1, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.sm,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line,
  },
  chipActive: { backgroundColor: colors.accentDim, borderColor: colors.accentBorder },
  chipText: { color: colors.text, fontSize: 13 },
  chipTextActive: { color: colors.accent },
});

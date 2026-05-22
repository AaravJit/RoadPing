import React from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useZones } from '@/hooks/useZones';
import { useNavigation } from '@/state/NavigationContext';
import { Screen, Title, Subtitle, Button, Notice, Card } from '@/components/ui';
import { colors } from '@/theme';

export function PrivateZonesScreen() {
  const { zones, loading, error, remove } = useZones();
  const { navigate } = useNavigation();

  return (
    <Screen scroll>
      <View style={{ marginTop: 24 }}>
        <Title>Private Zones</Title>
        <Subtitle>
          RoadPing blocks Start when you are too close to one of these. They are never shown to other users.
        </Subtitle>
      </View>

      {error && <Notice text={error} />}

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 20 }} />
      ) : zones.length === 0 ? (
        <Card>
          <Text style={st.empty}>No Private Zones yet. Add home, work, or anywhere you want to stay hidden.</Text>
        </Card>
      ) : (
        zones.map((z) => (
          <Card key={z.id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={st.name}>{z.name}</Text>
                <Text style={st.meta}>{z.kind} · {z.radius_m}m radius</Text>
              </View>
              <Pressable onPress={() => remove(z.id)} hitSlop={10}>
                <Text style={st.remove}>Remove</Text>
              </Pressable>
            </View>
          </Card>
        ))
      )}

      <Button title="Add Private Zone" onPress={() => navigate('addZone')} variant="ghost" />
      <Button title="Done" onPress={() => navigate('hidden')} />
    </Screen>
  );
}

const st = StyleSheet.create({
  empty: { color: colors.textDim, fontSize: 14, lineHeight: 20 },
  name: { color: colors.text, fontSize: 16, fontWeight: '600' },
  meta: { color: colors.textDim, fontSize: 13, marginTop: 4 },
  remove: { color: colors.danger, fontSize: 14, fontWeight: '500' },
});

import React, { useState } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { useLiveSession } from '@/state/LiveSessionContext';
import { colors, radius } from '@/theme';
import type { NearbyDriver } from '@/services';

// Live map slice: shows nearby drivers (polled with the moving position getter
// inside LiveSessionContext) and the Stop control. Voice is intentionally NOT
// here yet — no PTT, no audio, no recording. The footer states the rule.
export function LiveMapScreen() {
  const { status, drivers, stop } = useLiveSession();
  const [stopping, setStopping] = useState(false);

  const onStop = async () => {
    setStopping(true);
    await stop(); // heartbeat.stop() first, then stopSession() — see context
    // status flips to 'hidden' → navigator swaps back to HiddenScreen
  };

  return (
    <View style={st.root}>
      <View style={st.header}>
        <View style={st.liveBadge}>
          <View style={st.liveDot} />
          <Text style={st.liveText}>LIVE</Text>
        </View>
        <Text style={st.count}>
          {drivers.length} {drivers.length === 1 ? 'driver' : 'drivers'} nearby
        </Text>
      </View>

      {status === 'starting' ? (
        <View style={st.empty}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <FlatList<NearbyDriver>
          data={drivers}
          keyExtractor={(d) => d.user_id}
          contentContainerStyle={{ padding: 16, paddingBottom: 140 }}
          ListEmptyComponent={
            <View style={st.empty}>
              <Text style={st.emptyText}>No drivers in range yet. Hang tight — the map updates as you move.</Text>
            </View>
          }
          renderItem={({ item }) => <DriverRow driver={item} />}
        />
      )}

      <View style={st.footerWrap}>
        <Text style={st.footer}>VOICE IS LIVE ONLY · NOT RECORDED</Text>
        <Pressable onPress={stopping ? undefined : onStop} style={[st.stopBtn, stopping && { opacity: 0.5 }]}>
          {stopping || status === 'stopping'
            ? <ActivityIndicator color="#fff" />
            : <Text style={st.stopText}>Stop</Text>}
        </Pressable>
      </View>
    </View>
  );
}

function DriverRow({ driver }: { driver: NearbyDriver }) {
  const km = (driver.distance_m / 1000).toFixed(driver.distance_m < 1000 ? 2 : 1);
  const v = driver.vehicle;
  return (
    <View style={[st.row, driver.is_talking && st.rowTalking]}>
      <View style={{ flex: 1 }}>
        <Text style={st.handle}>@{driver.handle}</Text>
        {v?.make ? (
          <Text style={st.vehicle}>{v.year ? `${v.year} ` : ''}{v.make} {v.model}</Text>
        ) : (
          <Text style={st.vehicle}>Driver</Text>
        )}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={st.dist}>{km} km</Text>
        <Text style={st.state}>{driver.is_talking ? 'ON · AIR' : 'IDLE'}</Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { paddingTop: 64, paddingHorizontal: 22, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.accentDim, borderWidth: 1, borderColor: colors.accentBorder },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent },
  liveText: { color: colors.accent, fontSize: 10, letterSpacing: 2, fontWeight: '700' },
  count: { color: colors.textDim, fontSize: 13 },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: { color: colors.textDim, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, marginBottom: 10 },
  rowTalking: { borderColor: colors.accentBorder, backgroundColor: colors.accentDim },
  handle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  vehicle: { color: colors.textDim, fontSize: 13, marginTop: 3 },
  dist: { color: colors.accent, fontSize: 16, fontWeight: '600' },
  state: { color: colors.textMute, fontSize: 10, letterSpacing: 1, marginTop: 3 },
  footerWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 22, paddingBottom: 40, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.line },
  footer: { color: colors.textMute, fontSize: 10, letterSpacing: 1.5, textAlign: 'center', marginBottom: 10 },
  stopBtn: { height: 56, borderRadius: radius.md, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  stopText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});

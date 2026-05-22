import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useLiveSession } from '@/state/LiveSessionContext';
import { useNavigation } from '@/state/NavigationContext';
import { useVehicles } from '@/hooks/useVehicles';
import { Screen, Notice } from '@/components/ui';
import { colors, radius } from '@/theme';

export function HiddenScreen() {
  const { status, zonePreview, notice, refreshZonePreview, start, clearNotice } = useLiveSession();
  const { navigate } = useNavigation();
  const { primary } = useVehicles();

  const [starting, setStarting] = useState(false);

  // Refresh the "Safe to Start / Too close" preview when the screen appears.
  useEffect(() => { refreshZonePreview(); }, [refreshZonePreview]);

  const blocked = zonePreview?.blocked === true;

  const onStart = async () => {
    clearNotice();
    setStarting(true);
    await start(primary?.id ?? null); // status flips to 'live' → navigator shows LiveMap
    setStarting(false);
  };

  const busy = starting || status === 'starting';

  return (
    <Screen>
      <View style={st.headerRow}>
        <View style={st.wordmark}>
          <View style={[st.dot, { backgroundColor: blocked ? colors.danger : colors.textMute }]} />
          <Text style={st.brand}>RoadPing</Text>
        </View>
        <Pressable onPress={() => navigate('zones')} hitSlop={10}>
          <Text style={st.link}>Zones</Text>
        </Pressable>
      </View>

      {notice && <Notice text={notice} tone={blocked ? 'danger' : 'info'} />}

      <View style={[st.statePill, blocked ? st.statePillBlocked : st.statePillHidden]}>
        <Text style={[st.stateText, { color: blocked ? colors.danger : colors.textDim }]}>
          {blocked ? 'BLOCKED' : 'HIDDEN'}
        </Text>
      </View>

      <Text style={st.heading}>
        {blocked ? 'Too close to a Private Zone' : 'Hidden right now'}
      </Text>
      <Text style={st.sub}>
        {blocked
          ? 'Move farther away before going live. RoadPing blocks Start near places you protected.'
          : 'Press Start to appear on the nearby map. Your live location is visible to active drivers within range — and disappears the moment you Stop.'}
      </Text>

      <View style={st.cards}>
        <View style={st.statCard}>
          <Text style={st.statLabel}>VEHICLE</Text>
          <Text style={st.statValue}>{primary ? `${primary.make} ${primary.model}` : 'None'}</Text>
        </View>
        <View style={[st.statCard, blocked && st.statCardDanger]}>
          <Text style={[st.statLabel, blocked && { color: colors.danger }]}>PRIVATE ZONE</Text>
          <Text style={[st.statValue, { color: blocked ? colors.danger : colors.success }]}>
            {blocked ? 'Too close' : 'Safe to Start'}
          </Text>
        </View>
      </View>

      <View style={st.center}>
        <Pressable
          onPress={blocked || busy ? undefined : onStart}
          style={[st.startBtn, (blocked || busy) && st.startBtnDisabled]}
        >
          <Text style={[st.startText, (blocked || busy) && { color: colors.textMute }]}>
            {busy ? '…' : 'Start'}
          </Text>
          <Text style={st.startSub}>ROADPING</Text>
        </Pressable>
        {blocked && (
          <Pressable onPress={() => navigate('zones')} style={st.manageBtn}>
            <Text style={st.manageText}>MANAGE PRIVATE ZONES</Text>
          </Pressable>
        )}
      </View>

      <Text style={st.footer}>VOICE IS LIVE ONLY · NOT RECORDED</Text>
    </Screen>
  );
}

const st = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  wordmark: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  brand: { color: colors.text, fontSize: 17, fontWeight: '700' },
  link: { color: colors.accent, fontSize: 14 },
  statePill: {
    alignSelf: 'flex-start', marginTop: 20, paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: radius.pill, borderWidth: 1,
  },
  statePillHidden: { backgroundColor: colors.surfaceFaint, borderColor: colors.line },
  statePillBlocked: { backgroundColor: colors.dangerDim, borderColor: 'rgba(255,61,46,0.5)' },
  stateText: { fontSize: 10, letterSpacing: 2, fontWeight: '600' },
  heading: { color: colors.text, fontSize: 28, fontWeight: '600', letterSpacing: -0.5, marginTop: 14 },
  sub: { color: colors.textDim, fontSize: 14, lineHeight: 20, marginTop: 10 },
  cards: { flexDirection: 'row', gap: 10, marginTop: 18 },
  statCard: { flex: 1, padding: 14, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  statCardDanger: { backgroundColor: colors.dangerDim, borderColor: 'rgba(255,61,46,0.5)' },
  statLabel: { color: colors.textMute, fontSize: 10, letterSpacing: 1.5 },
  statValue: { color: colors.text, fontSize: 15, fontWeight: '600', marginTop: 6 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  startBtn: {
    width: 180, height: 180, borderRadius: 90, backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.accent, shadowOpacity: 0.5, shadowRadius: 30, shadowOffset: { width: 0, height: 0 },
  },
  startBtnDisabled: { backgroundColor: colors.surface2, shadowOpacity: 0 },
  startText: { color: '#fff', fontSize: 22, fontWeight: '700' },
  startSub: { color: 'rgba(255,255,255,0.85)', fontSize: 10, letterSpacing: 2, marginTop: 4 },
  manageBtn: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.pill,
    backgroundColor: colors.accentDim, borderWidth: 1, borderColor: colors.accentBorder,
  },
  manageText: { color: colors.accent, fontSize: 11, letterSpacing: 1 },
  footer: { color: colors.textMute, fontSize: 10, letterSpacing: 1.5, textAlign: 'center', marginBottom: 8 },
});

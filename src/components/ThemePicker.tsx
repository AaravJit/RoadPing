/**
 * ThemePicker — cockpit theme selector with live preview cards (Phase 16B).
 *
 * Renders one preview card per preset in a 2-up grid. Each card paints itself
 * with ITS OWN accent (so you see what you're choosing), shows a mini "GO LIVE"
 * pill + hold-to-talk dot, and marks the active theme. Tapping applies the
 * theme immediately via the ThemeProvider (which also persists it).
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import { useTheme } from '@/theme/ThemeProvider';
import type { ThemePreset } from '@/theme/themes';
import { Colors } from '@/theme/colors';
import { FontSize, FontWeight } from '@/theme/typography';
import { Radius, Spacing } from '@/theme/spacing';

function PreviewCard({
  preset,
  selected,
  onSelect,
}: {
  preset: ThemePreset;
  selected: boolean;
  onSelect: () => void;
}) {
  const a = preset.accent;
  return (
    <Pressable
      onPress={() => {
        void Haptics.selectionAsync();
        onSelect();
      }}
      style={[
        styles.card,
        { borderColor: selected ? a.accent : Colors.border },
        selected && { backgroundColor: a.accentMuted },
      ]}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${preset.name} theme`}
    >
      <View style={styles.cardHeader}>
        <View style={styles.swatches}>
          <View style={[styles.swatch, { backgroundColor: a.accent }]} />
          <View style={[styles.swatchSm, { backgroundColor: a.accentDim }]} />
        </View>
        <View style={styles.headerRight}>
          {preset.plus && (
            <View style={[styles.plusBadge, { borderColor: a.accent }]}>
              <Text style={[styles.plusBadgeText, { color: a.accent }]}>PLUS</Text>
            </View>
          )}
          <View
            style={[
              styles.check,
              selected
                ? { backgroundColor: a.accent, borderColor: a.accent }
                : { borderColor: Colors.border },
            ]}
          >
            {selected && <Text style={[styles.checkMark, { color: a.onAccent }]}>✓</Text>}
          </View>
        </View>
      </View>

      <Text style={styles.name}>{preset.name}</Text>
      <Text style={styles.desc} numberOfLines={2}>
        {preset.description}
      </Text>

      {/* Mini cockpit preview: GO LIVE pill + hold-to-talk dot */}
      <View style={styles.previewRow}>
        <View style={[styles.goPill, { backgroundColor: a.accent }]}>
          <Text style={[styles.goText, { color: a.onAccent }]}>GO LIVE</Text>
        </View>
        <View
          style={[
            styles.pttDot,
            { backgroundColor: a.accentMuted, borderColor: a.accent },
          ]}
        />
      </View>
    </Pressable>
  );
}

export function ThemePicker() {
  const { themeKey, setThemeKey, presets } = useTheme();
  return (
    <View style={styles.grid} accessibilityRole="radiogroup">
      {presets.map((preset) => (
        <PreviewCard
          key={preset.key}
          preset={preset}
          selected={preset.key === themeKey}
          onSelect={() => setThemeKey(preset.key)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: Spacing.md,
  },
  card: {
    width: '48%',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  swatches: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  swatch: {
    width: 24,
    height: 24,
    borderRadius: Radius.full,
  },
  swatchSm: {
    width: 14,
    height: 14,
    borderRadius: Radius.full,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  plusBadge: {
    borderWidth: 1,
    borderRadius: Radius.xs,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 1,
  },
  plusBadgeText: {
    fontSize: 9,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.5,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: {
    fontSize: FontSize.caption,
    fontWeight: FontWeight.bold,
  },
  name: {
    fontSize: FontSize.body,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  desc: {
    fontSize: FontSize.caption,
    color: Colors.textSecondary,
    lineHeight: FontSize.caption * 1.4,
    minHeight: FontSize.caption * 1.4 * 2,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  goPill: {
    flex: 1,
    height: 30,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goText: {
    fontSize: FontSize.micro,
    fontWeight: FontWeight.bold,
    letterSpacing: 1,
  },
  pttDot: {
    width: 30,
    height: 30,
    borderRadius: Radius.full,
    borderWidth: 2,
  },
});

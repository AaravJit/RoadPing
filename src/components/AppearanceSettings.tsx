/**
 * Appearance controls shared by Settings and first-run setup.
 *
 *   AppearancePicker  System / Light / Dark (segmented)
 *   AccentPicker      four accent swatches with names and a checkmark
 *
 * Changes apply instantly and persist. Accent never alters appearance or
 * status colors; see theme/accents.ts.
 */
import React from 'react';
import { Pressable, View } from 'react-native';

import { AppText, Icon, SegmentedControl, haptic } from '@/components/ui';
import type { AppearancePreference } from '@/services/themeStorage';
import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH_TARGET, Spacing } from '@/theme/spacing';

const APPEARANCE_SEGMENTS = [
  { value: 'system' as const, label: 'System', accessibilityLabel: 'Match iPhone appearance' },
  { value: 'light' as const, label: 'Light' },
  { value: 'dark' as const, label: 'Dark' },
];

export function AppearancePicker() {
  const { appearance, setAppearance } = useTheme();
  return (
    <SegmentedControl<AppearancePreference>
      segments={APPEARANCE_SEGMENTS}
      value={appearance}
      onChange={setAppearance}
      accessibilityLabel="Appearance"
    />
  );
}

const SWATCH = 36;

export function AccentPicker() {
  const { accents, accentKey, setAccentKey, scheme, colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Accent color">
      {accents.map((preset) => {
        const tokens = scheme === 'dark' ? preset.dark : preset.light;
        const selected = preset.key === accentKey;
        return (
          <Pressable
            key={preset.key}
            onPress={() => {
              if (selected) return;
              haptic.selection();
              setAccentKey(preset.key);
            }}
            style={styles.item}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={preset.name}
          >
            <View
              style={[
                styles.ring,
                { borderColor: selected ? tokens.fill : 'transparent' },
              ]}
            >
              <View style={[styles.swatch, { backgroundColor: tokens.fill }]}>
                {selected && <Icon name="checkmark" size={16} color={tokens.onFill} weight="bold" />}
              </View>
            </View>
            <AppText
              variant="caption1"
              align="center"
              numberOfLines={2}
              weight={selected ? 'semibold' : 'regular'}
              style={{ color: selected ? colors.textPrimary : colors.textSecondary }}
            >
              {preset.name}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.xs + 2,
    minHeight: MIN_TOUCH_TARGET,
  },
  ring: {
    width: SWATCH + 10,
    height: SWATCH + 10,
    borderRadius: (SWATCH + 10) / 2,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatch: {
    width: SWATCH,
    height: SWATCH,
    borderRadius: SWATCH / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));

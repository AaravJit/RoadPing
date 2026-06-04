/**
 * RangeSelector — row of preset chips for broadcast / search range.
 *
 * Driving-safe: large tap targets, single-tap selection. Identical preset
 * set as the profile setup screen so users see consistent options across
 * Drive and Settings.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';
import { useUnits } from '@/hooks/useUnits';
import { closestPresetIndex, rangePresetsFor } from '@/services/units';
import { FontSize, FontWeight } from '@/theme/typography';
import { MIN_TOUCH_TARGET, Radius, Spacing } from '@/theme/spacing';

export interface RangeOption {
  label: string;
  value: number;
}

interface RangeSelectorProps {
  value: number;
  onChange: (m: number) => void;
  /** Optional label rendered above the row. */
  label?: string;
  disabled?: boolean;
}

export function RangeSelector({
  value,
  onChange,
  label,
  disabled = false,
}: RangeSelectorProps) {
  const { accent } = useTheme();
  const { system } = useUnits();
  const presets = rangePresetsFor(system);
  // Highlight the closest preset so an existing metres value still lights up
  // after a unit switch (values are stored in metres, labels follow units).
  const selectedIndex = closestPresetIndex(presets, value);
  return (
    <View style={styles.wrap}>
      {label !== undefined && <Text style={styles.label}>{label}</Text>}
      <View style={styles.row} accessibilityRole="radiogroup">
        {presets.map((opt, i) => {
          const selected = i === selectedIndex;
          return (
            <Pressable
              key={opt.value}
              onPress={() => {
                if (!disabled) onChange(opt.value);
              }}
              disabled={disabled}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled }}
              accessibilityLabel={`${opt.label} broadcast range`}
              style={[
                styles.chip,
                selected && styles.chipActive,
                selected && {
                  backgroundColor: accent.accentMuted,
                  borderColor: accent.accent,
                },
                disabled && styles.chipDisabled,
              ]}
            >
              <Text
                style={[
                  styles.chipLabel,
                  selected && styles.chipLabelActive,
                  selected && { color: accent.accent },
                ]}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.sm,
  },
  label: {
    fontSize: FontSize.label,
    fontWeight: FontWeight.semibold,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md12,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    minWidth: 72,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: Colors.primaryMuted,
    borderColor: Colors.primary,
  },
  chipDisabled: {
    opacity: 0.4,
  },
  chipLabel: {
    fontSize: FontSize.body,
    fontWeight: FontWeight.medium,
    color: Colors.textSecondary,
  },
  chipLabelActive: {
    color: Colors.primary,
    fontWeight: FontWeight.semibold,
  },
});

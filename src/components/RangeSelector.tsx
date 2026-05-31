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
import { FontSize, FontWeight } from '@/theme/typography';
import { MIN_TOUCH_TARGET, Radius, Spacing } from '@/theme/spacing';

export interface RangeOption {
  label: string;
  value: number;
}

export const RANGE_PRESETS: readonly RangeOption[] = [
  { label: '500 m', value: 500 },
  { label: '1 km', value: 1000 },
  { label: '2 km', value: 2000 },
  { label: '3 km', value: 3000 },
  { label: '5 km', value: 5000 },
] as const;

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
  return (
    <View style={styles.wrap}>
      {label !== undefined && <Text style={styles.label}>{label}</Text>}
      <View style={styles.row} accessibilityRole="radiogroup">
        {RANGE_PRESETS.map((opt) => {
          const selected = opt.value === value;
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
                disabled && styles.chipDisabled,
              ]}
            >
              <Text
                style={[
                  styles.chipLabel,
                  selected && styles.chipLabelActive,
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

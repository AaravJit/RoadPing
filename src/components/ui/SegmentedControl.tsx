/**
 * SegmentedControl — iOS-style segmented picker for 2–5 mutually exclusive
 * options (Appearance, units, sign-in mode, range presets).
 */
import React from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH_TARGET, Radius, Spacing } from '@/theme/spacing';
import { AppText } from './AppText';
import { haptic } from './feedback';

export interface Segment<T extends string | number> {
  value: T;
  label: string;
  /** Longer VoiceOver label when `label` is abbreviated. */
  accessibilityLabel?: string;
}

export interface SegmentedControlProps<T extends string | number> {
  segments: readonly Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Accessibility name for the whole group. */
  accessibilityLabel?: string;
}

export function SegmentedControl<T extends string | number>({
  segments,
  value,
  onChange,
  disabled = false,
  style,
  accessibilityLabel,
}: SegmentedControlProps<T>) {
  const styles = useStyles();
  const { colors } = useTheme();

  return (
    <View
      style={[styles.track, disabled && styles.disabled, style]}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
    >
      {segments.map((seg) => {
        const selected = seg.value === value;
        return (
          <Pressable
            key={String(seg.value)}
            onPress={() => {
              if (selected || disabled) return;
              haptic.selection();
              onChange(seg.value);
            }}
            disabled={disabled}
            style={[styles.segment, selected && styles.selected]}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled }}
            accessibilityLabel={seg.accessibilityLabel ?? seg.label}
          >
            <AppText
              variant="subheadline"
              weight={selected ? 'semibold' : 'medium'}
              style={{ color: selected ? colors.textPrimary : colors.textSecondary }}
              numberOfLines={1}
              maxScale={1.5}
              adjustsFontSizeToFit
            >
              {seg.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  track: {
    flexDirection: 'row',
    padding: 3,
    gap: 3,
    borderRadius: Radius.sm + 1,
    borderCurve: 'continuous',
    backgroundColor: t.colors.fill,
  },
  segment: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET - 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.sm - 2,
    borderCurve: 'continuous',
  },
  selected: {
    backgroundColor: t.scheme === 'dark' ? t.colors.surfaceSecondary : t.colors.surface,
    shadowColor: t.colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: t.scheme === 'dark' ? 0.3 : 0.1,
    shadowRadius: 4,
    ...(t.a11y.increaseContrast
      ? { borderWidth: 1, borderColor: t.colors.separatorStrong }
      : null),
  },
  disabled: {
    opacity: 0.45,
  },
}));

/**
 * RangeSelector — the five broadcast-range presets as a segmented control.
 * Same presets everywhere (Drive, Settings, profile setup). Values stay in
 * metres; labels follow the chosen units.
 */
import React from 'react';
import { View } from 'react-native';

import { AppText, SegmentedControl } from '@/components/ui';
import { useUnits } from '@/hooks/useUnits';
import { closestPresetIndex, rangePresetsFor } from '@/services/units';
import { Spacing } from '@/theme/spacing';

interface RangeSelectorProps {
  value: number;
  onChange: (m: number) => void;
  /** Optional label rendered above the control. */
  label?: string;
  disabled?: boolean;
}

export function RangeSelector({ value, onChange, label, disabled = false }: RangeSelectorProps) {
  const { system } = useUnits();
  const presets = rangePresetsFor(system);
  // Highlight the closest preset so a stored metres value still lights up
  // after a unit switch.
  const selected = presets[closestPresetIndex(presets, value)]?.value ?? value;
  return (
    <View style={{ gap: Spacing.sm }}>
      {label !== undefined && (
        <AppText variant="footnote" color="secondary" weight="medium">
          {label}
        </AppText>
      )}
      <SegmentedControl
        segments={presets.map((p) => ({
          value: p.value,
          label: p.label,
          accessibilityLabel: `${p.label} range`,
        }))}
        value={selected}
        onChange={onChange}
        disabled={disabled}
        accessibilityLabel={label ?? 'Range'}
      />
    </View>
  );
}

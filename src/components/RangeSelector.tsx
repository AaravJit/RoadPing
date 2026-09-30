/**
 * RangeSelector — the four broadcast ranges as a segmented control. Same
 * presets everywhere (Drive, Settings, profile setup). Values stay in metres;
 * labels follow the chosen units. Each range is a distance-band edge, so a
 * range never reveals more about another driver than their band.
 */
import React from 'react';
import { View } from 'react-native';

import { AppText, SegmentedControl } from '@/components/ui';
import { useUnits } from '@/hooks/useUnits';
import { broadcastRangeFor, rangePresetsFor } from '@/services/units';
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
  // Highlight the range a stored value means (floored, never widened). A
  // legacy value below ½ mi highlights nothing until the user picks one.
  const selected = broadcastRangeFor(value) ?? value;
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

/**
 * SelectField — dark dropdown/selector (Phase 16D).
 *
 * A tappable field that opens a bottom-sheet list of options (optionally
 * searchable). Replaces freeform text + native pickers for vehicle setup so
 * choices are fast, large-touch, and consistent with the cockpit theme.
 */
import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { Colors } from '@/theme/colors';
import { FontSize, FontWeight } from '@/theme/typography';
import { MIN_TOUCH_TARGET, Radius, Spacing } from '@/theme/spacing';

export interface SelectOption {
  label: string;
  value: string;
}

interface SelectFieldProps {
  label: string;
  value: string | null;
  options: readonly SelectOption[];
  placeholder?: string;
  onChange: (value: string) => void;
  error?: string;
  searchable?: boolean;
}

export function SelectField({
  label,
  value,
  options,
  placeholder = 'Select',
  onChange,
  error,
  searchable = false,
}: SelectFieldProps) {
  const { accent } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selectedLabel = options.find((o) => o.value === value)?.label ?? null;

  const filtered = useMemo(() => {
    if (!searchable || query.trim().length === 0) return options;
    const q = query.trim().toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query, searchable]);

  function close() {
    setOpen(false);
    setQuery('');
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        style={[styles.field, error != null && styles.fieldError]}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selectedLabel ?? placeholder}`}
      >
        <Text
          style={[styles.value, selectedLabel == null && styles.placeholder]}
          numberOfLines={1}
        >
          {selectedLabel ?? placeholder}
        </Text>
        <Text style={styles.chevron}>⌄</Text>
      </Pressable>
      {error != null && <Text style={styles.errorText}>{error}</Text>}

      <Modal
        visible={open}
        animationType="slide"
        transparent
        onRequestClose={close}
      >
        <Pressable style={styles.backdrop} onPress={close} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{label}</Text>
          {searchable && (
            <TextInput
              style={styles.search}
              placeholder="Search…"
              placeholderTextColor={Colors.textTertiary}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
          )}
          <FlatList
            data={filtered}
            keyExtractor={(o) => o.value}
            keyboardShouldPersistTaps="handled"
            style={styles.list}
            renderItem={({ item }) => {
              const sel = item.value === value;
              return (
                <Pressable
                  style={styles.option}
                  onPress={() => {
                    onChange(item.value);
                    close();
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: sel }}
                >
                  <Text
                    style={[
                      styles.optionLabel,
                      sel && { color: accent.accent, fontWeight: FontWeight.semibold },
                    ]}
                  >
                    {item.label}
                  </Text>
                  {sel && (
                    <Text style={[styles.optionCheck, { color: accent.accent }]}>✓</Text>
                  )}
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.sm,
  },
  label: {
    fontSize: FontSize.label,
    fontWeight: FontWeight.medium,
    color: Colors.textSecondary,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  fieldError: {
    borderColor: Colors.error,
  },
  value: {
    flex: 1,
    fontSize: FontSize.body,
    color: Colors.textPrimary,
  },
  placeholder: {
    color: Colors.textTertiary,
  },
  chevron: {
    fontSize: FontSize.subheading,
    color: Colors.textTertiary,
    marginLeft: Spacing.sm,
  },
  errorText: {
    fontSize: FontSize.caption,
    color: Colors.error,
  },

  backdrop: {
    flex: 1,
    backgroundColor: Colors.overlay,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '75%',
    backgroundColor: Colors.surfaceElevated,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xl,
    paddingHorizontal: Spacing.md,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.borderFocused,
    marginBottom: Spacing.md,
  },
  sheetTitle: {
    fontSize: FontSize.subheading,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  search: {
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    color: Colors.textPrimary,
    fontSize: FontSize.body,
    marginBottom: Spacing.sm,
  },
  list: {
    flexGrow: 0,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  optionLabel: {
    fontSize: FontSize.body,
    color: Colors.textPrimary,
  },
  optionCheck: {
    fontSize: FontSize.body,
    fontWeight: FontWeight.bold,
  },
});

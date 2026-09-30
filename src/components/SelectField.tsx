/**
 * SelectField — a labelled field that opens a sheet of options (optionally
 * searchable), for long pick-lists such as make, model, year and color.
 */
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, TextInput, View } from 'react-native';

import { AppText, Icon, Sheet } from '@/components/ui';
import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH_TARGET, Radius, Spacing } from '@/theme/spacing';
import { textStyle } from '@/theme/typography';

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
  const { colors, accent } = useTheme();
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const hasError = error != null && error.length > 0;

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
      <AppText variant="footnote" color="secondary" weight="medium">
        {label}
      </AppText>
      <Pressable
        style={({ pressed }) => [
          styles.field,
          hasError && { borderColor: colors.danger, borderWidth: 1 },
          pressed && { backgroundColor: colors.fill },
        ]}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${selectedLabel ?? 'not set'}`}
        accessibilityHint="Opens a list to choose from"
      >
        <AppText
          variant="body"
          color={selectedLabel === null ? 'tertiary' : 'primary'}
          numberOfLines={1}
          style={styles.flex}
        >
          {selectedLabel ?? placeholder}
        </AppText>
        <Icon name="chevron.down" size={13} color={colors.textTertiary} />
      </Pressable>
      {hasError && (
        <AppText variant="footnote" color="danger" accessibilityRole="alert">
          {error}
        </AppText>
      )}

      <Sheet visible={open} onClose={close} title={label} maxHeight={0.8}>
        {searchable && (
          <View style={styles.searchWrap}>
            <Icon name="magnifyingglass" size={15} color={colors.textTertiary} />
            <TextInput
              style={styles.search}
              value={query}
              onChangeText={setQuery}
              placeholder="Search"
              placeholderTextColor={colors.textTertiary}
              selectionColor={accent.fill}
              autoCorrect={false}
              clearButtonMode="while-editing"
              accessibilityLabel={`Search ${label}`}
            />
          </View>
        )}
        <FlatList
          data={filtered}
          keyExtractor={(o) => o.value}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListEmptyComponent={
            <AppText variant="body" color="secondary" align="center" style={styles.empty}>
              No matches
            </AppText>
          }
          renderItem={({ item }) => {
            const selected = item.value === value;
            return (
              <Pressable
                style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.fill }]}
                onPress={() => {
                  onChange(item.value);
                  close();
                }}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={item.label}
              >
                <AppText variant="body" weight={selected ? 'semibold' : 'regular'} style={styles.flex}>
                  {item.label}
                </AppText>
                {selected && <Icon name="checkmark" size={16} color={accent.text} weight="bold" />}
              </Pressable>
            );
          }}
        />
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: {
    gap: Spacing.xs + 2,
  },
  field: {
    minHeight: MIN_TOUCH_TARGET + 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    backgroundColor: t.colors.surface,
    borderWidth: t.a11y.increaseContrast ? 1 : 0,
    borderColor: t.colors.separatorStrong,
  },
  flex: {
    flex: 1,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md12,
    minHeight: 40,
    borderRadius: Radius.sm,
    backgroundColor: t.colors.fill,
  },
  search: {
    ...textStyle('body'),
    flex: 1,
    color: t.colors.textPrimary,
    paddingVertical: Spacing.sm,
  },
  list: {
    marginHorizontal: Spacing.md,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: t.colors.surface,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  sep: {
    height: 0.5,
    marginLeft: Spacing.md,
    backgroundColor: t.colors.separator,
  },
  empty: {
    padding: Spacing.lg,
  },
}));

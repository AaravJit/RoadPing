/**
 * ReportModal — silent report flow (Drive map and Rooms).
 *
 * Privacy contract: the reported person is never notified. The copy says so
 * up front, and the confirmation repeats it.
 */
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';

import { AppText, Button, Icon, Notice, Sheet } from '@/components/ui';
import {
  REPORT_REASON_OPTIONS,
  reportUser,
  type ReportReasonOption,
} from '@/services/moderation';
import type { ReportContext } from '@/services/types';
import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH_TARGET, Radius, Spacing } from '@/theme/spacing';
import { textStyle } from '@/theme/typography';
import { personName } from './identity';

/** Who is being reported. Nearby drivers and room members both fit. */
export interface ReportTarget {
  user_id: string;
  display_name: string | null;
  handle: string | null;
}

interface ReportModalProps {
  visible: boolean;
  driver: ReportTarget | null;
  context: ReportContext;
  onClose: () => void;
  /** Called after a successful submission. */
  onSubmitted?: () => void;
}

const DETAILS_MAX = 500;

export function ReportModal({
  visible,
  driver,
  context,
  onClose,
  onSubmitted,
}: ReportModalProps) {
  const { colors, accent } = useTheme();
  const styles = useStyles();
  const [selected, setSelected] = useState<ReportReasonOption | null>(null);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmShown, setConfirmShown] = useState(false);

  // Reset whenever the sheet opens for someone.
  useEffect(() => {
    if (visible) {
      setSelected(null);
      setDetails('');
      setSubmitting(false);
      setError(null);
      setConfirmShown(false);
    }
  }, [visible, driver?.user_id]);

  async function handleSubmit() {
    if (driver === null || selected === null) return;
    setSubmitting(true);
    setError(null);
    try {
      await reportUser({
        reported_user_id: driver.user_id,
        reason: selected.value,
        context,
        ...(details.trim().length > 0 ? { details: details.trim().slice(0, DETAILS_MAX) } : {}),
      });
      setConfirmShown(true);
      onSubmitted?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The report could not be sent. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const name = driver !== null ? personName(driver) : 'this driver';

  if (confirmShown) {
    return (
      <Sheet visible={visible} onClose={onClose}>
        <View style={styles.confirm}>
          <Icon name="checkmark.circle.fill" size={44} color={colors.success} />
          <AppText variant="title3" weight="bold" align="center" accessibilityRole="header">
            Report sent
          </AppText>
          <AppText variant="body" color="secondary" align="center">
            Thanks. RoadPing's moderators will review it. {name} hasn't been notified.
          </AppText>
          <Button label="Done" onPress={onClose} size="lg" fullWidth />
        </View>
      </Sheet>
    );
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={`Report ${name}`}
      subtitle="Reports are private. They won't be told who reported them."
      maxHeight={0.9}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <AppText variant="footnote" color="secondary" weight="medium" accessibilityRole="header">
          Reason
        </AppText>
        <View style={styles.group} accessibilityRole="radiogroup">
          {REPORT_REASON_OPTIONS.map((opt, i) => {
            const isSel = selected?.value === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => setSelected(opt)}
                style={({ pressed }) => [
                  styles.option,
                  i > 0 && styles.optionDivider,
                  pressed && { backgroundColor: colors.fill },
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSel }}
                accessibilityLabel={opt.label}
                accessibilityHint={opt.description}
              >
                <View style={styles.optionText}>
                  <AppText variant="body" weight={isSel ? 'semibold' : 'regular'}>
                    {opt.label}
                  </AppText>
                  <AppText variant="footnote" color="secondary">
                    {opt.description}
                  </AppText>
                </View>
                <Icon
                  name={isSel ? 'checkmark.circle.fill' : 'circle'}
                  size={22}
                  color={isSel ? accent.fill : colors.textTertiary}
                />
              </Pressable>
            );
          })}
        </View>

        <AppText variant="footnote" color="secondary" weight="medium">
          Details (optional)
        </AppText>
        <TextInput
          style={styles.textArea}
          multiline
          value={details}
          onChangeText={(t) => setDetails(t.slice(0, DETAILS_MAX))}
          placeholder="What happened?"
          placeholderTextColor={colors.textTertiary}
          selectionColor={accent.fill}
          maxLength={DETAILS_MAX}
          textAlignVertical="top"
          accessibilityLabel="Details, optional"
        />
        <AppText variant="caption1" color="tertiary" align="right" tabular>
          {details.length}/{DETAILS_MAX}
        </AppText>

        {error !== null && <Notice tone="danger" title="Report not sent" message={error} />}

        <Button
          label="Send Report"
          size="lg"
          fullWidth
          loading={submitting}
          disabled={selected === null}
          onPress={() => {
            void handleSubmit();
          }}
        />
      </ScrollView>
    </Sheet>
  );
}

const useStyles = makeStyles((t) => ({
  scroll: {
    paddingHorizontal: Spacing.md20,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  group: {
    backgroundColor: t.colors.surface,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    overflow: 'hidden',
    marginBottom: Spacing.md,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md12,
    minHeight: MIN_TOUCH_TARGET + 12,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md12,
  },
  optionDivider: {
    borderTopWidth: 0.5,
    borderTopColor: t.colors.separator,
  },
  optionText: {
    flex: 1,
    gap: 2,
  },
  textArea: {
    ...textStyle('body'),
    minHeight: 100,
    color: t.colors.textPrimary,
    backgroundColor: t.colors.surface,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    padding: Spacing.md12,
  },
  confirm: {
    alignItems: 'center',
    gap: Spacing.md12,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
}));

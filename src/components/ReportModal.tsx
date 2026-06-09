/**
 * ReportModal — silent report flow for nearby drivers.
 *
 * Privacy contract: the reported user is never notified. We always return a
 * success-shaped confirmation to the reporter regardless of internal state.
 *
 * Phase 6 wraps the MOCK moderation.reportUser. Phase 7 will swap the
 * service implementation without changing this component.
 */
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AppButton } from './AppButton';
import { Colors } from '@/theme/colors';
import { FontSize, FontWeight } from '@/theme/typography';
import { Radius, Spacing } from '@/theme/spacing';
import {
  REPORT_REASON_OPTIONS,
  reportUser,
  type ReportReasonOption,
} from '@/services/moderation';
import type { NearbyDriverCard, ReportContext } from '@/services/types';

interface ReportModalProps {
  visible: boolean;
  driver: NearbyDriverCard | null;
  context: ReportContext;
  onClose: () => void;
  /** Called after a successful (mock) submission so callers can show a toast. */
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
  const [selected, setSelected] = useState<ReportReasonOption | null>(null);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmShown, setConfirmShown] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state whenever the modal opens for a different driver.
  React.useEffect(() => {
    if (visible) {
      setSelected(null);
      setDetails('');
      setSubmitting(false);
      setConfirmShown(false);
      setError(null);
    }
  }, [visible, driver?.user_id]);

  async function handleSubmit() {
    // Guard prevents duplicate rapid submissions (debounce via `submitting`).
    if (driver === null || selected === null || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await reportUser({
        reported_user_id: driver.user_id,
        reason: selected.value,
        context,
        ...(details.trim().length > 0
          ? { details: details.trim().slice(0, DETAILS_MAX) }
          : {}),
      });
      setConfirmShown(true);
      onSubmitted?.();
    } catch {
      // Fail safe — never crash; let the user retry.
      setError("Couldn't submit your report. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetWrap}
        >
          <View style={styles.sheet}>
            <View style={styles.handle} />

            {!confirmShown ? (
              <ScrollView
                contentContainerStyle={styles.scroll}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={styles.title}>
                  Report{' '}
                  {driver?.handle !== null && driver?.handle !== undefined
                    ? `@${driver.handle}`
                    : (driver?.display_name ?? 'this driver')}
                </Text>
                <Text style={styles.subtitle}>
                  Reports are silent. The other driver will not be notified.
                </Text>

                <Text style={styles.sectionLabel}>Reason</Text>
                <View style={styles.options}>
                  {REPORT_REASON_OPTIONS.map((opt) => {
                    const isSel = selected?.value === opt.value;
                    return (
                      <Pressable
                        key={opt.value}
                        style={[styles.option, isSel && styles.optionSelected]}
                        onPress={() => setSelected(opt)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: isSel }}
                        accessibilityLabel={opt.label}
                      >
                        <View style={styles.optionTextWrap}>
                          <Text
                            style={[
                              styles.optionLabel,
                              isSel && styles.optionLabelSelected,
                            ]}
                          >
                            {opt.label}
                          </Text>
                          <Text style={styles.optionDesc}>
                            {opt.description}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.radioDot,
                            isSel && styles.radioDotSelected,
                          ]}
                        />
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={styles.sectionLabel}>
                  Add details (optional)
                </Text>
                <TextInput
                  style={styles.textArea}
                  multiline
                  numberOfLines={4}
                  value={details}
                  onChangeText={(t) => setDetails(t.slice(0, DETAILS_MAX))}
                  placeholder="What happened?"
                  placeholderTextColor={Colors.textTertiary}
                  maxLength={DETAILS_MAX}
                  textAlignVertical="top"
                />
                <Text style={styles.counter}>
                  {details.length}/{DETAILS_MAX}
                </Text>

                {error !== null && (
                  <Text style={styles.errorText} accessibilityRole="alert">
                    {error}
                  </Text>
                )}

                <View style={styles.actions}>
                  <AppButton
                    label="Submit report"
                    variant="primary"
                    size="lg"
                    fullWidth
                    loading={submitting}
                    disabled={selected === null}
                    onPress={() => {
                      void handleSubmit();
                    }}
                  />
                  <AppButton
                    label="Cancel"
                    variant="ghost"
                    size="md"
                    fullWidth
                    disabled={submitting}
                    onPress={onClose}
                  />
                </View>
              </ScrollView>
            ) : (
              <View style={styles.confirmWrap}>
                <Text style={styles.confirmEmoji}>✓</Text>
                <Text style={styles.confirmTitle}>Report submitted</Text>
                <Text style={styles.confirmBody}>
                  Report submitted. We’ll review it. The other driver hasn’t
                  been notified.
                </Text>
                <AppButton
                  label="Done"
                  variant="primary"
                  size="lg"
                  fullWidth
                  onPress={onClose}
                />
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  sheetWrap: {
    width: '100%',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    maxHeight: '90%',
    paddingBottom: Spacing.xl,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  scroll: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.lg,
    gap: Spacing.md,
  },
  title: {
    fontSize: FontSize.heading,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: FontSize.bodySmall,
    color: Colors.textSecondary,
    lineHeight: FontSize.bodySmall * 1.5,
  },
  sectionLabel: {
    marginTop: Spacing.sm,
    fontSize: FontSize.label,
    fontWeight: FontWeight.semibold,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  options: {
    gap: Spacing.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  optionSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryMuted,
  },
  optionTextWrap: {
    flex: 1,
    gap: 2,
  },
  optionLabel: {
    fontSize: FontSize.body,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  optionLabelSelected: {
    color: Colors.primary,
  },
  optionDesc: {
    fontSize: FontSize.caption,
    color: Colors.textSecondary,
  },
  radioDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  radioDotSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  textArea: {
    minHeight: 96,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    fontSize: FontSize.body,
    color: Colors.textPrimary,
  },
  counter: {
    alignSelf: 'flex-end',
    fontSize: FontSize.caption,
    color: Colors.textTertiary,
  },
  errorText: {
    fontSize: FontSize.bodySmall,
    color: Colors.error,
    lineHeight: FontSize.bodySmall * 1.4,
  },
  actions: {
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  confirmWrap: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
    gap: Spacing.md,
    alignItems: 'center',
  },
  confirmEmoji: {
    fontSize: 56,
    color: Colors.success,
  },
  confirmTitle: {
    fontSize: FontSize.heading,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  confirmBody: {
    fontSize: FontSize.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: FontSize.body * 1.5,
  },
});

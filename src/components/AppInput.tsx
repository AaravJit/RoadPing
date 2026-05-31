/**
 * AppInput — text input for RoadPing.
 *
 * Dark-themed, accessible, with label, helper text, and error states.
 * Driving-safety: kept minimal — complex text input should never
 * appear on the Drive screen. Use this only in settings / onboarding.
 */
import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  TouchableOpacity,
  View,
} from 'react-native';
import { Colors } from '@/theme/colors';
import { FontSize, FontWeight } from '@/theme/typography';
import { MIN_TOUCH_TARGET, Radius, Spacing } from '@/theme/spacing';

interface AppInputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  helper?: string;
  error?: string;
  /** Show/hide password toggle */
  secure?: boolean;
}

export function AppInput({
  label,
  helper,
  error,
  secure = false,
  editable = true,
  ...props
}: AppInputProps) {
  const [hidden, setHidden] = useState(secure);
  const [focused, setFocused] = useState(false);

  const hasError = Boolean(error);

  return (
    <View style={styles.wrapper}>
      {label != null && (
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
      )}

      <View
        style={[
          styles.inputRow,
          focused && styles.inputRowFocused,
          hasError && styles.inputRowError,
          !editable && styles.inputRowDisabled,
        ]}
      >
        <TextInput
          {...props}
          secureTextEntry={hidden}
          editable={editable}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
          style={[styles.input, !editable && styles.inputDisabled]}
          placeholderTextColor={Colors.textTertiary}
          selectionColor={Colors.primary}
          autoCapitalize={props.autoCapitalize ?? 'none'}
          autoCorrect={props.autoCorrect ?? false}
          accessibilityLabel={label}
          accessibilityHint={helper}
        />

        {secure && (
          <TouchableOpacity
            onPress={() => setHidden((h) => !h)}
            style={styles.eyeButton}
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.eyeIcon}>{hidden ? '👁' : '🙈'}</Text>
          </TouchableOpacity>
        )}
      </View>

      {hasError ? (
        <Text style={styles.errorText} accessibilityRole="alert">
          {error}
        </Text>
      ) : helper != null ? (
        <Text style={styles.helperText}>{helper}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: Spacing.xs,
  },
  label: {
    fontSize: FontSize.label,
    fontWeight: FontWeight.medium,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    minHeight: MIN_TOUCH_TARGET,
  },
  inputRowFocused: {
    borderColor: Colors.borderFocused,
    backgroundColor: Colors.surfaceElevated,
  },
  inputRowError: {
    borderColor: Colors.error,
  },
  inputRowDisabled: {
    opacity: 0.5,
  },
  input: {
    flex: 1,
    fontSize: FontSize.body,
    color: Colors.textPrimary,
    paddingVertical: Spacing.md12,
  },
  inputDisabled: {
    color: Colors.textDisabled,
  },
  eyeButton: {
    padding: Spacing.xs,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
  },
  eyeIcon: {
    fontSize: FontSize.body,
  },
  helperText: {
    fontSize: FontSize.caption,
    color: Colors.textTertiary,
  },
  errorText: {
    fontSize: FontSize.caption,
    color: Colors.error,
  },
});

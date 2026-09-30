/**
 * TextField — labelled text input with helper and error text.
 *
 * Label sits above the field (never a placeholder-only label), errors are
 * announced to VoiceOver, and the field grows with Dynamic Type.
 */
import React, { useState } from 'react';
import { Pressable, TextInput, View, type TextInputProps } from 'react-native';

import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH_TARGET, Radius, Spacing } from '@/theme/spacing';
import { TextVariants } from '@/theme/typography';
import { AppText } from './AppText';
import { Icon } from './Icon';

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  helper?: string;
  error?: string | null;
  /** Adds a show/hide control for passwords. */
  secure?: boolean;
}

export function TextField({
  label,
  helper,
  error,
  secure = false,
  editable = true,
  onFocus,
  onBlur,
  ...props
}: TextFieldProps) {
  const { colors, accent } = useTheme();
  const styles = useStyles();
  const [hidden, setHidden] = useState(secure);
  const [focused, setFocused] = useState(false);
  const hasError = error != null && error.length > 0;

  return (
    <View style={styles.wrap}>
      {label !== undefined && label.length > 0 && (
        <AppText variant="footnote" color="secondary" weight="medium" style={styles.label}>
          {label}
        </AppText>
      )}
      <View
        style={[
          styles.field,
          focused && { borderColor: accent.fill },
          hasError && { borderColor: colors.danger },
          !editable && styles.readOnly,
        ]}
      >
        <TextInput
          {...props}
          editable={editable}
          secureTextEntry={hidden}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={styles.input}
          placeholderTextColor={colors.textTertiary}
          selectionColor={accent.fill}
          cursorColor={accent.fill}
          keyboardAppearance="default"
          autoCapitalize={props.autoCapitalize ?? 'none'}
          autoCorrect={props.autoCorrect ?? false}
          maxFontSizeMultiplier={TextVariants.body.maxScale}
          accessibilityLabel={props.accessibilityLabel ?? label}
          accessibilityHint={hasError ? error ?? undefined : helper}
        />
        {secure && (
          <Pressable
            onPress={() => setHidden((h) => !h)}
            hitSlop={10}
            style={styles.eye}
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
          >
            <Icon
              name={hidden ? 'eye.fill' : 'eye.slash.fill'}
              size={18}
              color={colors.textTertiary}
            />
          </Pressable>
        )}
      </View>
      {hasError ? (
        <AppText
          variant="footnote"
          color="danger"
          style={styles.below}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          {error}
        </AppText>
      ) : helper !== undefined ? (
        <AppText variant="footnote" color="secondary" style={styles.below}>
          {helper}
        </AppText>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: {
    gap: Spacing.xs + 2,
  },
  label: {
    paddingHorizontal: Spacing.xs,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TOUCH_TARGET + 6,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.a11y.increaseContrast ? t.colors.separatorStrong : t.colors.separator,
  },
  readOnly: {
    opacity: 0.55,
  },
  input: {
    flex: 1,
    fontSize: TextVariants.body.fontSize,
    color: t.colors.textPrimary,
    paddingVertical: Spacing.md12,
  },
  eye: {
    paddingLeft: Spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
  },
  below: {
    paddingHorizontal: Spacing.xs,
  },
}));

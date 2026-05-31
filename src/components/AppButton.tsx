/**
 * AppButton — primary interactive control for RoadPing.
 *
 * Driving-safety design notes:
 *  - Minimum height 48 px (MIN_TOUCH_TARGET)
 *  - All variants have a clear pressed state
 *  - Haptic feedback on press (can be disabled for accessibility)
 *  - Loading state disables interaction and shows spinner
 */
import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  type TouchableOpacityProps,
  type ViewStyle,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '@/theme/colors';
import { FontSize, FontWeight } from '@/theme/typography';
import { MIN_TOUCH_TARGET, Radius, Spacing } from '@/theme/spacing';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface AppButtonProps extends Omit<TouchableOpacityProps, 'style'> {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
  haptic?: boolean;
  style?: ViewStyle;
}

export function AppButton({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  leftIcon,
  rightIcon,
  fullWidth = false,
  haptic = true,
  onPress,
  style,
  ...rest
}: AppButtonProps) {
  const isDisabled = disabled || loading;

  async function handlePress(e: Parameters<NonNullable<TouchableOpacityProps['onPress']>>[0]) {
    if (isDisabled) return;
    if (haptic) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress?.(e);
  }

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={handlePress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={[
        styles.base,
        styles[`variant_${variant}`],
        styles[`size_${size}`],
        ...(fullWidth ? [styles.fullWidth] : []),
        ...(isDisabled ? [styles.disabled] : []),
        ...(style != null ? [style] : []),
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' ? Colors.textInverse : Colors.textPrimary}
        />
      ) : (
        <View style={styles.inner}>
          {leftIcon && <View style={styles.iconLeft}>{leftIcon}</View>}
          <Text
            style={[
              styles.label,
              styles[`labelVariant_${variant}`],
              styles[`labelSize_${size}`],
              isDisabled && styles.labelDisabled,
            ]}
            numberOfLines={1}
          >
            {label}
          </Text>
          {rightIcon && <View style={styles.iconRight}>{rightIcon}</View>}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: MIN_TOUCH_TARGET,
  },
  fullWidth: {
    width: '100%',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconLeft: {
    marginRight: Spacing.sm,
  },
  iconRight: {
    marginLeft: Spacing.sm,
  },

  // ── Variant backgrounds ──────────────────────────────────────────────────
  variant_primary: {
    backgroundColor: Colors.primary,
  },
  variant_secondary: {
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  variant_ghost: {
    backgroundColor: Colors.transparent,
  },
  variant_danger: {
    backgroundColor: Colors.errorMuted,
    borderWidth: 1,
    borderColor: Colors.error,
  },

  // ── Sizes ────────────────────────────────────────────────────────────────
  size_sm: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minHeight: 36,
  },
  size_md: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md12,
  },
  size_lg: {
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.md,
    minHeight: 56,
  },

  // ── Disabled ─────────────────────────────────────────────────────────────
  disabled: {
    opacity: 0.45,
  },

  // ── Label base ────────────────────────────────────────────────────────────
  label: {
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.2,
  },
  labelVariant_primary: {
    color: Colors.textInverse,
  },
  labelVariant_secondary: {
    color: Colors.textPrimary,
  },
  labelVariant_ghost: {
    color: Colors.textBrand,
  },
  labelVariant_danger: {
    color: Colors.error,
  },
  labelDisabled: {
    opacity: 0.6,
  },

  // ── Label sizes ───────────────────────────────────────────────────────────
  labelSize_sm: {
    fontSize: FontSize.label,
  },
  labelSize_md: {
    fontSize: FontSize.bodyLarge,
  },
  labelSize_lg: {
    fontSize: FontSize.subheading,
  },
});

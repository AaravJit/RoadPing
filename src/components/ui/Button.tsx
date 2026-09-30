/**
 * Button — the app's standard action button.
 *
 *   primary      accent fill — the one main action on a screen
 *   secondary    neutral fill with accent label — supporting actions
 *   plain        label only — Cancel, "Not now", inline links
 *   destructive  red label on a soft red fill — delete, block, leave
 *
 * Heights: `lg` 56 pt (primary screen actions), `md` 50 pt, `sm` 36 pt
 * visual with a 44 pt hit target.
 */
import React from 'react';
import { ActivityIndicator, View, type StyleProp, type ViewStyle } from 'react-native';

import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import { Radius, Spacing } from '@/theme/spacing';
import { AppText } from './AppText';
import { haptic } from './feedback';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';

export type ButtonVariant = 'primary' | 'secondary' | 'plain' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  accessibilityHint?: string;
  /** Overrides the label for VoiceOver when the visible label is terse. */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

const HEIGHT: Record<ButtonSize, number> = { sm: 36, md: 50, lg: 56 };

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  disabled = false,
  fullWidth = false,
  accessibilityHint,
  accessibilityLabel,
  style,
}: ButtonProps) {
  const { accent, colors } = useTheme();
  const styles = useStyles();
  const inactive = disabled || loading;

  const fg: Record<ButtonVariant, string> = {
    primary: accent.onFill,
    secondary: accent.text,
    plain: accent.text,
    destructive: colors.danger,
  };
  const bg: Record<ButtonVariant, string> = {
    primary: accent.fill,
    secondary: colors.fill,
    plain: 'transparent',
    destructive: colors.dangerMuted,
  };

  const small = size === 'sm';

  return (
    <PressableScale
      onPress={() => {
        if (inactive) return;
        haptic.tap();
        onPress();
      }}
      disabled={inactive}
      pressedScale={variant === 'plain' ? 1 : 0.97}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      hitSlop={small ? { top: 4, bottom: 4, left: 4, right: 4 } : undefined}
      style={[
        styles.base,
        {
          minHeight: HEIGHT[size],
          backgroundColor: bg[variant],
          paddingHorizontal: small ? Spacing.md12 : Spacing.md20,
        },
        fullWidth && styles.fullWidth,
        inactive && !loading && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg[variant]} />
      ) : (
        <View style={styles.inner}>
          {icon !== undefined && (
            <Icon name={icon} size={small ? 15 : 18} color={fg[variant]} />
          )}
          <AppText
            variant={small ? 'subheadline' : 'headline'}
            weight="semibold"
            style={{ color: fg[variant] }}
            numberOfLines={1}
            maxScale={1.6}
          >
            {label}
          </AppText>
        </View>
      )}
    </PressableScale>
  );
}

const useStyles = makeStyles(() => ({
  base: {
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xs,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  disabled: {
    opacity: 0.4,
  },
}));

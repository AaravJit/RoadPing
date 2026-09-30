/**
 * AppText — every piece of UI text goes through this.
 *
 * `variant` picks an iOS text style; `color` picks a semantic role, so a
 * screen never hard-codes a text color that could vanish in the other
 * appearance. Dynamic Type is honored up to the variant's cap (or `maxScale`).
 */
import React from 'react';
import { Text, type TextProps, type TextStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { FontWeight, TextVariants, type TextVariant } from '@/theme/typography';

export type TextColor =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'accent'
  | 'onAccent'
  | 'onColor'
  | 'live'
  | 'danger'
  | 'success'
  | 'warning';

export interface AppTextProps extends TextProps {
  variant?: TextVariant;
  color?: TextColor;
  weight?: keyof typeof FontWeight;
  align?: TextStyle['textAlign'];
  /** Override the variant's Dynamic Type ceiling. */
  maxScale?: number;
  /** Tabular digits for counters and distances that update in place. */
  tabular?: boolean;
}

export function AppText({
  variant = 'body',
  color = 'primary',
  weight,
  align,
  maxScale,
  tabular = false,
  style,
  ...rest
}: AppTextProps) {
  const { colors, accent } = useTheme();
  const spec = TextVariants[variant];

  const resolvedColor: Record<TextColor, string> = {
    primary: colors.textPrimary,
    secondary: colors.textSecondary,
    tertiary: colors.textTertiary,
    accent: accent.text,
    onAccent: accent.onFill,
    onColor: colors.textOnColor,
    live: colors.live,
    danger: colors.danger,
    success: colors.success,
    warning: colors.warning,
  };

  return (
    <Text
      maxFontSizeMultiplier={maxScale ?? spec.maxScale}
      style={[
        {
          fontSize: spec.fontSize,
          lineHeight: spec.lineHeight,
          fontWeight: weight !== undefined ? FontWeight[weight] : spec.fontWeight,
          letterSpacing: spec.letterSpacing,
          color: resolvedColor[color],
        },
        align !== undefined && { textAlign: align },
        tabular && { fontVariant: ['tabular-nums'] },
        style,
      ]}
      {...rest}
    />
  );
}

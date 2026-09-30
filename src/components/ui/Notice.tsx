/**
 * Notice — inline, non-blocking message (error, privacy note, zone hidden).
 * Color is never the only signal: every tone has its own symbol and the
 * title states the situation in words.
 */
import React from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import { Radius, Spacing } from '@/theme/spacing';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

export type NoticeTone = 'info' | 'warning' | 'danger' | 'success';

const TONE_ICON: Record<NoticeTone, IconName> = {
  info: 'info.circle.fill',
  warning: 'exclamationmark.triangle.fill',
  danger: 'exclamationmark.triangle.fill',
  success: 'checkmark.circle.fill',
};

export interface NoticeProps {
  tone?: NoticeTone;
  icon?: IconName;
  title?: string;
  message: string;
  /** Makes the whole notice a button (e.g. "Manage zones"). */
  onPress?: () => void;
  actionLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function Notice({
  tone = 'info',
  icon,
  title,
  message,
  onPress,
  actionLabel,
  style,
}: NoticeProps) {
  const { colors, accent } = useTheme();
  const styles = useStyles();
  const toneColor: Record<NoticeTone, string> = {
    info: colors.textSecondary,
    warning: colors.warning,
    danger: colors.danger,
    success: colors.success,
  };
  const toneFill: Record<NoticeTone, string> = {
    info: colors.fill,
    warning: colors.warningMuted,
    danger: colors.dangerMuted,
    success: colors.successMuted,
  };

  const body = (
    <>
      <Icon name={icon ?? TONE_ICON[tone]} size={18} color={toneColor[tone]} />
      <View style={styles.text}>
        {title !== undefined && (
          <AppText variant="subheadline" weight="semibold">
            {title}
          </AppText>
        )}
        <AppText variant="footnote" color="secondary">
          {message}
        </AppText>
        {actionLabel !== undefined && (
          <AppText variant="footnote" weight="semibold" style={{ color: accent.text }}>
            {actionLabel}
          </AppText>
        )}
      </View>
    </>
  );

  const containerStyle = [styles.box, { backgroundColor: toneFill[tone] }, style];
  const label = [title, message, actionLabel].filter(Boolean).join('. ');

  if (onPress !== undefined) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [containerStyle, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        {body}
      </Pressable>
    );
  }
  return (
    <View
      style={containerStyle}
      accessible
      accessibilityRole={tone === 'danger' ? 'alert' : undefined}
      accessibilityLabel={label}
    >
      {body}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  box: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md12,
    padding: Spacing.md12 + 2,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
  },
  text: {
    flex: 1,
    gap: 2,
  },
  pressed: {
    opacity: 0.7,
  },
}));

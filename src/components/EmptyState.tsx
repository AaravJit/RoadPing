/**
 * EmptyState — what a list shows before it has anything in it.
 * One symbol, one sentence of title, one of explanation, optional action.
 */
import React from 'react';
import { View } from 'react-native';

import { AppText, Button, Icon, type IconName } from '@/components/ui';
import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import { Spacing } from '@/theme/spacing';

interface EmptyStateProps {
  icon?: IconName;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  fill?: boolean;
}

export function EmptyState({
  icon,
  title,
  message,
  actionLabel,
  onAction,
  fill = true,
}: EmptyStateProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={[styles.container, fill && styles.fill]}>
      {icon !== undefined && <Icon name={icon} size={40} color={colors.textTertiary} weight="regular" />}
      <AppText variant="title3" align="center" accessibilityRole="header">
        {title}
      </AppText>
      {message !== undefined && (
        <AppText variant="subheadline" color="secondary" align="center" style={styles.message}>
          {message}
        </AppText>
      )}
      {actionLabel !== undefined && onAction !== undefined && (
        <Button label={actionLabel} variant="secondary" size="sm" onPress={onAction} style={styles.action} />
      )}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xl40,
  },
  fill: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  message: {
    maxWidth: 300,
  },
  action: {
    marginTop: Spacing.md,
  },
}));

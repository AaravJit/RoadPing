/**
 * ErrorState — a failed load with a way to retry.
 */
import React from 'react';
import { View } from 'react-native';

import { AppText, Button, Icon } from '@/components/ui';
import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import { Spacing } from '@/theme/spacing';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  fill?: boolean;
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Try Again',
  fill = true,
}: ErrorStateProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={[styles.container, fill && styles.fill]} accessibilityRole="alert">
      <Icon name="exclamationmark.triangle.fill" size={36} color={colors.warning} />
      <AppText variant="title3" align="center">
        {title}
      </AppText>
      {message !== undefined && (
        <AppText variant="subheadline" color="secondary" align="center" style={styles.message}>
          {message}
        </AppText>
      )}
      {onRetry !== undefined && (
        <Button label={retryLabel} variant="secondary" size="sm" onPress={onRetry} style={styles.action} />
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

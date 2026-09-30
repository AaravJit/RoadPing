/**
 * LoadingState — calm, centered progress for a screen or section.
 */
import React from 'react';
import { ActivityIndicator, View } from 'react-native';

import { AppText } from '@/components/ui';
import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import { Spacing } from '@/theme/spacing';

interface LoadingStateProps {
  message?: string;
  /** Fill the parent and paint the screen background. */
  fill?: boolean;
}

export function LoadingState({ message, fill = true }: LoadingStateProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View
      style={[styles.container, fill && styles.fill]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={message ?? 'Loading'}
    >
      <ActivityIndicator color={colors.textSecondary} />
      {message !== undefined && (
        <AppText variant="subheadline" color="secondary" align="center">
          {message}
        </AppText>
      )}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md12,
    padding: Spacing.xl,
  },
  fill: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
}));

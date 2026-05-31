/**
 * ErrorState — full-area error display with optional retry.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/theme/colors';
import { FontSize, FontWeight } from '@/theme/typography';
import { Spacing } from '@/theme/spacing';
import { AppButton } from './AppButton';

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
  retryLabel = 'Try again',
  fill = true,
}: ErrorStateProps) {
  return (
    <View
      style={[styles.container, fill && styles.fill]}
      accessibilityRole="alert"
    >
      <Text style={styles.emoji}>⚠️</Text>
      <Text style={styles.title}>{title}</Text>
      {message != null && (
        <Text style={styles.message}>{message}</Text>
      )}
      {onRetry != null && (
        <AppButton
          label={retryLabel}
          variant="secondary"
          size="sm"
          onPress={onRetry}
          style={styles.retryButton}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    padding: Spacing.xl,
  },
  fill: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  emoji: {
    fontSize: 36,
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: FontSize.subheading,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  message: {
    fontSize: FontSize.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: FontSize.body * 1.5,
  },
  retryButton: {
    marginTop: Spacing.md,
  },
});

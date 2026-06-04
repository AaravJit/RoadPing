/**
 * ErrorState — full-area error display with optional retry.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/theme/colors';
import { FontSize, FontWeight } from '@/theme/typography';
import { Radius, Spacing } from '@/theme/spacing';
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
      <View style={styles.iconBadge}>
        <Text style={styles.emoji}>⚠️</Text>
      </View>
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
  iconBadge: {
    width: 72,
    height: 72,
    borderRadius: Radius.full,
    backgroundColor: Colors.errorMuted,
    borderWidth: 1,
    borderColor: Colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  emoji: {
    fontSize: 32,
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

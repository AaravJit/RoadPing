/**
 * LoadingState — full-area loading indicator.
 * Used when a screen or section is waiting for data.
 */
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/theme/colors';
import { FontSize } from '@/theme/typography';
import { Spacing } from '@/theme/spacing';

interface LoadingStateProps {
  /** Optional message shown below the spinner */
  message?: string;
  /** Fill the parent container */
  fill?: boolean;
  size?: 'small' | 'large';
}

export function LoadingState({
  message,
  fill = true,
  size = 'large',
}: LoadingStateProps) {
  return (
    <View
      style={[styles.container, fill && styles.fill]}
      accessibilityRole="progressbar"
      accessibilityLabel={message ?? 'Loading…'}
    >
      <ActivityIndicator size={size} color={Colors.primary} />
      {message != null && (
        <Text style={styles.message}>{message}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    padding: Spacing.xl,
  },
  fill: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  message: {
    fontSize: FontSize.body,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});

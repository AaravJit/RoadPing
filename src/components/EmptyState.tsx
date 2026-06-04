/**
 * EmptyState — full-area empty placeholder.
 * Used when a list or section has no content yet.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/theme/colors';
import { FontSize, FontWeight } from '@/theme/typography';
import { Radius, Spacing } from '@/theme/spacing';
import { AppButton } from './AppButton';

interface EmptyStateProps {
  icon?: string; // emoji
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
  return (
    <View style={[styles.container, fill && styles.fill]}>
      {icon != null && (
        <View style={styles.iconBadge}>
          <Text style={styles.icon}>{icon}</Text>
        </View>
      )}
      <Text style={styles.title}>{title}</Text>
      {message != null && (
        <Text style={styles.message}>{message}</Text>
      )}
      {actionLabel != null && onAction != null && (
        <AppButton
          label={actionLabel}
          variant="ghost"
          size="sm"
          onPress={onAction}
          style={styles.actionButton}
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
    width: 76,
    height: 76,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  icon: {
    fontSize: 38,
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
    maxWidth: 260,
  },
  actionButton: {
    marginTop: Spacing.md,
  },
});

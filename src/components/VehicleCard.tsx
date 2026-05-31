/**
 * VehicleCard — list item for a user's vehicle.
 *
 * Shows nickname (label), year-make-model, color, body type, and primary
 * badge. Exposes optional onEdit / onDelete / onSetPrimary actions.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppCard } from './AppCard';
import { AppButton } from './AppButton';
import { Colors } from '@/theme/colors';
import { FontSize, FontWeight } from '@/theme/typography';
import { Radius, Spacing } from '@/theme/spacing';
import type { VehicleRow } from '@/services/types';
import { bodyTypeEmoji, bodyTypeLabel, bodyTypeSqlToUi } from '@/services/vehicle';

interface VehicleCardProps {
  vehicle: VehicleRow;
  onEdit?: () => void;
  onDelete?: () => void;
  onSetPrimary?: () => void;
  /** True while an action on this card is in flight. Disables buttons. */
  busy?: boolean;
}

export function VehicleCard({
  vehicle,
  onEdit,
  onDelete,
  onSetPrimary,
  busy = false,
}: VehicleCardProps) {
  const bodyUi = vehicle.body_type !== null ? bodyTypeSqlToUi(vehicle.body_type) : null;
  const subtitleParts = [
    vehicle.year !== null ? String(vehicle.year) : null,
    vehicle.make,
    vehicle.model,
  ].filter((p): p is string => typeof p === 'string' && p.length > 0);

  return (
    <AppCard
      elevation="raised"
      highlight={vehicle.is_active ? 'primary' : undefined}
      padded
    >
      <View style={styles.headerRow}>
        <View style={styles.titleWrap}>
          <Text style={styles.emoji}>
            {bodyUi !== null ? bodyTypeEmoji(bodyUi) : '🚗'}
          </Text>
          <View style={styles.titleText}>
            <Text style={styles.nickname} numberOfLines={1}>
              {vehicle.label}
            </Text>
            {subtitleParts.length > 0 && (
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitleParts.join(' ')}
              </Text>
            )}
          </View>
        </View>

        {vehicle.is_active && (
          <View style={styles.primaryBadge} accessibilityLabel="Primary vehicle">
            <Text style={styles.primaryBadgeText}>PRIMARY</Text>
          </View>
        )}
      </View>

      <View style={styles.metaRow}>
        {bodyUi !== null && (
          <View style={styles.metaChip}>
            <Text style={styles.metaChipText}>{bodyTypeLabel(bodyUi)}</Text>
          </View>
        )}
        {vehicle.color !== null && vehicle.color.length > 0 && (
          <View style={styles.metaChip}>
            <Text style={styles.metaChipText}>{vehicle.color}</Text>
          </View>
        )}
      </View>

      <View style={styles.actionsRow}>
        {onSetPrimary !== undefined && !vehicle.is_active && (
          <AppButton
            label="Make primary"
            variant="secondary"
            size="sm"
            onPress={onSetPrimary}
            disabled={busy}
            style={styles.actionBtn}
          />
        )}
        {onEdit !== undefined && (
          <AppButton
            label="Edit"
            variant="ghost"
            size="sm"
            onPress={onEdit}
            disabled={busy}
            style={styles.actionBtn}
          />
        )}
        {onDelete !== undefined && (
          <AppButton
            label="Delete"
            variant="danger"
            size="sm"
            onPress={onDelete}
            disabled={busy}
            style={styles.actionBtn}
          />
        )}
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  titleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md12,
  },
  emoji: {
    fontSize: 28,
  },
  titleText: {
    flex: 1,
    gap: 2,
  },
  nickname: {
    fontSize: FontSize.bodyLarge,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: FontSize.bodySmall,
    color: Colors.textSecondary,
  },
  primaryBadge: {
    backgroundColor: Colors.primaryMuted,
    borderColor: Colors.primary,
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  primaryBadgeText: {
    fontSize: FontSize.micro,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
    letterSpacing: 1,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginTop: Spacing.md12,
  },
  metaChip: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md12,
    paddingVertical: Spacing.xs,
  },
  metaChipText: {
    fontSize: FontSize.caption,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  actionBtn: {
    flexShrink: 1,
  },
});

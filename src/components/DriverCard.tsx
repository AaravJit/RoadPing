/**
 * DriverCard — full-detail card for a selected nearby driver.
 *
 * Vehicle identity is primary (emoji + colour/make/model, larger).
 * Person identity (display_name · @handle) is the secondary line.
 *
 * This card appears in the bottom sheet's "selected driver" slot.
 * The compact list uses DriverListItem instead.
 *
 * Privacy:
 *  - Only approximate_distance_m is shown; no coordinates.
 *  - DND drivers: speaking indicator is suppressed entirely.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppCard } from './AppCard';
import { AppButton } from './AppButton';
import { SpeakingIndicator } from './SpeakingIndicator';
import { Colors } from '@/theme/colors';
import { useUnits } from '@/hooks/useUnits';
import { FontSize, FontWeight } from '@/theme/typography';
import { Radius, Spacing } from '@/theme/spacing';
import type { NearbyDriverCard, VehicleType } from '@/services/types';

const VEHICLE_EMOJI: Record<VehicleType, string> = {
  car: '🚗',
  motorcycle: '🏍',
  truck: '🛻',
  van: '🚐',
  bicycle: '🚲',
  other: '🛞',
};

interface DriverCardProps {
  driver: NearbyDriverCard;
  onBlock?: () => void;
  onReport?: () => void;
}

export function DriverCard({ driver, onBlock, onReport }: DriverCardProps) {
  const { formatDistance } = useUnits();
  const emoji =
    driver.vehicle_type !== null ? VEHICLE_EMOJI[driver.vehicle_type] : '🚗';

  // PRIMARY identifier: colour + make + model (how you recognise it on road).
  const vehicleLine =
    [driver.vehicle_color, driver.vehicle_make, driver.vehicle_model]
      .filter((p): p is string => typeof p === 'string' && p.length > 0)
      .join(' ') ||
    driver.vehicle_label ||
    'Unknown vehicle';

  // SECONDARY identifier: display name + optional handle.
  const personLine =
    driver.handle !== null
      ? `${driver.display_name} · @${driver.handle}`
      : driver.display_name;

  const isSpeaking = driver.is_speaking && !driver.dnd;

  return (
    <AppCard
      elevation="floating"
      highlight={isSpeaking ? 'live' : undefined}
      padded
    >
      {/* ── Top row: avatar + identity + distance ── */}
      <View style={styles.topRow}>
        {/* Vehicle emoji in a rounded square avatar */}
        <View
          style={[
            styles.vehicleAvatar,
            isSpeaking && styles.vehicleAvatarSpeaking,
          ]}
        >
          <Text style={styles.vehicleEmoji}>{emoji}</Text>
        </View>

        <View style={styles.identity}>
          {/* PRIMARY: what you see on the road */}
          <Text style={styles.vehicleLine} numberOfLines={1}>
            {vehicleLine}
          </Text>
          {/* SECONDARY: who is driving */}
          <Text style={styles.personLine} numberOfLines={1}>
            {personLine}
          </Text>
          {/* META: distance · status (no exact coords; status reflects state) */}
          <Text style={styles.metaLine} numberOfLines={1}>
            {formatDistance(driver.approximate_distance_m, { approx: true })}
            {' · '}
            <Text
              style={
                driver.dnd
                  ? styles.metaDnd
                  : isSpeaking
                    ? styles.metaSpeaking
                    : styles.metaSilent
              }
            >
              {driver.dnd ? 'DND' : isSpeaking ? 'Speaking' : 'Silent'}
            </Text>
          </Text>
        </View>

        <View style={styles.distPill}>
          <Text style={styles.distText}>
            {formatDistance(driver.approximate_distance_m, { approx: true })}
          </Text>
        </View>
      </View>

      {/* ── Footer: voice status + moderation actions ── */}
      <View style={styles.footer}>
        {driver.dnd ? (
          <View style={styles.dndTag}>
            <Text style={styles.dndText} accessibilityLabel="Do Not Disturb">
              Do Not Disturb
            </Text>
          </View>
        ) : (
          <SpeakingIndicator active={driver.is_speaking} />
        )}

        <View style={styles.actions}>
          {onReport !== undefined && (
            <AppButton
              label="Report"
              variant="ghost"
              size="sm"
              onPress={onReport}
            />
          )}
          {onBlock !== undefined && (
            <AppButton
              label="Block"
              variant="secondary"
              size="sm"
              onPress={onBlock}
            />
          )}
        </View>
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md12,
  },
  vehicleAvatar: {
    width: 50,
    height: 50,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleAvatarSpeaking: {
    borderColor: Colors.live,
    backgroundColor: Colors.liveMuted,
  },
  vehicleEmoji: {
    fontSize: 26,
  },
  metaLine: {
    fontSize: FontSize.micro,
    color: Colors.textTertiary,
    fontWeight: FontWeight.medium,
    marginTop: 2,
  },
  metaSpeaking: {
    color: Colors.live,
    fontWeight: FontWeight.semibold,
  },
  metaSilent: {
    color: Colors.textSecondary,
  },
  metaDnd: {
    color: Colors.textTertiary,
    fontWeight: FontWeight.semibold,
  },
  identity: {
    flex: 1,
    gap: 3,
  },
  vehicleLine: {
    fontSize: FontSize.bodyLarge,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  personLine: {
    fontSize: FontSize.caption,
    color: Colors.textSecondary,
  },
  distPill: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md12,
    paddingVertical: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  distText: {
    fontSize: FontSize.bodySmall,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  footer: {
    marginTop: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  dndTag: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dndText: {
    fontSize: FontSize.caption,
    color: Colors.textTertiary,
    fontWeight: FontWeight.medium,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
});

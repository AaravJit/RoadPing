/**
 * RoomMemberCard — vehicle-first identity card for a room member.
 *
 * PRIMARY: vehicle emoji + colour/make/model (how you recognise them on road).
 * SECONDARY: display_name · @handle.
 * TERTIARY: speaking indicator, moderator badge, block/report actions.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppCard } from './AppCard';
import { AppButton } from './AppButton';
import { SpeakingIndicator } from './SpeakingIndicator';
import { Colors } from '@/theme/colors';
import { FontSize, FontWeight } from '@/theme/typography';
import { Radius, Spacing } from '@/theme/spacing';
import type { RoomMember } from '@/services/api';
import type { VehicleType } from '@/services/types';

const VEHICLE_EMOJI: Record<VehicleType, string> = {
  car: '🚗',
  motorcycle: '🏍',
  truck: '🛻',
  van: '🚐',
  bicycle: '🚲',
  other: '🛞',
};

interface RoomMemberCardProps {
  member: RoomMember;
  isSelf: boolean;
  onBlock?: () => void;
  onReport?: () => void;
}

export function RoomMemberCard({
  member,
  isSelf,
  onBlock,
  onReport,
}: RoomMemberCardProps) {
  const emoji =
    member.vehicle_type !== null ? VEHICLE_EMOJI[member.vehicle_type] : '🚗';

  // PRIMARY: what you'd see on the road
  const vehicleLine =
    [member.vehicle_color, member.vehicle_make, member.vehicle_model]
      .filter((p): p is string => typeof p === 'string' && p.length > 0)
      .join(' ') ||
    member.vehicle_label ||
    'Unknown vehicle';

  // SECONDARY: who is driving
  const personLine =
    member.handle !== null
      ? `${member.display_name} · @${member.handle}`
      : (member.display_name ?? 'Unknown');

  return (
    <AppCard
      elevation="floating"
      highlight={member.is_speaking ? 'live' : undefined}
      padded
    >
      {/* Top row: vehicle avatar + identity + self/mod badge */}
      <View style={styles.topRow}>
        <View style={styles.vehicleAvatar}>
          <Text style={styles.vehicleEmoji}>{emoji}</Text>
        </View>

        <View style={styles.identity}>
          <Text style={styles.vehicleLine} numberOfLines={1}>
            {vehicleLine}
          </Text>
          <Text style={styles.personLine} numberOfLines={1}>
            {personLine}
          </Text>
        </View>

        <View style={styles.badges}>
          {member.is_moderator && (
            <View style={styles.modBadge}>
              <Text style={styles.modBadgeText}>MOD</Text>
            </View>
          )}
          {isSelf && (
            <View style={styles.selfBadge}>
              <Text style={styles.selfBadgeText}>YOU</Text>
            </View>
          )}
        </View>
      </View>

      {/* Footer: speaking indicator + moderation actions */}
      <View style={styles.footer}>
        <SpeakingIndicator active={member.is_speaking} />

        {!isSelf && (onReport !== undefined || onBlock !== undefined) && (
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
        )}
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
  vehicleEmoji: {
    fontSize: 26,
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
  badges: {
    flexDirection: 'row',
    gap: Spacing.xs,
    alignItems: 'center',
  },
  modBadge: {
    backgroundColor: Colors.primaryMuted,
    borderRadius: Radius.xs,
    borderWidth: 1,
    borderColor: Colors.primary,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
  },
  modBadgeText: {
    fontSize: FontSize.micro,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
    letterSpacing: 1,
  },
  selfBadge: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.xs,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
  },
  selfBadgeText: {
    fontSize: FontSize.micro,
    fontWeight: FontWeight.semibold,
    color: Colors.textTertiary,
    letterSpacing: 1,
  },
  footer: {
    marginTop: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
});

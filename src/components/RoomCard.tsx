import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/theme/colors';
import { FontSize, FontWeight } from '@/theme/typography';
import { Radius, Spacing } from '@/theme/spacing';
import type { RoomRow } from '@/services/types';

interface RoomCardProps {
  room: RoomRow;
  isOwner: boolean;
  memberCount?: number;
  onPress: () => void;
}

export function RoomCard({ room, isOwner, memberCount, onPress }: RoomCardProps) {
  return (
    <Pressable
      style={styles.card}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open room ${room.name}`}
    >
      <View style={styles.topRow}>
        <View style={styles.titleWrap}>
          <Text style={styles.name} numberOfLines={1}>
            {room.name}
          </Text>
          {isOwner && (
            <View style={styles.ownerBadge}>
              <Text style={styles.ownerBadgeText}>OWNER</Text>
            </View>
          )}
        </View>
        <Text style={styles.chevron}>›</Text>
      </View>

      {room.description !== null && room.description.length > 0 && (
        <Text style={styles.description} numberOfLines={2}>
          {room.description}
        </Text>
      )}

      <View style={styles.metaRow}>
        <View style={styles.metaChip}>
          <Text style={styles.metaText}>🔒 Private</Text>
        </View>
        {memberCount !== undefined && (
          <View style={styles.metaChip}>
            <Text style={styles.metaText}>
              {memberCount} {memberCount === 1 ? 'member' : 'members'}
            </Text>
          </View>
        )}
        {room.invite_code !== null && (
          <View style={styles.codeChip}>
            <Text style={styles.codeText}>{room.invite_code}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  titleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  name: {
    fontSize: FontSize.bodyLarge,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    flexShrink: 1,
  },
  ownerBadge: {
    backgroundColor: Colors.primaryMuted,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.primary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  ownerBadgeText: {
    fontSize: FontSize.micro,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
    letterSpacing: 1,
  },
  chevron: {
    fontSize: FontSize.heading,
    color: Colors.textTertiary,
  },
  description: {
    fontSize: FontSize.caption,
    color: Colors.textSecondary,
    lineHeight: FontSize.caption * 1.5,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  metaChip: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md12,
    paddingVertical: Spacing.xs,
  },
  metaText: {
    fontSize: FontSize.caption,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  codeChip: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md12,
    paddingVertical: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  codeText: {
    fontSize: FontSize.caption,
    color: Colors.textTertiary,
    fontWeight: FontWeight.bold,
    letterSpacing: 1.5,
  },
});

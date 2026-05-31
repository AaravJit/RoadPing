/**
 * DriverListItem — compact row for the bottom sheet driver list.
 *
 * Vehicle identity is primary (larger, bolder): colour + make + model.
 * Person identity is secondary: display_name · @handle.
 *
 * This matches the in-car mental model: you recognise "the silver Honda
 * Civic" before you recognise "user_789".
 *
 * Privacy: only approximate_distance_m shown; no raw coordinates.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SpeakingIndicator } from './SpeakingIndicator';
import { Colors } from '@/theme/colors';
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

function fmtDist(m: number): string {
  if (m < 1000) return `${m} m`;
  const km = m / 1000;
  return km >= 10 ? `${Math.round(km)} km` : `${km.toFixed(1)} km`;
}

interface DriverListItemProps {
  driver: NearbyDriverCard;
  selected: boolean;
  onPress: () => void;
}

export function DriverListItem({
  driver,
  selected,
  onPress,
}: DriverListItemProps) {
  const emoji =
    driver.vehicle_type !== null ? VEHICLE_EMOJI[driver.vehicle_type] : '🚗';

  const vehicleLine =
    [driver.vehicle_color, driver.vehicle_make, driver.vehicle_model]
      .filter((p): p is string => typeof p === 'string' && p.length > 0)
      .join(' ') ||
    driver.vehicle_label ||
    'Unknown vehicle';

  const personLine =
    driver.handle !== null
      ? `${driver.display_name} · @${driver.handle}`
      : driver.display_name;

  const isSpeaking = driver.is_speaking && !driver.dnd;
  const statusLabel = driver.dnd
    ? 'DND'
    : isSpeaking
      ? 'Speaking'
      : 'Silent';

  return (
    <Pressable
      style={[
        styles.row,
        isSpeaking && styles.rowSpeaking,
        selected && styles.rowSelected,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${vehicleLine}, ${personLine}, ${statusLabel}`}
      accessibilityState={{ selected }}
    >
      <View
        style={[
          styles.emojiWrap,
          isSpeaking && styles.emojiWrapSpeaking,
          selected && styles.emojiWrapSelected,
        ]}
      >
        <Text style={styles.emoji}>{emoji}</Text>
      </View>

      <View style={styles.info}>
        <Text style={styles.vehicleLine} numberOfLines={1}>
          {vehicleLine}
        </Text>
        <Text style={styles.personLine} numberOfLines={1}>
          {personLine}
        </Text>
        <Text style={styles.metaLine} numberOfLines={1}>
          ~{fmtDist(driver.approximate_distance_m)}
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
            {statusLabel}
          </Text>
        </Text>
      </View>

      {isSpeaking && <SpeakingIndicator active compact />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md12,
    paddingVertical: Spacing.md12,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  rowSpeaking: {
    borderColor: Colors.live,
  },
  rowSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryMuted,
  },
  emojiWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiWrapSpeaking: {
    borderColor: Colors.live,
    backgroundColor: Colors.liveMuted,
  },
  emojiWrapSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryMuted,
  },
  emoji: {
    fontSize: 22,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  vehicleLine: {
    fontSize: FontSize.body,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  personLine: {
    fontSize: FontSize.caption,
    color: Colors.textSecondary,
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
});

/**
 * VehicleCard — a vehicle as a Wallet-style card.
 *
 * The card is the vehicle's identity: body-type emoji, the generated label,
 * year/make/model, and a strip in the car's paint color when known. The
 * primary vehicle carries a "Primary" tag with a star (text + symbol, never
 * color alone). Tapping the card opens its actions (handled by the screen).
 */
import React from 'react';
import { ActivityIndicator, View } from 'react-native';

import { AppText, Icon, PressableScale } from '@/components/ui';
import type { VehicleRow } from '@/services/types';
import { bodyTypeEmoji, bodyTypeLabel, bodyTypeSqlToUi } from '@/services/vehicle';
import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import { Radius, Spacing } from '@/theme/spacing';
import { vehicleSwatch } from './identity';

interface VehicleCardProps {
  vehicle: VehicleRow;
  onPress: () => void;
  /** True while an action on this card is in flight. */
  busy?: boolean;
}

export function VehicleCard({ vehicle, onPress, busy = false }: VehicleCardProps) {
  const { colors, accent } = useTheme();
  const styles = useStyles();
  const bodyUi = vehicle.body_type !== null ? bodyTypeSqlToUi(vehicle.body_type) : null;
  const swatch = vehicleSwatch(vehicle.color);
  const details = [
    vehicle.year !== null ? String(vehicle.year) : null,
    vehicle.make,
    vehicle.model,
  ].filter((p): p is string => typeof p === 'string' && p.length > 0);
  const meta = [bodyUi !== null ? bodyTypeLabel(bodyUi) : null, vehicle.color]
    .filter((p): p is string => typeof p === 'string' && p.length > 0)
    .join(' · ');

  return (
    <PressableScale
      onPress={onPress}
      disabled={busy}
      pressedScale={0.98}
      style={[styles.card, vehicle.is_active && { borderColor: accent.fill, borderWidth: 2 }]}
      accessibilityRole="button"
      accessibilityLabel={`${vehicle.label}${vehicle.is_active ? ', primary vehicle' : ''}. ${details.join(' ')}`}
      accessibilityHint="Shows vehicle options"
    >
      <View style={[styles.band, { backgroundColor: swatch ?? colors.fill }]} />
      <View style={styles.body}>
        <View style={styles.top}>
          <View style={styles.emojiWell}>
            <AppText variant="title1" maxScale={1.2}>
              {bodyUi !== null ? bodyTypeEmoji(bodyUi) : '🚗'}
            </AppText>
          </View>
          {vehicle.is_active && (
            <View style={[styles.primary, { backgroundColor: accent.muted }]}>
              <Icon name="star.fill" size={11} color={accent.text} />
              <AppText variant="caption1" weight="semibold" style={{ color: accent.text }}>
                Primary
              </AppText>
            </View>
          )}
          {busy && <ActivityIndicator color={colors.textSecondary} />}
        </View>
        <AppText variant="title3" weight="bold" numberOfLines={2}>
          {vehicle.label}
        </AppText>
        {details.length > 0 && (
          <AppText variant="subheadline" color="secondary" numberOfLines={1}>
            {details.join(' ')}
          </AppText>
        )}
        {meta.length > 0 && (
          <AppText variant="footnote" color="tertiary" numberOfLines={1}>
            {meta}
          </AppText>
        )}
      </View>
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  card: {
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    backgroundColor: t.colors.surface,
    overflow: 'hidden',
    borderWidth: t.a11y.increaseContrast ? 1 : 0,
    borderColor: t.colors.separatorStrong,
    shadowColor: t.colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: t.scheme === 'dark' ? 0 : 0.08,
    shadowRadius: 12,
  },
  band: {
    height: 8,
  },
  body: {
    padding: Spacing.md20,
    gap: Spacing.xs,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  emojiWell: {
    width: 56,
    height: 56,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    backgroundColor: t.colors.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
}));

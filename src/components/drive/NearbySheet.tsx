/**
 * NearbySheet — the list of nearby live drivers and a selected driver's
 * details, presented as a glass sheet over the map.
 *
 * Privacy: only the server's rounded distance is shown ("~0.4 mi"); there is
 * no direction and no position. Map placement is explained as approximate.
 */
import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { LoadingState } from '@/components/LoadingState';
import { SpeakingWave } from '@/components/SpeakingWave';
import {
  personHandle,
  personName,
  vehicleDescription,
  vehicleEmoji,
} from '@/components/identity';
import { AppText, Avatar, Button, Icon, Sheet } from '@/components/ui';
import { useUnits } from '@/hooks/useUnits';
import type { NearbyDriverCard } from '@/services/types';
import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH_TARGET, Radius, Spacing } from '@/theme/spacing';

// ─── Status line (never color alone) ──────────────────────────────────────────

function DriverStatus({ driver }: { driver: NearbyDriverCard }) {
  const { colors } = useTheme();
  if (driver.dnd) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Icon name="moon.fill" size={12} color={colors.textSecondary} />
        <AppText variant="footnote" color="secondary">
          Do Not Disturb
        </AppText>
      </View>
    );
  }
  if (driver.is_speaking) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <SpeakingWave active size={12} />
        <AppText variant="footnote" weight="semibold" color="live">
          Talking
        </AppText>
      </View>
    );
  }
  return null;
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function DriverRow({ driver, onPress }: { driver: NearbyDriverCard; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { formatDistance } = useUnits();
  const speaking = driver.is_speaking && !driver.dnd;
  const name = personName(driver);
  const vehicle = vehicleDescription(driver);
  const distance = formatDistance(driver.approximate_distance_m, { approx: true });

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.fill }]}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${vehicle}, about ${distance} away${
        driver.dnd ? ', Do Not Disturb' : speaking ? ', talking' : ''
      }`}
      accessibilityHint="Shows driver details"
    >
      <View style={styles.vehicleTile}>
        <AppText variant="title3" maxScale={1.2}>
          {vehicleEmoji(driver.vehicle_type)}
        </AppText>
      </View>
      <View style={styles.rowText}>
        <AppText variant="body" weight="semibold" numberOfLines={1}>
          {name}
        </AppText>
        <AppText variant="footnote" color="secondary" numberOfLines={1}>
          {vehicle}
        </AppText>
        <DriverStatus driver={driver} />
      </View>
      <AppText variant="subheadline" color="secondary" tabular>
        {distance}
      </AppText>
      <Icon name="chevron.right" size={13} color={colors.textTertiary} />
    </Pressable>
  );
}

// ─── Detail ───────────────────────────────────────────────────────────────────

function DriverDetail({
  driver,
  onReport,
  onBlock,
}: {
  driver: NearbyDriverCard;
  onReport: () => void;
  onBlock: () => void;
}) {
  const styles = useStyles();
  const { formatDistance } = useUnits();
  const speaking = driver.is_speaking && !driver.dnd;
  const name = personName(driver);
  const handle = personHandle(driver);

  return (
    <View style={styles.detail}>
      <View style={styles.detailHead}>
        <Avatar
          name={name}
          uri={driver.avatar_url}
          size={72}
          ring={speaking ? 'live' : undefined}
        />
        <AppText variant="title2" weight="bold" align="center" numberOfLines={2}>
          {name}
        </AppText>
        {handle !== null && handle !== name && (
          <AppText variant="subheadline" color="secondary">
            {handle}
          </AppText>
        )}
        <DriverStatus driver={driver} />
      </View>

      <View style={styles.facts}>
        <View style={styles.fact}>
          <AppText variant="footnote" color="secondary">
            Vehicle
          </AppText>
          <View style={styles.factValue}>
            <AppText variant="body">{vehicleEmoji(driver.vehicle_type)}</AppText>
            <AppText variant="body" weight="semibold" numberOfLines={2} style={styles.flex}>
              {vehicleDescription(driver)}
            </AppText>
          </View>
        </View>
        <View style={styles.factDivider} />
        <View style={styles.fact}>
          <AppText variant="footnote" color="secondary">
            Distance
          </AppText>
          <AppText variant="body" weight="semibold" tabular>
            About {formatDistance(driver.approximate_distance_m)}
          </AppText>
        </View>
      </View>

      <AppText variant="footnote" color="secondary">
        Distances are rounded, and map positions are approximate. RoadPing
        doesn't show which direction other drivers are.
      </AppText>

      <View style={styles.actions}>
        <Button
          label="Report"
          icon="flag.fill"
          variant="secondary"
          onPress={onReport}
          style={styles.flex}
        />
        <Button
          label="Block"
          icon="nosign"
          variant="destructive"
          onPress={onBlock}
          style={styles.flex}
        />
      </View>
    </View>
  );
}

// ─── Sheet ────────────────────────────────────────────────────────────────────

interface NearbySheetProps {
  visible: boolean;
  onClose: () => void;
  drivers: NearbyDriverCard[];
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  rangeLabel: string;
  selected: NearbyDriverCard | null;
  onSelect: (driver: NearbyDriverCard | null) => void;
  onReport: (driver: NearbyDriverCard) => void;
  onBlock: (driver: NearbyDriverCard) => void;
}

export function NearbySheet({
  visible,
  onClose,
  drivers,
  isLoading,
  error,
  onRetry,
  rangeLabel,
  selected,
  onSelect,
  onReport,
  onBlock,
}: NearbySheetProps) {
  const { accent } = useTheme();
  const styles = useStyles();

  if (selected !== null) {
    return (
      <Sheet
        visible={visible}
        onClose={onClose}
        material="glass"
        title="Driver"
        maxHeight={0.8}
      >
        <ScrollView contentContainerStyle={styles.scroll}>
          <Pressable
            onPress={() => onSelect(null)}
            style={styles.back}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Back to nearby drivers"
          >
            <Icon name="chevron.left" size={15} color={accent.text} />
            <AppText variant="body" style={{ color: accent.text }}>
              Nearby
            </AppText>
          </Pressable>
          <DriverDetail
            driver={selected}
            onReport={() => onReport(selected)}
            onBlock={() => onBlock(selected)}
          />
        </ScrollView>
      </Sheet>
    );
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      material="glass"
      title="Nearby"
      subtitle={`Live drivers within ${rangeLabel}`}
      maxHeight={0.75}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        {error !== null && (
          <ErrorState fill={false} title="Couldn't load nearby drivers" message={error} onRetry={onRetry} />
        )}
        {error === null && drivers.length === 0 && isLoading && (
          <LoadingState fill={false} message="Looking for live drivers…" />
        )}
        {error === null && drivers.length === 0 && !isLoading && (
          <EmptyState
            fill={false}
            icon="person.2.fill"
            title="No one nearby yet"
            message="Drivers appear here when they go live within your range. This updates on its own."
          />
        )}
        {drivers.length > 0 && (
          <View style={styles.list}>
            {drivers.map((d, i) => (
              <View key={d.user_id}>
                {i > 0 && <View style={styles.rowDivider} />}
                <DriverRow driver={d} onPress={() => onSelect(d)} />
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </Sheet>
  );
}

const useStyles = makeStyles((t) => ({
  scroll: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  list: {
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: t.material === 'glass' ? 'transparent' : t.colors.surface,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md12,
    minHeight: MIN_TOUCH_TARGET + 20,
    paddingHorizontal: Spacing.md12,
    paddingVertical: Spacing.sm,
  },
  rowDivider: {
    height: 0.5,
    marginLeft: 44 + Spacing.md12 * 2,
    backgroundColor: t.colors.separator,
  },
  vehicleTile: {
    width: 44,
    height: 44,
    borderRadius: Radius.sm,
    borderCurve: 'continuous',
    backgroundColor: t.colors.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: MIN_TOUCH_TARGET,
    alignSelf: 'flex-start',
  },
  detail: {
    gap: Spacing.md,
  },
  detailHead: {
    alignItems: 'center',
    gap: Spacing.xs,
  },
  facts: {
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    backgroundColor: t.colors.fill,
    paddingHorizontal: Spacing.md,
  },
  fact: {
    paddingVertical: Spacing.md12,
    gap: 2,
  },
  factValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  factDivider: {
    height: 0.5,
    backgroundColor: t.colors.separator,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.md12,
  },
  flex: {
    flex: 1,
  },
}));

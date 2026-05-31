/**
 * NearbyRadar — list view of nearby drivers shown while live.
 *
 * Renders DriverCard rows + empty / loading / error states. The radar visual
 * (concentric rings, map overlay) ships in a later phase; the list view is
 * the primary surface drivers will use while behind the wheel — large rows,
 * single-tap actions.
 *
 * Privacy: this component never sees raw coordinates. It only forwards the
 * already-rounded `approximate_distance_m` value from the server.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { DriverCard } from './DriverCard';
import { LoadingState } from './LoadingState';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { Colors } from '@/theme/colors';
import { FontSize, FontWeight } from '@/theme/typography';
import { Spacing } from '@/theme/spacing';
import type { NearbyDriverCard } from '@/services/types';

interface NearbyRadarProps {
  drivers: NearbyDriverCard[];
  isLoading: boolean;
  error: string | null;
  rangeM: number;
  onRetry: () => void;
  onBlock: (driver: NearbyDriverCard) => void;
  onReport: (driver: NearbyDriverCard) => void;
}

export function NearbyRadar({
  drivers,
  isLoading,
  error,
  rangeM,
  onRetry,
  onBlock,
  onReport,
}: NearbyRadarProps) {
  const rangeLabel = rangeM >= 1000 ? `${(rangeM / 1000).toFixed(1)} km` : `${rangeM} m`;

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Nearby drivers</Text>
        <Text style={styles.subtitle}>within {rangeLabel}</Text>
      </View>

      {error !== null ? (
        <ErrorState
          fill={false}
          title="Couldn't load nearby"
          message={error}
          onRetry={onRetry}
        />
      ) : drivers.length === 0 && isLoading ? (
        <LoadingState fill={false} message="Looking around…" />
      ) : drivers.length === 0 ? (
        <EmptyState
          fill={false}
          icon="🛣"
          title="All clear"
          message="No RoadPing drivers in range right now. The list updates every few seconds."
        />
      ) : (
        <View style={styles.list}>
          {drivers.map((d) => (
            <DriverCard
              key={d.user_id}
              driver={d}
              onBlock={() => onBlock(d)}
              onReport={() => onReport(d)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: FontSize.subheading,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: FontSize.bodySmall,
    color: Colors.textTertiary,
  },
  list: {
    gap: Spacing.sm,
  },
});

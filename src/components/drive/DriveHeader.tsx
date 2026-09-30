/**
 * DriveHeader — floating glass header over the Drive map.
 *
 *   [ ◉ RoadPing · Ready ]                          [ avatar ]
 *   [ ◉ RoadPing · LIVE  3 nearby ]                 [ avatar ]
 *
 * Status is always written out, never shown by color alone. The capsule is
 * informational (announced as one element); the avatar opens Profile.
 */
import React from 'react';
import { View } from 'react-native';

import { RoadPingLogo } from '@/components/RoadPingLogo';
import { AppText, Avatar, GlassGroup, GlassIconButton, GlassSurface } from '@/components/ui';
import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import { DRIVE_TOUCH_TARGET, Radius, Spacing } from '@/theme/spacing';
import { DRIVE_CHROME_MAX_SCALE } from '@/theme/typography';

export type DriveStatus = 'off' | 'ready' | 'starting' | 'live' | 'stopping' | 'hidden';

interface DriveHeaderProps {
  status: DriveStatus;
  nearbyCount: number;
  profileName: string | null;
  avatarUri: string | null;
  onOpenProfile: () => void;
  /** Screenshot/demo builds: make fixture data impossible to mistake. */
  demo?: boolean;
}

const STATUS_TEXT: Record<Exclude<DriveStatus, 'live'>, string> = {
  off: 'Off',
  ready: 'Ready',
  starting: 'Going live…',
  stopping: 'Ending…',
  hidden: 'Hidden in zone',
};

export function DriveHeader({
  status,
  nearbyCount,
  profileName,
  avatarUri,
  onOpenProfile,
  demo = false,
}: DriveHeaderProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const isLive = status === 'live';
  const nearbyText = `${nearbyCount} nearby`;

  const a11yLabel = isLive
    ? `RoadPing, live, ${nearbyCount} ${nearbyCount === 1 ? 'driver' : 'drivers'} nearby`
    : `RoadPing, ${STATUS_TEXT[status]}`;

  return (
    <GlassGroup spacing={Spacing.sm} style={styles.row}>
      <GlassSurface
        radius={Radius.full}
        style={styles.capsule}
        accessible
        accessibilityRole="header"
        accessibilityLabel={demo ? `${a11yLabel}, demo data` : a11yLabel}
        accessibilityLiveRegion="polite"
      >
        <RoadPingLogo size={26} road={false} />
        <AppText variant="headline" weight="bold" maxScale={DRIVE_CHROME_MAX_SCALE}>
          RoadPing
        </AppText>

        {isLive ? (
          <View style={styles.liveGroup}>
            <View style={[styles.livePill, { backgroundColor: colors.live }]}>
              <View style={[styles.liveDot, { backgroundColor: colors.textOnColor }]} />
              <AppText variant="caption1" weight="heavy" color="onColor" maxScale={1.2}>
                LIVE
              </AppText>
            </View>
            <AppText
              variant="subheadline"
              weight="semibold"
              color="secondary"
              numberOfLines={1}
              maxScale={DRIVE_CHROME_MAX_SCALE}
              tabular
            >
              {nearbyText}
            </AppText>
          </View>
        ) : (
          <View style={styles.liveGroup}>
            <View style={[styles.sep, { backgroundColor: colors.separatorStrong }]} />
            <AppText
              variant="subheadline"
              weight="semibold"
              color={status === 'hidden' ? 'warning' : 'secondary'}
              numberOfLines={1}
              maxScale={DRIVE_CHROME_MAX_SCALE}
            >
              {STATUS_TEXT[status]}
            </AppText>
          </View>
        )}
        {demo && (
          <View style={[styles.demo, { borderColor: colors.warning }]}>
            <AppText variant="caption2" weight="bold" color="warning" maxScale={1}>
              DEMO
            </AppText>
          </View>
        )}
      </GlassSurface>

      <GlassIconButton
        onPress={onOpenProfile}
        accessibilityLabel="Profile and settings"
        size={DRIVE_TOUCH_TARGET - 4}
      >
        <Avatar name={profileName} uri={avatarUri} size={DRIVE_TOUCH_TARGET - 14} self />
      </GlassIconButton>
    </GlassGroup>
  );
}

const useStyles = makeStyles(() => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  capsule: {
    flexShrink: 1,
    minHeight: DRIVE_TOUCH_TARGET - 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingLeft: Spacing.md12 - 2,
    paddingRight: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  liveGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexShrink: 1,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  sep: {
    width: 1,
    height: 16,
  },
  demo: {
    borderWidth: 1,
    borderRadius: Radius.xs,
    paddingHorizontal: 4,
  },
}));

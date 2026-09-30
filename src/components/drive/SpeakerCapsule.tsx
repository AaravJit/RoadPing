/**
 * SpeakerCapsule — who is talking right now, floating above the Voice Dock.
 *
 *   [ (avatar) Maya · Honda Civic · ½–1 mi   ▌▌▌ Talking  +1 ]
 *
 * Announces new speakers to VoiceOver. Proximity is the server's broad
 * distance band, the same one the Nearby sheet shows; never a single
 * distance and never a direction.
 */
import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Pressable, View } from 'react-native';

import { SpeakingWave } from '@/components/SpeakingWave';
import { personName, vehicleShort } from '@/components/identity';
import { AppText, Avatar, GlassSurface } from '@/components/ui';
import { useUnits } from '@/hooks/useUnits';
import type { NearbyDriverCard } from '@/services/types';
import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import { DRIVE_TOUCH_TARGET, Radius, Spacing } from '@/theme/spacing';
import { DRIVE_CHROME_MAX_SCALE } from '@/theme/typography';

interface SpeakerCapsuleProps {
  speaker: NearbyDriverCard;
  /** Others talking at the same time. */
  othersCount: number;
  onPress: () => void;
}

export function SpeakerCapsule({ speaker, othersCount, onPress }: SpeakerCapsuleProps) {
  const { colors, a11y } = useTheme();
  const styles = useStyles();
  const { formatBand, describeBand } = useUnits();
  const enter = useRef(new Animated.Value(0)).current;

  const name = personName(speaker);
  const vehicle = vehicleShort(speaker);
  const band = formatBand(speaker.distance_band);
  const spokenBand = describeBand(speaker.distance_band);

  useEffect(() => {
    enter.setValue(0);
    Animated.timing(enter, {
      toValue: 1,
      duration: a11y.reduceMotion ? 120 : 220,
      useNativeDriver: true,
    }).start();
    AccessibilityInfo.announceForAccessibility(`${name} is talking`);
  }, [speaker.user_id, enter, a11y.reduceMotion, name]);

  const motion = a11y.reduceMotion
    ? { opacity: enter }
    : {
        opacity: enter,
        transform: [
          { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
        ],
      };

  return (
    <Animated.View style={motion}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${name} is talking. ${vehicle}, ${spokenBand}.${
          othersCount > 0 ? ` ${othersCount} more talking.` : ''
        }`}
        accessibilityHint="Shows driver details"
      >
        <GlassSurface radius={Radius.full} interactive style={styles.capsule}>
          <Avatar name={name} uri={speaker.avatar_url} size={36} ring="live" />
          <View style={styles.text}>
            <AppText
              variant="subheadline"
              weight="semibold"
              numberOfLines={1}
              maxScale={DRIVE_CHROME_MAX_SCALE}
            >
              {name}
            </AppText>
            <AppText
              variant="caption1"
              color="secondary"
              numberOfLines={1}
              maxScale={DRIVE_CHROME_MAX_SCALE}
            >
              {vehicle} · {band}
            </AppText>
          </View>
          <View style={styles.talking}>
            <SpeakingWave active size={14} />
            <AppText variant="caption1" weight="semibold" color="live" maxScale={1.2}>
              Talking
            </AppText>
          </View>
          {othersCount > 0 && (
            <View style={[styles.more, { backgroundColor: colors.fill }]}>
              <AppText variant="caption1" weight="semibold" maxScale={1.2} tabular>
                +{othersCount}
              </AppText>
            </View>
          )}
        </GlassSurface>
      </Pressable>
    </Animated.View>
  );
}

const useStyles = makeStyles(() => ({
  capsule: {
    minHeight: DRIVE_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md12 - 2,
    paddingLeft: Spacing.xs + 2,
    paddingRight: Spacing.md,
    paddingVertical: Spacing.xs + 2,
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  talking: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs + 2,
  },
  more: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
}));

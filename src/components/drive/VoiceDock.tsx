/**
 * VoiceDock — the glass control surface at the bottom of Drive.
 *
 * Ready (not live):
 *   [ 🚗 Civic ▾ ] [ ◎ 3 mi ] [ ☾ DND ]
 *   (permission / private-zone / error notice, when relevant)
 *   [              Go Live               ]
 *   You're invisible until you go live.
 *
 * Live:
 *   [ ■ End ]      [ ◎ 3 mi ] [ ☾ DND ]
 *   [ Nearby 3 ]   (  HOLD TO TALK  )   [ Rooms ]
 *   Nearby channel · talk status only
 *
 * The End control never ends the session on its own: the screen confirms
 * through an action sheet, so a stray tap while driving can't drop you.
 * Every control is at least 44 pt (56 pt for the primary driving controls).
 */
import React from 'react';
import { Pressable, View } from 'react-native';

import { HoldToTalkButton } from '@/components/HoldToTalkButton';
import { AppText, Button, GlassSurface, Icon, Notice, haptic, type IconName } from '@/components/ui';
import type { HoldState } from '@/hooks/useHoldToTalk';
import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import {
  DRIVE_TOUCH_TARGET,
  MIN_TOUCH_TARGET,
  Radius,
  Spacing,
} from '@/theme/spacing';
import { DRIVE_CHROME_MAX_SCALE } from '@/theme/typography';

// ─── Chip ─────────────────────────────────────────────────────────────────────

interface DockChipProps {
  icon?: IconName;
  emoji?: string;
  label: string;
  onPress?: () => void;
  /** On/off controls (DND). Adds switch semantics and an "On" state. */
  toggled?: boolean;
  disabled?: boolean;
  accessibilityLabel: string;
  accessibilityHint?: string;
  grow?: boolean;
}

function DockChip({
  icon,
  emoji,
  label,
  onPress,
  toggled,
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
  grow = false,
}: DockChipProps) {
  const { colors, accent } = useTheme();
  const styles = useStyles();
  const on = toggled === true;
  const fg = on ? accent.text : colors.textPrimary;

  const content = (
    <>
      {emoji !== undefined && (
        <AppText variant="body" maxScale={1.2}>
          {emoji}
        </AppText>
      )}
      {icon !== undefined && <Icon name={icon} size={16} color={fg} />}
      <AppText
        variant="subheadline"
        weight="semibold"
        numberOfLines={1}
        maxScale={DRIVE_CHROME_MAX_SCALE}
        style={[styles.chipLabel, { color: fg }]}
      >
        {label}
      </AppText>
      {onPress !== undefined && toggled === undefined && (
        <Icon name="chevron.down" size={11} color={colors.textTertiary} />
      )}
    </>
  );

  const chipStyle = [
    styles.chip,
    grow && styles.chipGrow,
    { backgroundColor: on ? accent.muted : colors.fill },
    on && { borderColor: accent.fill, borderWidth: 1 },
  ];

  if (onPress === undefined) {
    return (
      <View style={chipStyle} accessible accessibilityLabel={accessibilityLabel}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => {
        haptic.selection();
        onPress();
      }}
      disabled={disabled}
      style={({ pressed }) => [chipStyle, (pressed || disabled) && styles.dim]}
      accessibilityRole={toggled !== undefined ? 'switch' : 'button'}
      accessibilityState={
        toggled !== undefined ? { checked: on, disabled } : { disabled }
      }
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
    >
      {content}
    </Pressable>
  );
}

// ─── Side control (Nearby / Rooms) ────────────────────────────────────────────

function SideControl({
  icon,
  label,
  badge,
  onPress,
  accessibilityLabel,
}: {
  icon: IconName;
  label: string;
  badge?: string;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      style={({ pressed }) => [styles.side, pressed && styles.dim]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <View style={[styles.sideWell, { backgroundColor: colors.fill }]}>
        <Icon name={icon} size={22} color={colors.textPrimary} />
        {badge !== undefined && (
          <View style={[styles.badge, { backgroundColor: colors.textPrimary }]}>
            <AppText
              variant="caption2"
              weight="bold"
              maxScale={1}
              tabular
              style={{ color: colors.background }}
            >
              {badge}
            </AppText>
          </View>
        )}
      </View>
      <AppText
        variant="caption1"
        weight="medium"
        color="secondary"
        numberOfLines={1}
        maxScale={DRIVE_CHROME_MAX_SCALE}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

// ─── Dock ─────────────────────────────────────────────────────────────────────

export interface VoiceDockNotice {
  key: string;
  tone: 'info' | 'warning' | 'danger';
  title?: string;
  message: string;
  actionLabel?: string;
  onPress?: () => void;
}

interface CommonProps {
  rangeLabel: string;
  dnd: boolean;
  dndBusy: boolean;
  onToggleDnd: (next: boolean) => void;
  notices: VoiceDockNotice[];
}

interface ReadyProps extends CommonProps {
  mode: 'ready';
  vehicleEmoji: string;
  vehicleLabel: string;
  onVehicle: () => void;
  onRange: () => void;
  starting: boolean;
  goLiveDisabled: boolean;
  onGoLive: () => void;
}

interface LiveProps extends CommonProps {
  mode: 'live';
  stopping: boolean;
  onEnd: () => void;
  nearbyCount: number;
  onNearby: () => void;
  onRooms: () => void;
  ptt: {
    state: HoldState;
    disabled: boolean;
    onPressIn: () => void;
    onPressOut: () => void;
    audioConnected: boolean;
  };
}

export type VoiceDockProps = ReadyProps | LiveProps;

export function VoiceDock(props: VoiceDockProps) {
  const styles = useStyles();
  const { rangeLabel, dnd, dndBusy, onToggleDnd, notices } = props;

  const dndChip = (
    <DockChip
      icon="moon.fill"
      label={dnd ? 'DND On' : 'DND'}
      toggled={dnd}
      disabled={dndBusy}
      onPress={() => onToggleDnd(!dnd)}
      accessibilityLabel="Do Not Disturb"
      accessibilityHint="Hides your talking status from nearby drivers and mutes room audio"
    />
  );

  const noticeViews = notices.map((n) => (
    <Notice
      key={n.key}
      tone={n.tone}
      title={n.title}
      message={n.message}
      actionLabel={n.actionLabel}
      onPress={n.onPress}
    />
  ));

  if (props.mode === 'ready') {
    return (
      <GlassSurface radius={Radius.xl} style={styles.dock}>
        <View style={styles.chipRow}>
          <DockChip
            emoji={props.vehicleEmoji}
            label={props.vehicleLabel}
            onPress={props.onVehicle}
            grow
            accessibilityLabel={`Vehicle, ${props.vehicleLabel}`}
            accessibilityHint="Opens your vehicles"
          />
          <DockChip
            icon="dot.radiowaves.left.and.right"
            label={rangeLabel}
            onPress={props.onRange}
            accessibilityLabel={`Range, ${rangeLabel}`}
            accessibilityHint="Changes how far away drivers can see you"
          />
          {dndChip}
        </View>
        {noticeViews}
        <Button
          label={props.starting ? 'Going Live…' : 'Go Live'}
          icon="antenna.radiowaves.left.and.right"
          size="lg"
          fullWidth
          loading={props.starting}
          disabled={props.goLiveDisabled}
          onPress={props.onGoLive}
          accessibilityHint="Lets nearby live drivers see you, with a broad distance range only, while RoadPing is open"
          style={styles.goLive}
        />
        <AppText variant="footnote" color="secondary" align="center" maxScale={DRIVE_CHROME_MAX_SCALE}>
          You're invisible until you go live.
        </AppText>
      </GlassSurface>
    );
  }

  const { ptt } = props;
  return (
    <GlassSurface radius={Radius.xl} style={styles.dock}>
      <View style={styles.chipRow}>
        <DockChip
          icon="stop.fill"
          label={props.stopping ? 'Ending…' : 'End'}
          onPress={props.onEnd}
          disabled={props.stopping}
          accessibilityLabel="End live session"
          accessibilityHint="Asks before you stop going live"
        />
        <View style={styles.flex} />
        <DockChip
          icon="dot.radiowaves.left.and.right"
          label={rangeLabel}
          accessibilityLabel={`Range, ${rangeLabel}. Change it when you're not live.`}
        />
        {dndChip}
      </View>

      {noticeViews}

      <View style={styles.talkRow}>
        <SideControl
          icon="person.2.fill"
          label="Nearby"
          badge={String(props.nearbyCount)}
          onPress={props.onNearby}
          accessibilityLabel={`Nearby drivers, ${props.nearbyCount}`}
        />
        <HoldToTalkButton
          state={ptt.state}
          disabled={ptt.disabled}
          onPressIn={ptt.onPressIn}
          onPressOut={ptt.onPressOut}
          audience="nearby drivers"
        />
        <SideControl
          icon="person.3.fill"
          label="Rooms"
          onPress={props.onRooms}
          accessibilityLabel="Rooms"
        />
      </View>

      <AppText
        variant="caption1"
        color="secondary"
        align="center"
        maxScale={DRIVE_CHROME_MAX_SCALE}
      >
        {ptt.audioConnected
          ? 'Nearby channel · audio on'
          : 'Nearby channel · drivers see when you talk'}
      </AppText>
    </GlassSurface>
  );
}

const useStyles = makeStyles(() => ({
  dock: {
    paddingHorizontal: Spacing.md12,
    paddingTop: Spacing.md12,
    paddingBottom: Spacing.md,
    gap: Spacing.md12,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  chip: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md12,
    borderRadius: Radius.full,
    borderCurve: 'continuous',
  },
  chipGrow: {
    flex: 1,
    minWidth: 0,
  },
  chipLabel: {
    flexShrink: 1,
  },
  dim: {
    opacity: 0.6,
  },
  flex: {
    flex: 1,
  },
  goLive: {
    minHeight: DRIVE_TOUCH_TARGET,
  },
  talkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.sm,
  },
  side: {
    alignItems: 'center',
    gap: Spacing.xs,
    minWidth: 72,
  },
  sideWell: {
    width: DRIVE_TOUCH_TARGET,
    height: DRIVE_TOUCH_TARGET,
    borderRadius: DRIVE_TOUCH_TARGET / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));

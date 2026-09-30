/**
 * app/drive.tsx — Drive: the full-screen map with floating glass controls.
 *
 *   ┌───────────────────────────────────────────┐
 *   │ [◉ RoadPing · LIVE 3 nearby]   [avatar]   │  DriveHeader (glass)
 *   │                                  [◎]      │  recenter (glass)
 *   │                                  [N]      │  compass (glass)
 *   │                 map                       │
 *   │ [ (Maya) Blue Civic · ~0.4 mi  Talking ]  │  SpeakerCapsule (glass)
 *   │ ┌───────────────────────────────────────┐ │
 *   │ │  End          3 mi   DND              │ │  VoiceDock (glass)
 *   │ │  Nearby   ( HOLD TO TALK )   Rooms    │ │
 *   │ └───────────────────────────────────────┘ │
 *   └───────────────────────────────────────────┘
 *
 * This screen owns orchestration only; every visual lives in
 * src/components/drive/* and src/components/ui/*.
 *
 * Hard product rules upheld (unchanged):
 *  - Exact coordinates are never displayed; nearby markers are synthetic.
 *  - Voice is hold-to-talk only; nothing is recorded.
 *  - Leaving the app ends the session (useAppLifecycleCleanup → stopSilent).
 *  - Ending the session always asks first, so it can't happen by accident.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ActionSheetIOS, Alert, Linking, Platform, StyleSheet, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LoadingState } from '@/components/LoadingState';
import { MapCompass } from '@/components/MapCompass';
import { NearbyMap } from '@/components/NearbyMap';
import { RangeSelector } from '@/components/RangeSelector';
import { ReportModal } from '@/components/ReportModal';
import { DriveHeader, type DriveStatus } from '@/components/drive/DriveHeader';
import { NearbySheet } from '@/components/drive/NearbySheet';
import { SpeakerCapsule } from '@/components/drive/SpeakerCapsule';
import { VoiceDock, type VoiceDockNotice } from '@/components/drive/VoiceDock';
import { personName } from '@/components/identity';
import { AppText, GlassIconButton, Sheet, haptic } from '@/components/ui';
import { useAppLifecycleCleanup } from '@/hooks/useAppLifecycleCleanup';
import { useAuth } from '@/hooks/useAuth';
import { useHoldToTalk } from '@/hooks/useHoldToTalk';
import { useLiveSession } from '@/hooks/useLiveSession';
import { useNearbyDrivers } from '@/hooks/useNearbyDrivers';
import { useProfile } from '@/hooks/useProfile';
import { useUnits } from '@/hooks/useUnits';
import { useVehicles } from '@/hooks/useVehicles';
import { SCREENSHOT_MODE } from '@/services/env';
import {
  getLocationPermissionStatus,
  getQuietCoords,
  requestLocationPermission,
  type Coords,
  type LocationPermissionStatus,
} from '@/services/location';
import { blockUser } from '@/services/moderation';
import { updateProfile } from '@/services/profile';
import type { NearbyDriverCard } from '@/services/types';
import { DEFAULT_RANGE_M } from '@/services/units';
import { bodyTypeEmoji, bodyTypeSqlToUi } from '@/services/vehicle';
import { makeStyles } from '@/theme/ThemeProvider';
import { DRIVE_TOUCH_TARGET, Spacing } from '@/theme/spacing';

const EDGE = Spacing.md12;

export default function DriveScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { formatRange } = useUnits();

  // ── Data hooks — ALL called unconditionally before any early return ─────────
  const { user, isLoading: authLoading } = useAuth();
  const { profile, isLoading: profileLoading, refresh: refreshProfile } =
    useProfile(user?.id ?? null);
  const {
    vehicles,
    primary,
    isLoading: vehiclesLoading,
    hasLoaded: vehiclesLoaded,
  } = useVehicles(user?.id ?? null);

  const live = useLiveSession({
    initialRangeM: profile?.default_range_m ?? DEFAULT_RANGE_M,
  });

  // Sync rangeM once with the profile default (fires only once after load).
  useEffect(() => {
    if (profile !== null && live.status === 'offline') {
      live.setRangeM(profile.default_range_m);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.default_range_m]);

  const isLive = live.status === 'live';

  const nearby = useNearbyDrivers({ enabled: isLive, rangeM: live.rangeM });

  const ptt = useHoldToTalk({
    enabled: isLive,
    liveSessionId: live.sessionId,
  });

  useAppLifecycleCleanup({
    enabled: isLive,
    cleanup: () => live.stopSilent(),
  });

  // ── Local UI state ─────────────────────────────────────────────────────────
  const [nearbyOpen, setNearbyOpen] = useState(false);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<NearbyDriverCard | null>(null);
  const [reportTarget, setReportTarget] = useState<NearbyDriverCard | null>(null);
  const [dndUpdating, setDndUpdating] = useState(false);
  const [dockHeight, setDockHeight] = useState(0);

  /** Best-effort quiet coords used to pre-center the map BEFORE going live.
   *  Never starts a session, never prompts; null until permission granted. */
  const [previewCoords, setPreviewCoords] = useState<Coords | null>(null);
  const [permStatus, setPermStatus] = useState<LocationPermissionStatus>('undetermined');
  const [recenterTick, setRecenterTick] = useState(0);
  const [mapHeading, setMapHeading] = useState(0);

  // Going offline closes live-only UI.
  useEffect(() => {
    if (!isLive) {
      setNearbyOpen(false);
      setSelectedDriver(null);
    }
  }, [isLive]);

  // Keep the selected driver's card fresh as nearby data updates, and drop it
  // if they leave range.
  useEffect(() => {
    if (selectedDriver === null) return;
    const fresh = nearby.drivers.find((d) => d.user_id === selectedDriver.user_id);
    if (fresh === undefined) setSelectedDriver(null);
    else if (fresh !== selectedDriver) setSelectedDriver(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nearby.drivers]);

  // On mount: read permission state and grab one quiet fix if available.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const s = await getLocationPermissionStatus();
      if (cancelled) return;
      setPermStatus(s);
      if (s === 'granted') {
        const c = await getQuietCoords();
        if (!cancelled && c !== null) setPreviewCoords(c);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Refresh permission status whenever the live session transitions — covers
  // the case where the user just granted permission via Go Live.
  useEffect(() => {
    void (async () => {
      const s = await getLocationPermissionStatus();
      setPermStatus(s);
      if (s === 'granted' && previewCoords === null && !isLive) {
        const c = await getQuietCoords();
        if (c !== null) setPreviewCoords(c);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.status]);

  // Feedback on transitions: success when live, a soft tick when it ends.
  const prevStatusRef = useRef(live.status);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = live.status;
    if (prev === live.status) return;
    if (live.status === 'live') haptic.success();
    else if (live.status === 'offline' && (prev === 'live' || prev === 'stopping')) haptic.stop();
  }, [live.status]);

  const mapCoords: Coords | null = live.userCoords ?? previewCoords;

  // ── Guards ─────────────────────────────────────────────────────────────────
  if (authLoading) return <LoadingState message="Starting…" />;
  if (user === null) return <Redirect href="/onboarding" />;
  if (profileLoading && profile === null) {
    return <LoadingState message="Loading profile…" />;
  }
  if (profile !== null && profile.handle === null) {
    return <Redirect href="/profile" />;
  }
  if (vehiclesLoading && !vehiclesLoaded) {
    return <LoadingState message="Loading vehicles…" />;
  }
  if (vehiclesLoaded && vehicles.length === 0) {
    return <Redirect href="/vehicle" />;
  }

  // ── Handlers ───────────────────────────────────────────────────────────────
  function handleGoLive() {
    void live.start(primary?.id ?? null);
  }

  /** Ending always goes through a confirmation sheet. */
  function handleEnd() {
    const message =
      'Nearby drivers stop seeing you on the map right away.';
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: 'End live session?',
          message,
          options: ['Stop Going Live', 'Stop & Hide Now', 'Cancel'],
          destructiveButtonIndex: 1,
          cancelButtonIndex: 2,
        },
        (index) => {
          if (index === 0) void live.stop();
          if (index === 1) void live.stopSilent();
        },
      );
      return;
    }
    Alert.alert('End live session?', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Stop & Hide Now', style: 'destructive', onPress: () => void live.stopSilent() },
      { text: 'Stop Going Live', onPress: () => void live.stop() },
    ]);
  }

  async function handleToggleDnd(value: boolean) {
    if (user === null || profile === null) return;
    setDndUpdating(true);
    try {
      await updateProfile(user.id, { dnd_mode: value });
      await refreshProfile();
    } catch {
      Alert.alert("Couldn't update Do Not Disturb", 'Please try again.');
    } finally {
      setDndUpdating(false);
    }
  }

  function handleBlock(driver: NearbyDriverCard) {
    const name = personName(driver);
    Alert.alert(
      `Block ${name}?`,
      "You won't see each other on RoadPing. They won't be told.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await blockUser({ blocked_user_id: driver.user_id });
                if (selectedDriver?.user_id === driver.user_id) {
                  setSelectedDriver(null);
                }
                Alert.alert('Blocked', `You won't see ${name} anymore.`);
                void nearby.refresh();
              } catch {
                Alert.alert("Couldn't block", 'Please try again.');
              }
            })();
          },
        },
      ],
    );
  }

  function handleReport(driver: NearbyDriverCard) {
    // Presented on top of the Nearby sheet; closing it returns there.
    setReportTarget(driver);
  }

  async function handleRequestLocation() {
    // Once iOS has been told "Don't Allow", only Settings can change it.
    if (permStatus === 'denied') {
      await Linking.openSettings();
      return;
    }
    const s = await requestLocationPermission();
    setPermStatus(s);
    if (s === 'granted') {
      const c = await getQuietCoords();
      if (c !== null) setPreviewCoords(c);
    }
  }

  function openDriver(driver: NearbyDriverCard) {
    setSelectedDriver(driver);
    setNearbyOpen(true);
  }

  // ── Derived display values ─────────────────────────────────────────────────
  const rangeLabel = formatRange(live.rangeM);
  const speaking = nearby.drivers.filter((d) => d.is_speaking && !d.dnd);
  const speaker = isLive ? (speaking[0] ?? null) : null;
  const primaryBodyUi =
    primary?.body_type != null ? bodyTypeSqlToUi(primary.body_type) : null;
  const primaryEmoji = primaryBodyUi !== null ? bodyTypeEmoji(primaryBodyUi) : '🚗';

  const status: DriveStatus =
    live.status === 'live'
      ? 'live'
      : live.status === 'starting'
        ? 'starting'
        : live.status === 'stopping'
          ? 'stopping'
          : live.hiddenInZone
            ? 'hidden'
            : permStatus === 'granted'
              ? 'ready'
              : 'off';

  const notices: VoiceDockNotice[] = [];
  if (!isLive && permStatus !== 'granted') {
    notices.push({
      key: 'location',
      tone: 'info',
      title: permStatus === 'denied' ? 'Location is off for RoadPing' : 'Location needed to go live',
      message: 'See and be seen by nearby live drivers while RoadPing is active.',
      actionLabel: permStatus === 'denied' ? 'Open Settings' : 'Allow Location',
      onPress: () => void handleRequestLocation(),
    });
  }
  if (!isLive && live.hiddenInZone) {
    notices.push({
      key: 'zone',
      tone: 'warning',
      title: "You're in a private zone",
      message: "RoadPing won't show you here. Move away from the zone to go live.",
      actionLabel: 'Manage Private Zones',
      onPress: () => router.push('/private-zones'),
    });
  }
  if (!isLive && live.error !== null && !live.hiddenInZone) {
    notices.push({ key: 'error', tone: 'danger', title: "Couldn't go live", message: live.error });
  }
  if (isLive && ptt.micPermissionDenied) {
    notices.push({
      key: 'mic',
      tone: 'warning',
      title: 'Microphone is off',
      message: 'Allow microphone access in Settings to talk.',
      actionLabel: 'Open Settings',
      onPress: () => void Linking.openSettings(),
    });
  }

  const headerTop = insets.top + Spacing.xs;
  const controlsTop = headerTop + DRIVE_TOUCH_TARGET + Spacing.md12;
  const dockBottom = Math.max(insets.bottom, EDGE);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      <NearbyMap
        drivers={isLive ? nearby.drivers : []}
        rangeM={live.rangeM}
        selectedDriverId={selectedDriver?.user_id ?? null}
        isLive={isLive}
        userCoords={mapCoords}
        userVehicleEmoji={primaryBodyUi !== null ? bodyTypeEmoji(primaryBodyUi) : null}
        onMarkerPress={openDriver}
        recenterTick={recenterTick}
        onHeadingChange={setMapHeading}
        topInset={controlsTop}
        bottomInset={dockHeight + dockBottom}
      />

      {/* Header */}
      <View pointerEvents="box-none" style={[styles.header, { top: headerTop }]}>
        <DriveHeader
          status={status}
          nearbyCount={nearby.drivers.length}
          profileName={profile?.display_name ?? profile?.handle ?? null}
          avatarUri={profile?.avatar_url ?? null}
          onOpenProfile={() => router.push('/settings')}
          demo={SCREENSHOT_MODE}
        />
      </View>

      {/* Map controls */}
      {mapCoords !== null && (
        <View pointerEvents="box-none" style={[styles.controls, { top: controlsTop }]}>
          <GlassIconButton
            icon="location.fill"
            onPress={() => setRecenterTick((t) => t + 1)}
            accessibilityLabel="Recenter map"
            accessibilityHint="Centers the map on your position"
            size={48}
          />
          <MapCompass heading={mapHeading} />
        </View>
      )}

      {/* Speaker + dock */}
      <View
        pointerEvents="box-none"
        style={[styles.bottom, { bottom: dockBottom }]}
      >
        {speaker !== null && (
          <View style={styles.speaker}>
            <SpeakerCapsule
              speaker={speaker}
              othersCount={speaking.length - 1}
              onPress={() => openDriver(speaker)}
            />
          </View>
        )}
        <View onLayout={(e) => setDockHeight(e.nativeEvent.layout.height)}>
          {isLive || live.status === 'stopping' ? (
            <VoiceDock
              mode="live"
              rangeLabel={rangeLabel}
              dnd={profile?.dnd_mode ?? false}
              dndBusy={dndUpdating || profile === null}
              onToggleDnd={(v) => void handleToggleDnd(v)}
              notices={notices}
              stopping={live.status === 'stopping'}
              onEnd={handleEnd}
              nearbyCount={nearby.drivers.length}
              onNearby={() => {
                setSelectedDriver(null);
                setNearbyOpen(true);
              }}
              onRooms={() => router.push('/rooms')}
              ptt={{
                state: ptt.state,
                disabled: ptt.isDisabled,
                onPressIn: ptt.onPressIn,
                onPressOut: ptt.onPressOut,
                audioConnected: ptt.voiceConnected,
              }}
            />
          ) : (
            <VoiceDock
              mode="ready"
              rangeLabel={rangeLabel}
              dnd={profile?.dnd_mode ?? false}
              dndBusy={dndUpdating || profile === null}
              onToggleDnd={(v) => void handleToggleDnd(v)}
              notices={notices}
              vehicleEmoji={primaryEmoji}
              vehicleLabel={primary?.label ?? 'Add a vehicle'}
              onVehicle={() => router.push('/vehicle')}
              onRange={() => setRangeOpen(true)}
              starting={live.status === 'starting'}
              goLiveDisabled={permStatus === 'denied'}
              onGoLive={handleGoLive}
            />
          )}
        </View>
      </View>

      <NearbySheet
        visible={nearbyOpen}
        onClose={() => {
          setNearbyOpen(false);
          setSelectedDriver(null);
        }}
        drivers={nearby.drivers}
        isLoading={nearby.isLoading}
        error={nearby.error}
        onRetry={() => void nearby.refresh()}
        rangeLabel={rangeLabel}
        selected={selectedDriver}
        onSelect={setSelectedDriver}
        onReport={handleReport}
        onBlock={handleBlock}
      />

      <Sheet
        visible={rangeOpen}
        onClose={() => setRangeOpen(false)}
        material="glass"
        title="Range"
        subtitle="How far away live drivers can see you, and you them."
      >
        <View style={styles.rangeBody}>
          <RangeSelector value={live.rangeM} onChange={live.setRangeM} />
          <AppText variant="footnote" color="secondary">
            Used when you go live. Set your default in Settings.
          </AppText>
        </View>
      </Sheet>

      <ReportModal
        visible={reportTarget !== null}
        driver={reportTarget}
        context="map"
        onClose={() => setReportTarget(null)}
        onSubmitted={() => {
          void nearby.refresh();
        }}
      />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  header: {
    ...StyleSheet.absoluteFillObject,
    bottom: undefined,
    paddingHorizontal: EDGE,
  },
  controls: {
    position: 'absolute',
    right: EDGE,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  bottom: {
    position: 'absolute',
    left: EDGE,
    right: EDGE,
    gap: Spacing.sm,
  },
  speaker: {
    alignSelf: 'stretch',
  },
  rangeBody: {
    paddingHorizontal: Spacing.md20,
    paddingBottom: Spacing.md,
    gap: Spacing.md12,
  },
}));

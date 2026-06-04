/**
 * app/drive.tsx — map-first Drive screen.
 *
 * Layout (both modes share the same map background):
 *
 *   ┌─────────────────────────────────────────┐
 *   │  [Floating header — position: absolute] │  ← brand, status, stats, profile
 *   │                                         │
 *   │      [MockMapView — fills screen]       │  ← driver markers, "YOU" dot
 *   │                                         │
 *   │          [PTT — above sheet]  (live)    │
 *   ├─────────────────────────────────────────┤
 *   │  [Bottom sheet (live) / Panel (offline)]│  ← tap handle to expand/collapse
 *   └─────────────────────────────────────────┘
 *
 * Phase 7: real location permissions, real Edge Function calls, real MapView.
 * Offline → radar canvas (MockMapView). Live + coords → real map (NearbyMap).
 *
 * Hard product rules upheld:
 *  - Exact coordinates never displayed.
 *  - Voice is hold-to-talk only; no persistent recording.
 *  - "Hide" → stopSilent() clears local state immediately.
 *  - App background → stopSilent() via useAppLifecycleCleanup.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Linking,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/AppButton';
import { DriverCard } from '@/components/DriverCard';
import { DriverListItem } from '@/components/DriverListItem';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { HoldToTalkButton } from '@/components/HoldToTalkButton';
import { LoadingState } from '@/components/LoadingState';
import { NearbyMap } from '@/components/NearbyMap';
import { MapCompass } from '@/components/MapCompass';
import { RangeSelector } from '@/components/RangeSelector';
import { ReportModal } from '@/components/ReportModal';
import { StatusPill } from '@/components/StatusPill';
import { Colors } from '@/theme/colors';
import { FontSize, FontWeight } from '@/theme/typography';
import { Radius, Spacing } from '@/theme/spacing';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useVehicles } from '@/hooks/useVehicles';
import { useLiveSession } from '@/hooks/useLiveSession';
import { useNearbyDrivers } from '@/hooks/useNearbyDrivers';
import { useHoldToTalk } from '@/hooks/useHoldToTalk';
import { useAppLifecycleCleanup } from '@/hooks/useAppLifecycleCleanup';
import { useUnits } from '@/hooks/useUnits';
import { DEFAULT_RANGE_M } from '@/services/units';
import { bodyTypeEmoji, bodyTypeSqlToUi } from '@/services/vehicle';
import { updateProfile } from '@/services/profile';
import { blockUser } from '@/services/moderation';
import {
  getLocationPermissionStatus,
  getQuietCoords,
  requestLocationPermission,
  type Coords,
  type LocationPermissionStatus,
} from '@/services/location';
import { SCREENSHOT_MODE } from '@/services/env';
import type { NearbyDriverCard } from '@/services/types';

// ─── Layout constants ─────────────────────────────────────────────────────────

/**
 * Height of the always-visible sheet header:
 * handle pill area (28px) + gap (8px) + summary+buttons row (~56px) +
 * bottom padding (12px) + border (1px) = ~105 → 116 with breathing room.
 */
const SHEET_COLLAPSED = 116;

/** Expanded sheet — enough for selected-driver card + 4-5 list items. */
const SHEET_EXPANDED = 380;

/**
 * Vertical gap between the PTT button's bottom edge and the sheet's top.
 * The PTT position is fixed relative to the collapsed sheet height so the
 * button stays visible when collapsed and is covered by the sheet when expanded
 * (the user collapses the sheet to access PTT again — standard UX pattern).
 */
const PTT_GAP = 10;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTimer(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ─── DriveScreen ──────────────────────────────────────────────────────────────

export default function DriveScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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

  // ── Bottom sheet animation + drag ──────────────────────────────────────────
  const sheetAnim = useRef(new Animated.Value(SHEET_COLLAPSED)).current;
  const [sheetExpanded, setSheetExpanded] = useState(false);
  // Mirror of sheetExpanded readable inside the (stable) PanResponder closure.
  const sheetExpandedRef = useRef(false);
  sheetExpandedRef.current = sheetExpanded;
  // Sheet height captured at the moment a drag starts.
  const dragBaseRef = useRef(SHEET_COLLAPSED);

  function animateSheet(toValue: number) {
    Animated.spring(sheetAnim, {
      toValue,
      useNativeDriver: false,
      speed: 14,
      bounciness: 4,
    }).start();
  }

  function toggleSheet() {
    const next = !sheetExpanded;
    setSheetExpanded(next);
    animateSheet(next ? SHEET_EXPANDED : SHEET_COLLAPSED);
  }

  function expandSheet() {
    if (!sheetExpanded) {
      setSheetExpanded(true);
      animateSheet(SHEET_EXPANDED);
    }
  }

  /**
   * Drag-to-resize for the live bottom sheet, built on RN's core PanResponder
   * (no extra gesture library). Attached to the sheet header only, so the
   * driver list still scrolls and the Stop/Hide buttons still tap:
   *   • Claims the gesture only on a clear vertical move (>6px, mostly vertical)
   *     — taps fall through to the handle / buttons.
   *   • Drag up grows the sheet toward SHEET_EXPANDED; drag down shrinks it.
   *   • On release, a flick (velocity) or crossing the midpoint snaps open/closed.
   */
  const sheetPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_evt, g) =>
        Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: () => {
        dragBaseRef.current = sheetExpandedRef.current
          ? SHEET_EXPANDED
          : SHEET_COLLAPSED;
      },
      onPanResponderMove: (_evt, g) => {
        let next = dragBaseRef.current - g.dy; // up (negative dy) → taller
        if (next < SHEET_COLLAPSED) next = SHEET_COLLAPSED;
        if (next > SHEET_EXPANDED) next = SHEET_EXPANDED;
        sheetAnim.setValue(next);
      },
      onPanResponderRelease: (_evt, g) => {
        const projected = dragBaseRef.current - g.dy;
        const midpoint = (SHEET_COLLAPSED + SHEET_EXPANDED) / 2;
        const expand =
          g.vy < -0.4 ? true : g.vy > 0.4 ? false : projected > midpoint;
        setSheetExpanded(expand);
        animateSheet(expand ? SHEET_EXPANDED : SHEET_COLLAPSED);
      },
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  // Reset sheet when going offline.
  useEffect(() => {
    if (!isLive) {
      sheetAnim.setValue(SHEET_COLLAPSED);
      setSheetExpanded(false);
      setSelectedDriver(null);
    }
    // sheetAnim is a stable ref — safe to omit from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive]);

  // ── Local UI state ─────────────────────────────────────────────────────────
  const [now, setNow] = useState<number>(Date.now());
  const [selectedDriver, setSelectedDriver] = useState<NearbyDriverCard | null>(
    null,
  );
  const [reportTarget, setReportTarget] = useState<NearbyDriverCard | null>(
    null,
  );
  const [dndUpdating, setDndUpdating] = useState(false);
  // Start screen stays clean: the range chips are hidden until the driver taps
  // "Change" on the compact "Live range" row.
  const [rangeEditorOpen, setRangeEditorOpen] = useState(false);

  // ── Map permanent-display state ────────────────────────────────────────────
  /** Best-effort quiet coords used to pre-center the map BEFORE going live.
   *  Never starts a session, never prompts; null until permission already
   *  granted. */
  const [previewCoords, setPreviewCoords] = useState<Coords | null>(null);
  const [permStatus, setPermStatus] = useState<LocationPermissionStatus>(
    'undetermined',
  );
  const [recenterTick, setRecenterTick] = useState(0);
  // Live camera heading (degrees, 0 = north-up) surfaced by the map for the compass.
  const [mapHeading, setMapHeading] = useState(0);

  // On mount: poll permission state and grab one quiet fix if available.
  useEffect(() => {
    let cancelled = false;
    (async () => {
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
  // the case where the user just granted permission via the Start flow.
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

  // The map's "user" position: live coords win, else last-known preview.
  const mapCoords: Coords | null = live.userCoords ?? previewCoords;

  // 1-second wall-clock tick for the live timer label.
  useEffect(() => {
    if (!isLive) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isLive]);

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
  async function handleStart() {
    await live.start(primary?.id ?? null);
  }

  function handleStop() {
    void live.stop();
  }

  function handleStopAndHide() {
    Alert.alert(
      'Stop & Hide',
      'You will disappear from nearby radar immediately.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Stop & Hide',
          style: 'destructive',
          onPress: () => {
            void live.stopSilent();
          },
        },
      ],
    );
  }

  async function handleToggleDnd(value: boolean) {
    if (user === null || profile === null) return;
    setDndUpdating(true);
    try {
      await updateProfile(user.id, { dnd_mode: value });
      await refreshProfile();
    } catch {
      Alert.alert('Could not update', 'Please try again.');
    } finally {
      setDndUpdating(false);
    }
  }

  function handleBlock(driver: NearbyDriverCard) {
    const label =
      driver.handle !== null ? `@${driver.handle}` : driver.display_name;
    Alert.alert(
      'Block driver?',
      `You and ${label} will become invisible to each other.`,
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
                Alert.alert('Blocked', "You won't see each other anymore.");
                void nearby.refresh();
              } catch {
                Alert.alert('Block failed', 'Please try again.');
              }
            })();
          },
        },
      ],
    );
  }

  function handleReport(driver: NearbyDriverCard) {
    setReportTarget(driver);
  }

  function handleOpenProfile() {
    router.push('/profile');
  }

  function handleRecenter() {
    setRecenterTick((t) => t + 1);
  }

  async function handleRequestLocation() {
    // Once iOS has been told "Deny", the system won't show the prompt again;
    // the only path forward is the user toggling permission in Settings.
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

  function selectDriver(driver: NearbyDriverCard) {
    // Toggle: tap the selected marker again to deselect.
    setSelectedDriver((prev) =>
      prev?.user_id === driver.user_id ? null : driver,
    );
    expandSheet();
  }

  // ── Derived display values ─────────────────────────────────────────────────
  const elapsedMs = live.startedAt !== null ? now - live.startedAt : 0;
  const heartbeatSec = Math.floor(live.msSinceHeartbeat / 1000);
  const heartbeatVariant: 'online' | 'away' =
    heartbeatSec > 20 ? 'away' : 'online';
  const rangeLabel = formatRange(live.rangeM);
  const speakingDriver =
    nearby.drivers.find((d) => d.is_speaking && !d.dnd) ?? null;
  const primaryBodyUi =
    primary?.body_type != null ? bodyTypeSqlToUi(primary.body_type) : null;

  /**
   * PTT button sits at a fixed position above the collapsed sheet.
   * When the sheet expands it slides over the PTT — the user collapses
   * the sheet to regain access to the button (standard bottom-sheet UX).
   */
  const pttBottom = SHEET_COLLAPSED + insets.bottom + PTT_GAP;

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      {/* ── 1. Full-screen map background (always visible) ───────────── */}
      <NearbyMap
        drivers={isLive ? nearby.drivers : []}
        rangeM={live.rangeM}
        selectedDriverId={selectedDriver?.user_id ?? null}
        isLive={isLive}
        userCoords={mapCoords}
        userVehicleEmoji={
          primaryBodyUi !== null ? bodyTypeEmoji(primaryBodyUi) : null
        }
        onMarkerPress={selectDriver}
        recenterTick={recenterTick}
        onHeadingChange={setMapHeading}
      />

      {/* ── 2. Floating header (position: absolute, top) ──────────────── */}
      <View
        pointerEvents="box-none"
        style={[styles.headerOuter, { paddingTop: insets.top + Spacing.sm }]}
      >
        <View style={styles.headerCard}>
          {/* Row 1: brand wordmark + profile avatar */}
          <View style={styles.headerRow1}>
            <Text style={styles.brandName}>RoadPing</Text>

            <View style={styles.headerRow1Right}>
              {!isLive && (
                <StatusPill variant="offline" label="Offline" />
              )}
              <Pressable
                onPress={handleOpenProfile}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Open profile"
              >
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarLetter}>
                    {profile?.display_name?.[0]?.toUpperCase() ?? '?'}
                  </Text>
                </View>
              </Pressable>
            </View>
          </View>

          {/* Row 2 (live only): status pill + nearby count + range + timer */}
          {isLive && (
            <View style={styles.headerRow2}>
              <StatusPill variant="live" label="LIVE" />
              <Text style={styles.nearbyCount}>
                {nearby.drivers.length} nearby
              </Text>
              <View style={styles.rangeChip}>
                <Text style={styles.rangeChipText}>{rangeLabel}</Text>
              </View>
              <View style={styles.row2Spacer} />
              <Text style={styles.timerText}>{formatTimer(elapsedMs)}</Text>
              <StatusPill variant={heartbeatVariant} label={`${heartbeatSec}s`} />
            </View>
          )}
        </View>
      </View>

      {/* Demo-mode badge — only visible when EXPO_PUBLIC_SCREENSHOT_MODE=true.
          Ensures testers/reviewers can never mistake fixture data for live
          activity. */}
      {SCREENSHOT_MODE && (
        <View
          style={[styles.demoBadge, { top: insets.top + Spacing.huge + Spacing.lg }]}
          pointerEvents="none"
        >
          <Text style={styles.demoBadgeText}>DEMO DATA</Text>
        </View>
      )}

      {/* ── 2b. Compass (top-left) ───────────────────────────────────── */}
      {mapCoords !== null && (
        <View
          pointerEvents="none"
          style={[
            styles.compassWrap,
            { top: insets.top + Spacing.huge + Spacing.lg, left: Spacing.md },
          ]}
        >
          <MapCompass heading={mapHeading} />
        </View>
      )}

      {/* ── 2c. Floating recenter button ─────────────────────────────── */}
      {mapCoords !== null && (
        <Pressable
          onPress={handleRecenter}
          hitSlop={12}
          style={[
            styles.recenterBtn,
            {
              top: insets.top + Spacing.huge + Spacing.lg,
              right: Spacing.md,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Recenter map on your location"
        >
          <Text style={styles.recenterGlyph}>◎</Text>
        </Pressable>
      )}

      {/* ── 3. Hold-to-Talk (live only) — floats above collapsed sheet ── */}
      {isLive && (
        <View
          pointerEvents="box-none"
          style={[styles.pttFloat, { bottom: pttBottom }]}
        >
          <HoldToTalkButton
            state={ptt.state}
            disabled={ptt.isDisabled}
            onPressIn={ptt.onPressIn}
            onPressOut={ptt.onPressOut}
          />
          {ptt.micPermissionDenied && (
            <Text style={styles.micDeniedNote}>
              Mic access denied — allow it in Settings
            </Text>
          )}
        </View>
      )}

      {/* ── 4a. Live bottom sheet ─────────────────────────────────────── */}
      {isLive && (
        <Animated.View style={[styles.sheet, { height: sheetAnim }]}>
          {/* Sheet header — always visible; drag anywhere here to resize */}
          <View style={styles.sheetHeader} {...sheetPan.panHandlers}>
            {/* Drag handle — tap to expand / collapse, or swipe up/down */}
            <Pressable
              onPress={toggleSheet}
              style={styles.handleArea}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={
                sheetExpanded ? 'Collapse driver list' : 'Expand driver list'
              }
            >
              <View style={styles.handle} />
            </Pressable>

            {/* Summary row: driver count + speaking note + Stop/Hide buttons */}
            <View style={styles.sheetSummaryRow}>
              <Pressable
                onPress={toggleSheet}
                style={styles.sheetSummaryText}
                hitSlop={4}
              >
                <Text style={styles.sheetNearbyCount}>
                  {nearby.drivers.length > 0
                    ? `${nearby.drivers.length} driver${nearby.drivers.length === 1 ? '' : 's'} nearby`
                    : 'No drivers nearby'}
                </Text>
                {speakingDriver !== null && (
                  <Text style={styles.sheetSpeakingNote} numberOfLines={1}>
                    · {speakingDriver.display_name} is speaking
                  </Text>
                )}
              </Pressable>

              <View style={styles.sheetStopBtns}>
                <AppButton
                  label="Stop"
                  variant="secondary"
                  size="sm"
                  loading={live.status === 'stopping'}
                  disabled={live.status === 'stopping'}
                  onPress={handleStop}
                />
                <AppButton
                  label="Hide"
                  variant="danger"
                  size="sm"
                  disabled={live.status === 'stopping'}
                  onPress={handleStopAndHide}
                />
              </View>
            </View>
          </View>

          {/* Expanded scrollable content */}
          <ScrollView
            style={styles.sheetScroll}
            contentContainerStyle={styles.sheetScrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Error */}
            {nearby.error !== null && (
              <ErrorState
                fill={false}
                title="Couldn't load nearby"
                message={nearby.error}
                onRetry={() => {
                  void nearby.refresh();
                }}
              />
            )}

            {/* Loading */}
            {nearby.drivers.length === 0 &&
              nearby.isLoading &&
              nearby.error === null && (
                <LoadingState fill={false} message="Looking around…" />
              )}

            {/* Empty */}
            {nearby.drivers.length === 0 &&
              !nearby.isLoading &&
              nearby.error === null && (
                <EmptyState
                  fill={false}
                  icon="🛣"
                  title="No drivers nearby yet"
                  message={`You're live within ${formatRange(live.rangeM)}. Updates every few seconds.`}
                />
              )}

            {/* Selected driver full card */}
            {selectedDriver !== null && (
              <DriverCard
                driver={selectedDriver}
                onReport={() => handleReport(selectedDriver)}
                onBlock={() => handleBlock(selectedDriver)}
              />
            )}

            {/* Compact driver list */}
            {nearby.drivers.length > 0 && (
              <View style={styles.driverList}>
                {nearby.drivers.map((d) => (
                  <DriverListItem
                    key={d.user_id}
                    driver={d}
                    selected={selectedDriver?.user_id === d.user_id}
                    onPress={() => selectDriver(d)}
                  />
                ))}
              </View>
            )}
          </ScrollView>

          {/* Safe area inset at bottom of sheet */}
          <View style={{ height: insets.bottom }} />
        </Animated.View>
      )}

      {/* ── 4b. Offline bottom panel ──────────────────────────────────── */}
      {!isLive && (
        <View
          style={[
            styles.offlinePanel,
            { paddingBottom: insets.bottom + Spacing.md },
          ]}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.offlineScroll}
            keyboardShouldPersistTaps="handled"
          >
            {/* Primary vehicle shortcut */}
            {primary !== null && (
              <Pressable
                style={styles.vehicleRow}
                onPress={() => router.push('/vehicle')}
                accessibilityRole="button"
                accessibilityLabel={`Primary vehicle: ${primary.label}. Tap to manage.`}
              >
                <Text style={styles.vehicleEmoji}>
                  {primaryBodyUi !== null ? bodyTypeEmoji(primaryBodyUi) : '🚗'}
                </Text>
                <View style={styles.vehicleInfo}>
                  <Text style={styles.vehicleLabel} numberOfLines={1}>
                    {primary.label}
                  </Text>
                  <Text style={styles.vehicleSub} numberOfLines={1}>
                    {[primary.year, primary.make, primary.model]
                      .filter(
                        (p): p is string | number =>
                          p !== null && p !== '' && p !== undefined,
                      )
                      .join(' ') || 'Tap to edit'}
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            )}

            {/* Compact live-range control — keeps the Start view clean.
                Shows a subtle "Live range · 3 mi" line; tap "Change" to reveal
                the preset chips. Full control also lives in Settings. */}
            <View style={styles.rangeCompact}>
              <Pressable
                style={styles.rangeCompactRow}
                onPress={() => setRangeEditorOpen((o) => !o)}
                accessibilityRole="button"
                accessibilityLabel={
                  rangeEditorOpen
                    ? 'Hide range options'
                    : `Live range ${formatRange(live.rangeM)}. Tap to change.`
                }
              >
                <View style={styles.rangeCompactText}>
                  <Text style={styles.rangeCompactLabel}>Live range</Text>
                  <Text style={styles.rangeCompactValue}>
                    {formatRange(live.rangeM)}
                  </Text>
                </View>
                <Text style={styles.rangeCompactAction}>
                  {rangeEditorOpen ? 'Done' : 'Change'}
                </Text>
              </Pressable>

              {rangeEditorOpen && (
                <View style={styles.rangeCompactEditor}>
                  <RangeSelector
                    value={live.rangeM}
                    onChange={live.setRangeM}
                  />
                </View>
              )}
            </View>

            {/* Do Not Disturb toggle */}
            {profile !== null && (
              <View style={styles.dndRow}>
                <View style={styles.dndTextBlock}>
                  <Text style={styles.dndTitle}>Do Not Disturb</Text>
                  <Text style={styles.dndHint}>
                    Hides your speaking indicator from nearby drivers
                  </Text>
                </View>
                <Switch
                  value={profile.dnd_mode}
                  onValueChange={(v) => {
                    void handleToggleDnd(v);
                  }}
                  disabled={dndUpdating}
                  trackColor={{
                    false: Colors.border,
                    true: Colors.primaryMuted,
                  }}
                  thumbColor={
                    profile.dnd_mode ? Colors.primary : Colors.textTertiary
                  }
                />
              </View>
            )}

            {/* Location permission required banner */}
            {permStatus !== 'granted' && (
              <View style={styles.permCard}>
                <Text style={styles.permTitle}>
                  📍 Location needed to go live
                </Text>
                <Text style={styles.permBody}>
                  RoadPing uses your location only while active to show nearby
                  drivers. No history is stored, and your exact coordinates are
                  never shared.
                </Text>
                <AppButton
                  label={
                    permStatus === 'denied'
                      ? 'Open iOS Settings'
                      : 'Enable location'
                  }
                  variant="primary"
                  size="md"
                  fullWidth
                  onPress={() => {
                    void handleRequestLocation();
                  }}
                />
              </View>
            )}

            {/* Private zone banner — shown when session was blocked/stopped by a zone */}
            {live.hiddenInZone && (
              <Pressable
                style={styles.zoneBanner}
                onPress={() => router.push('/private-zones')}
                accessibilityRole="button"
                accessibilityLabel="Hidden in private zone — tap to manage zones"
              >
                <Text style={styles.zoneBannerTitle}>
                  🔒 Hidden in private zone
                </Text>
                <Text style={styles.zoneBannerNote}>
                  RoadPing paused. Move away from the zone to go live.
                  Tap to manage zones →
                </Text>
              </Pressable>
            )}

            {/* Generic error banner */}
            {live.error !== null && !live.hiddenInZone && (
              <View style={styles.errorBanner} accessibilityRole="alert">
                <Text style={styles.errorText}>{live.error}</Text>
              </View>
            )}

            {/* Start button */}
            <AppButton
              label={
                live.status === 'starting' ? 'Starting…' : 'Start RoadPing  →'
              }
              variant="primary"
              size="lg"
              fullWidth
              loading={live.status === 'starting'}
              disabled={permStatus === 'denied'}
              onPress={() => {
                void handleStart();
              }}
            />

            {/* Privacy + safety note */}
            <Text style={styles.privacyNote}>
              🔒 Invisible until you go live. No location history. No recordings.
            </Text>
            <Text style={styles.privacyNote}>
              Use RoadPing only when it is safe and legal to do so.
            </Text>
          </ScrollView>
        </View>
      )}

      {/* ── Report modal ──────────────────────────────────────────────── */}
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

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0C0C14',
  },

  // ── Floating header ──────────────────────────────────────────────────────────
  headerOuter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.md,
  },
  headerCard: {
    backgroundColor: 'rgba(10, 10, 20, 0.88)',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md12,
    gap: Spacing.sm,
  },
  headerRow1: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerRow1Right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  brandName: {
    fontSize: FontSize.heading,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primaryMuted,
    borderWidth: 2,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontSize: FontSize.body,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
  },
  headerRow2: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  nearbyCount: {
    fontSize: FontSize.bodySmall,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
  },
  rangeChip: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md12,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  rangeChipText: {
    fontSize: FontSize.caption,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
  },
  row2Spacer: {
    flex: 1,
  },
  timerText: {
    fontSize: FontSize.bodySmall,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },

  // ── PTT float ────────────────────────────────────────────────────────────────
  pttFloat: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  micDeniedNote: {
    marginTop: Spacing.xs,
    fontSize: FontSize.caption,
    color: Colors.error,
    textAlign: 'center',
    backgroundColor: 'rgba(10, 10, 20, 0.88)',
    paddingHorizontal: Spacing.md12,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },

  // ── Bottom sheet (live) ──────────────────────────────────────────────────────
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(17, 17, 17, 0.96)',
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  sheetHeader: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md12,
    gap: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  handleArea: {
    alignItems: 'center',
    paddingTop: Spacing.md12,
    paddingBottom: Spacing.sm,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
  },
  sheetSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  sheetSummaryText: {
    flex: 1,
    gap: 2,
  },
  sheetNearbyCount: {
    fontSize: FontSize.bodySmall,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  sheetSpeakingNote: {
    fontSize: FontSize.caption,
    color: Colors.live,
    fontWeight: FontWeight.medium,
  },
  sheetStopBtns: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  sheetScroll: {
    flex: 1,
  },
  sheetScrollContent: {
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  driverList: {
    gap: Spacing.sm,
  },

  // ── Demo badge (screenshot mode) ─────────────────────────────────────────────
  demoBadge: {
    position: 'absolute',
    alignSelf: 'center',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  demoBadgeText: {
    backgroundColor: 'rgba(255, 107, 53, 0.95)',
    color: '#0A0A0A',
    fontSize: FontSize.micro,
    fontWeight: FontWeight.bold,
    letterSpacing: 1.5,
    paddingHorizontal: Spacing.md12,
    paddingVertical: 4,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },

  // ── Compass (top-left overlay) ───────────────────────────────────────────────
  compassWrap: {
    position: 'absolute',
  },

  // ── Recenter button ──────────────────────────────────────────────────────────
  recenterBtn: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(10, 10, 20, 0.92)',
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 6,
  },
  recenterGlyph: {
    fontSize: 22,
    color: Colors.primary,
    fontWeight: FontWeight.bold,
    marginTop: -2,
  },

  // ── Permission card ──────────────────────────────────────────────────────────
  permCard: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.primary,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  permTitle: {
    fontSize: FontSize.body,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  permBody: {
    fontSize: FontSize.caption,
    color: Colors.textSecondary,
    lineHeight: FontSize.caption * 1.55,
  },

  // ── Offline panel ─────────────────────────────────────────────────────────────
  offlinePanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '60%',
    backgroundColor: 'rgba(17, 17, 17, 0.96)',
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: Colors.border,
    paddingTop: Spacing.lg,
  },
  offlineScroll: {
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },

  // Vehicle shortcut row
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md12,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  vehicleEmoji: {
    fontSize: 28,
  },
  vehicleInfo: {
    flex: 1,
    gap: 2,
  },
  vehicleLabel: {
    fontSize: FontSize.body,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  vehicleSub: {
    fontSize: FontSize.caption,
    color: Colors.textSecondary,
  },
  chevron: {
    fontSize: FontSize.heading,
    color: Colors.textTertiary,
    paddingRight: Spacing.xs,
  },

  // Compact live-range control
  rangeCompact: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  rangeCompactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    minHeight: 56,
  },
  rangeCompactText: {
    flex: 1,
    gap: 2,
  },
  rangeCompactLabel: {
    fontSize: FontSize.caption,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: FontWeight.semibold,
  },
  rangeCompactValue: {
    fontSize: FontSize.body,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  rangeCompactAction: {
    fontSize: FontSize.bodySmall,
    fontWeight: FontWeight.semibold,
    color: Colors.primary,
  },
  rangeCompactEditor: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },

  // DND toggle row
  dndRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dndTextBlock: {
    flex: 1,
    gap: 2,
  },
  dndTitle: {
    fontSize: FontSize.body,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  dndHint: {
    fontSize: FontSize.caption,
    color: Colors.textSecondary,
  },

  // Private zone banner
  zoneBanner: {
    backgroundColor: Colors.warningMuted,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.warning,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  zoneBannerTitle: {
    fontSize: FontSize.bodySmall,
    fontWeight: FontWeight.semibold,
    color: Colors.warning,
  },
  zoneBannerNote: {
    fontSize: FontSize.caption,
    color: Colors.textSecondary,
    lineHeight: FontSize.caption * 1.5,
  },

  // Error banner
  errorBanner: {
    backgroundColor: Colors.errorMuted,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.error,
    padding: Spacing.md,
  },
  errorText: {
    fontSize: FontSize.bodySmall,
    color: Colors.error,
    textAlign: 'center',
  },

  // Privacy note
  privacyNote: {
    fontSize: FontSize.caption,
    color: Colors.textTertiary,
    textAlign: 'center',
    lineHeight: FontSize.caption * 1.5,
    paddingHorizontal: Spacing.sm,
  },
});

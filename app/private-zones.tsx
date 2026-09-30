/**
 * app/private-zones.tsx — Private zones management screen.
 *
 * Owners can create, edit, and delete their private zones.
 * Zones suppress live-session visibility: when the user is inside one of
 * their own zones, RoadPing refuses to start (or ends the session silently).
 *
 * Privacy guarantees upheld here:
 *  - Raw coordinates (center) are NEVER shown — only the name, kind, radius.
 *  - Zones are invisible to all other users (enforced by RLS).
 *  - Location is only requested when the user taps "Create Zone Here".
 */
import React, { useState } from 'react';
import { ActionSheetIOS, Alert, Platform, ScrollView, View } from 'react-native';
import { Redirect } from 'expo-router';

import { EmptyState } from '@/components/EmptyState';
import { LoadingState } from '@/components/LoadingState';
import {
  AppText,
  Button,
  ListRow,
  ListSection,
  Notice,
  ScreenScroll,
  SegmentedControl,
  Sheet,
  TextField,
  type IconName,
} from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { usePrivateZones } from '@/hooks/usePrivateZones';
import { useUnits } from '@/hooks/useUnits';
import {
  getCurrentCoords,
  getLocationPermissionStatus,
  requestLocationPermission,
  type Coords,
} from '@/services/location';
import { ZONE_KIND_LABEL, ZONE_RADIUS_PRESETS, type ZoneKind } from '@/services/privateZones';
import type { PrivateZoneRow } from '@/services/types';
import { closestPresetIndex, zoneRadiusPresetsFor } from '@/services/units';
import { makeStyles } from '@/theme/ThemeProvider';
import { SCREEN_INSET, Spacing } from '@/theme/spacing';

const KIND_OPTIONS: ZoneKind[] = ['home', 'work', 'custom'];

const KIND_ICON: Record<ZoneKind, IconName> = {
  home: 'house.fill',
  work: 'briefcase.fill',
  custom: 'mappin.circle.fill',
};

// ─── ZoneForm ────────────────────────────────────────────────────────────────

interface ZoneFormProps {
  /** Populated for edit, null for create. */
  initial: { name: string; kind: ZoneKind; radius_m: number } | null;
  isMutating: boolean;
  onSave: (name: string, kind: ZoneKind, radius_m: number) => void;
}

function ZoneForm({ initial, isMutating, onSave }: ZoneFormProps) {
  const styles = useStyles();
  const { system } = useUnits();
  const radiusPresets = zoneRadiusPresetsFor(system);
  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState<ZoneKind>(initial?.kind ?? 'custom');
  const [radius, setRadius] = useState(initial?.radius_m ?? ZONE_RADIUS_PRESETS[2].value);
  const [nameError, setNameError] = useState<string | null>(null);
  const selectedRadius = radiusPresets[closestPresetIndex(radiusPresets, radius)]?.value ?? radius;

  function validate(): boolean {
    if (name.trim().length === 0) {
      setNameError('Name is required.');
      return false;
    }
    if (name.trim().length > 80) {
      setNameError('Name must be 80 characters or fewer.');
      return false;
    }
    setNameError(null);
    return true;
  }

  function handleSave() {
    if (!validate()) return;
    onSave(name.trim(), kind, radius);
  }

  return (
    <ScrollView
      contentContainerStyle={styles.form}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <TextField
        label="Name"
        placeholder="e.g. Home"
        value={name}
        onChangeText={(t) => {
          setName(t);
          if (nameError !== null) setNameError(null);
        }}
        error={nameError}
        maxLength={80}
        autoCapitalize="words"
        returnKeyType="done"
      />

      <View style={styles.field}>
        <AppText variant="footnote" color="secondary" weight="medium">
          Type
        </AppText>
        <SegmentedControl<ZoneKind>
          segments={KIND_OPTIONS.map((k) => ({ value: k, label: ZONE_KIND_LABEL[k] }))}
          value={kind}
          onChange={setKind}
          accessibilityLabel="Zone type"
        />
      </View>

      <View style={styles.field}>
        <AppText variant="footnote" color="secondary" weight="medium">
          Radius
        </AppText>
        <SegmentedControl<number>
          segments={radiusPresets.map((p) => ({ value: p.value, label: p.label }))}
          value={selectedRadius}
          onChange={setRadius}
          accessibilityLabel="Zone radius"
        />
        <AppText variant="footnote" color="secondary">
          RoadPing hides you within this distance of the zone.
        </AppText>
      </View>

      <Button
        label={initial !== null ? 'Save Changes' : 'Create Zone'}
        size="lg"
        fullWidth
        loading={isMutating}
        onPress={handleSave}
      />
    </ScrollView>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

type FormMode = { kind: 'create'; coords: Coords } | { kind: 'edit'; zone: PrivateZoneRow } | null;

export default function PrivateZonesScreen() {
  const styles = useStyles();
  const { formatRange } = useUnits();
  const { user, isLoading: authLoading } = useAuth();
  const { zones, isLoading, isMutating, error, create, update, remove } = usePrivateZones();

  const [form, setForm] = useState<FormMode>(null);
  const [locating, setLocating] = useState(false);

  if (authLoading) return <LoadingState message="Starting…" />;
  if (user === null) return <Redirect href="/onboarding" />;

  async function handleCreateTap() {
    setLocating(true);
    try {
      let perm = await getLocationPermissionStatus();
      if (perm !== 'granted') {
        perm = await requestLocationPermission();
      }
      if (perm !== 'granted') {
        Alert.alert(
          'Location needed',
          'Allow location access in Settings so RoadPing can create a zone where you are now.',
        );
        return;
      }
      const coords = await getCurrentCoords();
      setForm({ kind: 'create', coords });
    } catch {
      Alert.alert("Couldn't get your location", 'Please try again.');
    } finally {
      setLocating(false);
    }
  }

  async function handleSave(name: string, kind: ZoneKind, radius_m: number) {
    if (form === null) return;
    try {
      if (form.kind === 'create') {
        await create({ name, kind, radius_m, coords: form.coords });
      } else {
        await update(form.zone.id, { name, kind, radius_m });
      }
      setForm(null);
    } catch (e) {
      Alert.alert(
        form.kind === 'create' ? "Couldn't create zone" : "Couldn't update zone",
        e instanceof Error ? e.message : 'Please try again.',
      );
    }
  }

  function confirmDelete(zone: PrivateZoneRow) {
    Alert.alert(
      `Delete "${zone.name}"?`,
      "You'll be visible in this area again when you go live.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await remove(zone.id);
              } catch (e) {
                Alert.alert("Couldn't delete zone", e instanceof Error ? e.message : 'Please try again.');
              }
            })();
          },
        },
      ],
    );
  }

  function openZoneActions(zone: PrivateZoneRow) {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: zone.name,
          options: ['Edit', 'Delete Zone', 'Cancel'],
          destructiveButtonIndex: 1,
          cancelButtonIndex: 2,
        },
        (i) => {
          if (i === 0) setForm({ kind: 'edit', zone });
          if (i === 1) confirmDelete(zone);
        },
      );
      return;
    }
    Alert.alert(zone.name, undefined, [
      { text: 'Edit', onPress: () => setForm({ kind: 'edit', zone }) },
      { text: 'Delete Zone', style: 'destructive', onPress: () => confirmDelete(zone) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <ScreenScroll>
      <View style={styles.inset}>
        <Notice
          icon="lock.shield.fill"
          title="RoadPing hides you inside your zones"
          message="When you're inside a zone, you can't go live and nearby drivers can't see you. No one else can see your zones."
        />
      </View>

      {error !== null && (
        <View style={styles.inset}>
          <Notice tone="danger" title="Couldn't load zones" message={error} />
        </View>
      )}

      {isLoading && zones.length === 0 && <LoadingState fill={false} message="Loading zones…" />}

      {!isLoading && zones.length === 0 && error === null && (
        <EmptyState
          fill={false}
          icon="mappin.circle.fill"
          title="No private zones"
          message="Add a zone to stay invisible near home, work, or anywhere private."
        />
      )}

      {zones.length > 0 && (
        <ListSection>
          {zones.map((zone) => (
            <ListRow
              key={zone.id}
              icon={KIND_ICON[zone.kind]}
              iconTone="accent"
              title={zone.name}
              subtitle={`${ZONE_KIND_LABEL[zone.kind]} · ${formatRange(zone.radius_m)} radius`}
              onPress={() => openZoneActions(zone)}
              accessibilityHint="Edit or delete this zone"
            />
          ))}
        </ListSection>
      )}

      <View style={styles.inset}>
        <Button
          label={locating ? 'Getting Location…' : 'Create Zone Here'}
          icon="plus"
          size="lg"
          fullWidth
          loading={locating}
          onPress={() => void handleCreateTap()}
        />
        <AppText variant="footnote" color="secondary" align="center" style={styles.footer}>
          A zone is centered where you are when you tap Create Zone Here.
          Its exact location is never shown or shared.
        </AppText>
      </View>

      <Sheet
        visible={form !== null}
        onClose={() => setForm(null)}
        title={form?.kind === 'edit' ? 'Edit Zone' : 'New Zone'}
        maxHeight={0.9}
      >
        {form !== null && (
          <ZoneForm
            key={form.kind === 'edit' ? form.zone.id : 'create'}
            initial={
              form.kind === 'edit'
                ? { name: form.zone.name, kind: form.zone.kind, radius_m: form.zone.radius_m }
                : null
            }
            isMutating={isMutating}
            onSave={(n, k, r) => void handleSave(n, k, r)}
          />
        )}
      </Sheet>
    </ScreenScroll>
  );
}

const useStyles = makeStyles(() => ({
  inset: {
    paddingHorizontal: SCREEN_INSET,
    gap: Spacing.md12,
  },
  footer: {
    paddingHorizontal: Spacing.md,
  },
  form: {
    paddingHorizontal: Spacing.md20,
    paddingBottom: Spacing.md,
    gap: Spacing.lg,
  },
  field: {
    gap: Spacing.sm,
  },
}));

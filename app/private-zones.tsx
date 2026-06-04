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
 *  - Location is only requested when the user taps "Create zone here."
 */
import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
} from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/AppButton';
import { AppInput } from '@/components/AppInput';
import { EmptyState } from '@/components/EmptyState';
import { LoadingState } from '@/components/LoadingState';
import { Colors } from '@/theme/colors';
import { FontSize, FontWeight } from '@/theme/typography';
import { Radius, Spacing } from '@/theme/spacing';
import { useAuth } from '@/hooks/useAuth';
import { usePrivateZones } from '@/hooks/usePrivateZones';
import { useUnits } from '@/hooks/useUnits';
import { closestPresetIndex, zoneRadiusPresetsFor } from '@/services/units';
import {
  ZONE_KIND_ICON,
  ZONE_KIND_LABEL,
  ZONE_RADIUS_PRESETS,
  type ZoneKind,
} from '@/services/privateZones';
import {
  getCurrentCoords,
  getLocationPermissionStatus,
  requestLocationPermission,
  type Coords,
} from '@/services/location';
import type { PrivateZoneRow } from '@/services/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const KIND_OPTIONS: ZoneKind[] = ['home', 'work', 'custom'];

// ─── ZoneRow ─────────────────────────────────────────────────────────────────

interface ZoneRowProps {
  zone: PrivateZoneRow;
  onEdit: () => void;
  onDelete: () => void;
}

function ZoneRow({ zone, onEdit, onDelete }: ZoneRowProps) {
  const { formatRange } = useUnits();
  return (
    <View style={zoneRowStyles.wrap}>
      <View style={zoneRowStyles.info}>
        <Text style={zoneRowStyles.icon}>{ZONE_KIND_ICON[zone.kind]}</Text>
        <View style={zoneRowStyles.text}>
          <Text style={zoneRowStyles.name} numberOfLines={1}>
            {zone.name}
          </Text>
          <Text style={zoneRowStyles.meta}>
            {ZONE_KIND_LABEL[zone.kind]} · {formatRange(zone.radius_m)} radius
          </Text>
        </View>
      </View>
      <View style={zoneRowStyles.actions}>
        <Pressable
          onPress={onEdit}
          style={zoneRowStyles.actionBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${zone.name}`}
        >
          <Text style={zoneRowStyles.editLabel}>Edit</Text>
        </Pressable>
        <Pressable
          onPress={onDelete}
          style={zoneRowStyles.actionBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${zone.name}`}
        >
          <Text style={zoneRowStyles.deleteLabel}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );
}

const zoneRowStyles = StyleSheet.create({
  wrap: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  info: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md12,
  },
  icon: {
    fontSize: 24,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: FontSize.body,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  meta: {
    fontSize: FontSize.caption,
    color: Colors.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.md,
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  actionBtn: {
    paddingVertical: Spacing.xs,
  },
  editLabel: {
    fontSize: FontSize.bodySmall,
    fontWeight: FontWeight.medium,
    color: Colors.primary,
  },
  deleteLabel: {
    fontSize: FontSize.bodySmall,
    fontWeight: FontWeight.medium,
    color: Colors.error,
  },
});

// ─── ZoneForm ────────────────────────────────────────────────────────────────

interface ZoneFormProps {
  /** Populated for edit, null for create. */
  initial: { name: string; kind: ZoneKind; radius_m: number } | null;
  isMutating: boolean;
  onSave: (name: string, kind: ZoneKind, radius_m: number) => void;
  onCancel: () => void;
}

function ZoneForm({ initial, isMutating, onSave, onCancel }: ZoneFormProps) {
  const { system } = useUnits();
  const radiusPresets = zoneRadiusPresetsFor(system);
  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState<ZoneKind>(initial?.kind ?? 'custom');
  const [radius, setRadius] = useState(
    initial?.radius_m ?? ZONE_RADIUS_PRESETS[2].value,
  );
  const [nameError, setNameError] = useState<string | null>(null);
  const selectedRadiusIndex = closestPresetIndex(radiusPresets, radius);

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
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
    >
      <ScrollView
        contentContainerStyle={formStyles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={formStyles.sectionLabel}>Name</Text>
        <AppInput
          label=""
          placeholder="e.g. My home"
          value={name}
          onChangeText={(t) => {
            setName(t);
            if (nameError !== null) setNameError(null);
          }}
          error={nameError ?? undefined}
          maxLength={80}
          autoCapitalize="words"
          returnKeyType="done"
        />

        <Text style={formStyles.sectionLabel}>Type</Text>
        <View style={formStyles.chips}>
          {KIND_OPTIONS.map((k) => (
            <Pressable
              key={k}
              onPress={() => setKind(k)}
              style={[formStyles.chip, kind === k && formStyles.chipActive]}
              accessibilityRole="radio"
              accessibilityState={{ selected: kind === k }}
              accessibilityLabel={`Zone type: ${ZONE_KIND_LABEL[k]}`}
            >
              <Text style={formStyles.chipIcon}>{ZONE_KIND_ICON[k]}</Text>
              <Text
                style={[
                  formStyles.chipLabel,
                  kind === k && formStyles.chipLabelActive,
                ]}
              >
                {ZONE_KIND_LABEL[k]}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={formStyles.sectionLabel}>Radius</Text>
        <Text style={formStyles.sectionHint}>
          RoadPing hides you within this distance of the zone center.
        </Text>
        <View style={formStyles.chips}>
          {radiusPresets.map((p, i) => {
            const selected = i === selectedRadiusIndex;
            return (
              <Pressable
                key={p.value}
                onPress={() => setRadius(p.value)}
                style={[
                  formStyles.chip,
                  selected && formStyles.chipActive,
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`Radius: ${p.label}`}
              >
                <Text
                  style={[
                    formStyles.chipLabel,
                    selected && formStyles.chipLabelActive,
                  ]}
                >
                  {p.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={formStyles.formActions}>
          <AppButton
            label={initial !== null ? 'Save Changes' : 'Create Zone'}
            variant="primary"
            size="lg"
            fullWidth
            loading={isMutating}
            onPress={handleSave}
          />
          <AppButton
            label="Cancel"
            variant="ghost"
            size="md"
            fullWidth
            disabled={isMutating}
            onPress={onCancel}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const formStyles = StyleSheet.create({
  scroll: {
    gap: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  sectionLabel: {
    fontSize: FontSize.label,
    fontWeight: FontWeight.semibold,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: Spacing.sm,
  },
  sectionHint: {
    fontSize: FontSize.caption,
    color: Colors.textTertiary,
    marginTop: -Spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md12,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 44,
  },
  chipActive: {
    backgroundColor: Colors.primaryMuted,
    borderColor: Colors.primary,
  },
  chipIcon: {
    fontSize: 16,
  },
  chipLabel: {
    fontSize: FontSize.body,
    fontWeight: FontWeight.medium,
    color: Colors.textSecondary,
  },
  chipLabelActive: {
    color: Colors.primary,
    fontWeight: FontWeight.semibold,
  },
  formActions: {
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

type ScreenMode = 'list' | 'create' | 'edit';

export default function PrivateZonesScreen() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { zones, isLoading, isMutating, error, create, update, remove } =
    usePrivateZones();

  const [mode, setMode] = useState<ScreenMode>('list');
  const [editingZone, setEditingZone] = useState<PrivateZoneRow | null>(null);
  const [locating, setLocating] = useState(false);
  const [pendingCoords, setPendingCoords] = useState<Coords | null>(null);

  // ── Guards ─────────────────────────────────────────────────────────────────
  if (authLoading) return <LoadingState message="Starting…" />;
  if (user === null) return <Redirect href="/onboarding" />;

  // ── Handlers ───────────────────────────────────────────────────────────────

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
          'Allow location access in Settings so RoadPing can create a zone at your current position.',
        );
        return;
      }
      const coords = await getCurrentCoords();
      setPendingCoords(coords);
      setMode('create');
    } catch {
      Alert.alert('Location error', 'Could not get your current location. Try again.');
    } finally {
      setLocating(false);
    }
  }

  async function handleCreateSave(
    name: string,
    kind: ZoneKind,
    radius_m: number,
  ) {
    if (pendingCoords === null) return;
    try {
      await create({ name, kind, radius_m, coords: pendingCoords });
      setPendingCoords(null);
      setMode('list');
    } catch (e) {
      Alert.alert(
        'Could not create zone',
        e instanceof Error ? e.message : 'Please try again.',
      );
    }
  }

  function handleEditTap(zone: PrivateZoneRow) {
    setEditingZone(zone);
    setMode('edit');
  }

  async function handleEditSave(
    name: string,
    kind: ZoneKind,
    radius_m: number,
  ) {
    if (editingZone === null) return;
    try {
      await update(editingZone.id, { name, kind, radius_m });
      setEditingZone(null);
      setMode('list');
    } catch (e) {
      Alert.alert(
        'Could not update zone',
        e instanceof Error ? e.message : 'Please try again.',
      );
    }
  }

  function handleDeleteTap(zone: PrivateZoneRow) {
    Alert.alert(
      'Delete zone?',
      `"${zone.name}" will be removed. You'll be visible in this area again.`,
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
                Alert.alert(
                  'Could not delete zone',
                  e instanceof Error ? e.message : 'Please try again.',
                );
              }
            })();
          },
        },
      ],
    );
  }

  function handleCancel() {
    setPendingCoords(null);
    setEditingZone(null);
    setMode('list');
  }

  // ── Title for current mode ─────────────────────────────────────────────────
  const screenTitle =
    mode === 'create'
      ? 'Create Zone'
      : mode === 'edit'
        ? 'Edit Zone'
        : 'Private Zones';

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <Pressable
          onPress={mode === 'list' ? () => router.back() : handleCancel}
          style={styles.backBtn}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={mode === 'list' ? 'Go back' : 'Cancel'}
        >
          <Text style={styles.backText}>
            {mode === 'list' ? '‹ Back' : '✕ Cancel'}
          </Text>
        </Pressable>
        <Text style={styles.headerTitle}>{screenTitle}</Text>
        <View style={styles.headerRight} />
      </View>

      <View style={styles.body}>
        {/* ── List mode ─────────────────────────────────────────────────── */}
        {mode === 'list' && (
          <ScrollView
            contentContainerStyle={styles.listScroll}
            showsVerticalScrollIndicator={false}
          >
            {/* Privacy note */}
            <View style={styles.privacyNote}>
              <Text style={styles.privacyIcon}>🔒</Text>
              <View style={styles.privacyText}>
                <Text style={styles.privacyTitle}>
                  RoadPing hides you inside private zones.
                </Text>
                <Text style={styles.privacyBody}>
                  When you're inside a zone you own, RoadPing won't start a
                  live session and you remain invisible to all nearby drivers.
                  No one else can see your zones.
                </Text>
              </View>
            </View>

            {/* List error */}
            {error !== null && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Loading */}
            {isLoading && (
              <View style={styles.centerRow}>
                <ActivityIndicator color={Colors.primary} />
              </View>
            )}

            {/* Empty state */}
            {!isLoading && zones.length === 0 && error === null && (
              <EmptyState
                fill={false}
                icon="📍"
                title="No private zones"
                message="Create a zone to stay invisible near home, work, or anywhere private."
              />
            )}

            {/* Zone list */}
            {zones.map((zone) => (
              <ZoneRow
                key={zone.id}
                zone={zone}
                onEdit={() => handleEditTap(zone)}
                onDelete={() => handleDeleteTap(zone)}
              />
            ))}

            {/* Create button */}
            <AppButton
              label={locating ? 'Getting location…' : 'Create zone here'}
              variant="primary"
              size="lg"
              fullWidth
              loading={locating}
              onPress={() => {
                void handleCreateTap();
              }}
            />

            <Text style={styles.footerNote}>
              Zones are based on your location when you tap "Create zone here."
              Exact coordinates are never shown or shared.
            </Text>
          </ScrollView>
        )}

        {/* ── Create mode ───────────────────────────────────────────────── */}
        {mode === 'create' && (
          <ZoneForm
            initial={null}
            isMutating={isMutating}
            onSave={(n, k, r) => {
              void handleCreateSave(n, k, r);
            }}
            onCancel={handleCancel}
          />
        )}

        {/* ── Edit mode ─────────────────────────────────────────────────── */}
        {mode === 'edit' && editingZone !== null && (
          <ZoneForm
            initial={{
              name: editingZone.name,
              kind: editingZone.kind,
              radius_m: editingZone.radius_m,
            }}
            isMutating={isMutating}
            onSave={(n, k, r) => {
              void handleEditSave(n, k, r);
            }}
            onCancel={handleCancel}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    minWidth: 72,
  },
  backText: {
    fontSize: FontSize.body,
    color: Colors.primary,
    fontWeight: FontWeight.medium,
  },
  headerTitle: {
    flex: 1,
    fontSize: FontSize.body,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  headerRight: {
    minWidth: 72,
  },

  body: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
  },

  listScroll: {
    gap: Spacing.md,
    paddingBottom: Spacing.xxl,
  },

  // Privacy note
  privacyNote: {
    flexDirection: 'row',
    gap: Spacing.md12,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  privacyIcon: {
    fontSize: 20,
    marginTop: 1,
  },
  privacyText: {
    flex: 1,
    gap: Spacing.xs,
  },
  privacyTitle: {
    fontSize: FontSize.bodySmall,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  privacyBody: {
    fontSize: FontSize.caption,
    color: Colors.textSecondary,
    lineHeight: FontSize.caption * 1.55,
  },

  // Error
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

  centerRow: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
  },

  footerNote: {
    fontSize: FontSize.caption,
    color: Colors.textTertiary,
    textAlign: 'center',
    lineHeight: FontSize.caption * 1.5,
    paddingHorizontal: Spacing.sm,
  },
});

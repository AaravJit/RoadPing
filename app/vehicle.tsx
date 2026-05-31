/**
 * app/vehicle.tsx — Vehicle setup & management.
 *
 * Two render modes inside one screen:
 *   • list — shows the user's existing vehicles with edit / delete /
 *            make-primary actions, plus an "Add another" button.
 *   • form — add a new vehicle or edit an existing one.
 *
 * Route gate (app/index.tsx) sends authenticated users with no vehicle here
 * before they can reach the Drive screen. Once they have at least one
 * vehicle, tapping "Done" pops back to the route gate which forwards them on.
 */
import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/AppButton';
import { AppInput } from '@/components/AppInput';
import { LoadingState } from '@/components/LoadingState';
import { ErrorState } from '@/components/ErrorState';
import { VehicleCard } from '@/components/VehicleCard';
import { Colors } from '@/theme/colors';
import { FontSize, FontWeight, TextStyles } from '@/theme/typography';
import { Radius, Spacing } from '@/theme/spacing';
import { useAuth } from '@/hooks/useAuth';
import { useVehicles } from '@/hooks/useVehicles';
import type { VehicleRow } from '@/services/types';
import {
  BODY_TYPE_OPTIONS,
  bodyTypeSqlToUi,
  createVehicle,
  deleteVehicle,
  friendlyVehicleError,
  hasValidationErrors,
  setPrimaryVehicle,
  updateVehicle,
  validateVehicleInput,
  YEAR_MAX,
  YEAR_MIN,
  type BodyTypeUi,
  type VehicleInput,
  type VehicleInputErrors,
} from '@/services/vehicle';

// ─── Form state helpers ──────────────────────────────────────────────────────

interface FormState {
  nickname: string;
  bodyType: BodyTypeUi | null;
  make: string;
  model: string;
  year: string; // string so the input can be empty
  color: string;
}

const EMPTY_FORM: FormState = {
  nickname: '',
  bodyType: null,
  make: '',
  model: '',
  year: '',
  color: '',
};

function fromVehicle(v: VehicleRow): FormState {
  return {
    nickname: v.label,
    bodyType: v.body_type !== null ? bodyTypeSqlToUi(v.body_type) : null,
    make: v.make ?? '',
    model: v.model ?? '',
    year: v.year !== null ? String(v.year) : '',
    color: v.color ?? '',
  };
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function VehicleScreen() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const {
    vehicles,
    isLoading: vehiclesLoading,
    error: vehiclesError,
    refresh,
    hasLoaded,
  } = useVehicles(user?.id ?? null);

  // ── Local UI state ──────────────────────────────────────────────────────
  type Mode = { kind: 'list' } | { kind: 'form'; editingId: string | null };
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<VehicleInputErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [actingOnId, setActingOnId] = useState<string | null>(null);

  // After the initial load, if the user has zero vehicles, jump straight
  // into the form so the empty case acts as "add your first vehicle".
  useEffect(() => {
    if (hasLoaded && vehicles.length === 0 && mode.kind === 'list') {
      setForm(EMPTY_FORM);
      setFieldErrors({});
      setSaveError(null);
      setMode({ kind: 'form', editingId: null });
    }
  }, [hasLoaded, vehicles.length, mode.kind]);

  // ── Guards ──────────────────────────────────────────────────────────────
  if (authLoading) return <LoadingState message="Starting…" />;
  if (user === null) return <Redirect href="/onboarding" />;
  if (vehiclesLoading && !hasLoaded) {
    return <LoadingState message="Loading your vehicles…" />;
  }
  if (vehiclesError !== null && !hasLoaded) {
    return (
      <ErrorState
        title="Couldn't load vehicles"
        message={vehiclesError}
        onRetry={() => {
          void refresh();
        }}
      />
    );
  }

  // ── Derived ─────────────────────────────────────────────────────────────
  const isInitialSetup = vehicles.length === 0;
  const editingVehicle: VehicleRow | null =
    mode.kind === 'form' && mode.editingId !== null
      ? (vehicles.find((v) => v.id === mode.editingId) ?? null)
      : null;

  // ── Form open/close ─────────────────────────────────────────────────────
  function openAddForm() {
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setSaveError(null);
    setMode({ kind: 'form', editingId: null });
  }

  function openEditForm(v: VehicleRow) {
    setForm(fromVehicle(v));
    setFieldErrors({});
    setSaveError(null);
    setMode({ kind: 'form', editingId: v.id });
  }

  function closeForm() {
    if (vehicles.length === 0) return; // can't bail with zero vehicles
    setMode({ kind: 'list' });
  }

  // ── Form submit ─────────────────────────────────────────────────────────
  async function handleSave() {
    setSaveError(null);

    if (form.bodyType === null) {
      setFieldErrors({ ...fieldErrors, bodyType: 'Pick a body type.' });
      return;
    }

    const input: VehicleInput = {
      nickname: form.nickname,
      bodyType: form.bodyType,
      make: form.make,
      model: form.model,
      year: Number.parseInt(form.year, 10),
      color: form.color,
    };

    const errs = validateVehicleInput(input);
    setFieldErrors(errs);
    if (hasValidationErrors(errs)) return;

    if (user === null) return;

    setSaving(true);
    try {
      if (mode.kind === 'form' && mode.editingId !== null) {
        await updateVehicle(mode.editingId, user.id, input);
      } else {
        await createVehicle(user.id, input);
      }
      await refresh();
      setMode({ kind: 'list' });
    } catch (err) {
      setSaveError(friendlyVehicleError(err));
    } finally {
      setSaving(false);
    }
  }

  // ── Per-card actions ────────────────────────────────────────────────────
  function handleDelete(v: VehicleRow) {
    Alert.alert(
      'Delete vehicle?',
      `Remove ${v.label} from your vehicles?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              if (user === null) return;
              setActingOnId(v.id);
              try {
                await deleteVehicle(v.id, user.id);
                await refresh();
              } catch (err) {
                Alert.alert('Delete failed', friendlyVehicleError(err));
              } finally {
                setActingOnId(null);
              }
            })();
          },
        },
      ],
    );
  }

  async function handleSetPrimary(v: VehicleRow) {
    if (user === null) return;
    setActingOnId(v.id);
    try {
      await setPrimaryVehicle(v.id, user.id);
      await refresh();
    } catch (err) {
      Alert.alert('Couldn’t change primary', friendlyVehicleError(err));
    } finally {
      setActingOnId(null);
    }
  }

  function handleDone() {
    // Route gate in app/index.tsx forwards on once a vehicle exists.
    router.replace('/');
  }

  // ─── Render: form mode ──────────────────────────────────────────────────
  if (mode.kind === 'form') {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.kav}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.header}>
              <Text style={styles.title}>
                {editingVehicle !== null
                  ? 'Edit vehicle'
                  : isInitialSetup
                    ? 'Add your first vehicle'
                    : 'Add a vehicle'}
              </Text>
              <Text style={styles.subtitle}>
                Drivers nearby will see your vehicle’s make, model and color
                while you’re live.
              </Text>
            </View>

            {/* ── Nickname ───────────────────────────────────────────── */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Identity</Text>

              <AppInput
                label="Nickname"
                placeholder="e.g. Daily driver"
                value={form.nickname}
                onChangeText={(t) => setForm({ ...form, nickname: t })}
                error={fieldErrors.nickname}
                helper="A short name only you see."
                autoCapitalize="sentences"
                maxLength={50}
                returnKeyType="next"
              />

              <AppInput
                label="Make"
                placeholder="Toyota"
                value={form.make}
                onChangeText={(t) => setForm({ ...form, make: t })}
                error={fieldErrors.make}
                autoCapitalize="words"
                maxLength={80}
                returnKeyType="next"
              />

              <AppInput
                label="Model"
                placeholder="Corolla"
                value={form.model}
                onChangeText={(t) => setForm({ ...form, model: t })}
                error={fieldErrors.model}
                autoCapitalize="words"
                maxLength={80}
                returnKeyType="next"
              />

              <AppInput
                label="Year"
                placeholder={String(YEAR_MAX - 1)}
                value={form.year}
                onChangeText={(t) =>
                  setForm({ ...form, year: t.replace(/[^0-9]/g, '').slice(0, 4) })
                }
                error={fieldErrors.year}
                helper={`Between ${YEAR_MIN} and ${YEAR_MAX}.`}
                keyboardType="number-pad"
                maxLength={4}
                returnKeyType="next"
              />

              <AppInput
                label="Color"
                placeholder="Silver"
                value={form.color}
                onChangeText={(t) => setForm({ ...form, color: t })}
                error={fieldErrors.color}
                autoCapitalize="words"
                maxLength={40}
                returnKeyType="done"
              />
            </View>

            {/* ── Body type chips ────────────────────────────────────── */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Body type</Text>
              <View style={styles.chipRow} accessibilityRole="radiogroup">
                {BODY_TYPE_OPTIONS.map((opt) => {
                  const selected = form.bodyType === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      style={[styles.chip, selected && styles.chipActive]}
                      onPress={() =>
                        setForm({ ...form, bodyType: opt.value })
                      }
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      accessibilityLabel={opt.label}
                    >
                      <Text style={styles.chipEmoji}>{opt.emoji}</Text>
                      <Text
                        style={[
                          styles.chipLabel,
                          selected && styles.chipLabelActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {fieldErrors.bodyType !== undefined && (
                <Text style={styles.fieldError}>{fieldErrors.bodyType}</Text>
              )}
            </View>

            {/* ── Save error ─────────────────────────────────────────── */}
            {saveError !== null && (
              <View style={styles.errorBanner} accessibilityRole="alert">
                <Text style={styles.errorBannerText}>{saveError}</Text>
              </View>
            )}

            {/* ── Actions ────────────────────────────────────────────── */}
            <View style={styles.actions}>
              <AppButton
                label={editingVehicle !== null ? 'Save changes' : 'Add vehicle'}
                variant="primary"
                size="lg"
                fullWidth
                loading={saving}
                onPress={handleSave}
              />
              {vehicles.length > 0 && (
                <AppButton
                  label="Cancel"
                  variant="ghost"
                  size="md"
                  fullWidth
                  disabled={saving}
                  onPress={closeForm}
                />
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ─── Render: list mode ─────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Your vehicles</Text>
          <Text style={styles.subtitle}>
            Your primary vehicle is shown to nearby drivers when you go live.
          </Text>
        </View>

        <View style={styles.list}>
          {vehicles.map((v) => (
            <VehicleCard
              key={v.id}
              vehicle={v}
              busy={actingOnId === v.id}
              onEdit={() => openEditForm(v)}
              onDelete={() => handleDelete(v)}
              onSetPrimary={
                v.is_active
                  ? undefined
                  : () => {
                      void handleSetPrimary(v);
                    }
              }
            />
          ))}
        </View>

        <View style={styles.actions}>
          <AppButton
            label="+ Add another vehicle"
            variant="secondary"
            size="md"
            fullWidth
            onPress={openAddForm}
          />
          <AppButton
            label="Done"
            variant="primary"
            size="lg"
            fullWidth
            onPress={handleDone}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  kav: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xxl,
    gap: Spacing.xl,
    flexGrow: 1,
  },

  header: {
    gap: Spacing.sm,
  },
  title: {
    ...TextStyles.headingLarge,
    color: Colors.textPrimary,
  },
  subtitle: {
    ...TextStyles.body,
    color: Colors.textSecondary,
  },

  section: {
    gap: Spacing.md,
  },
  sectionLabel: {
    fontSize: FontSize.label,
    fontWeight: FontWeight.semibold,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  // Body-type chip row
  chipRow: {
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
  },
  chipActive: {
    backgroundColor: Colors.primaryMuted,
    borderColor: Colors.primary,
  },
  chipEmoji: {
    fontSize: FontSize.body,
  },
  chipLabel: {
    fontSize: FontSize.bodySmall,
    fontWeight: FontWeight.medium,
    color: Colors.textSecondary,
  },
  chipLabelActive: {
    color: Colors.primary,
    fontWeight: FontWeight.semibold,
  },
  fieldError: {
    fontSize: FontSize.caption,
    color: Colors.error,
  },

  // Banners + actions
  errorBanner: {
    backgroundColor: Colors.errorMuted,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.error,
    padding: Spacing.md,
  },
  errorBannerText: {
    fontSize: FontSize.bodySmall,
    color: Colors.error,
    textAlign: 'center',
  },

  // List mode
  list: {
    gap: Spacing.md,
  },

  actions: {
    gap: Spacing.sm,
  },
});

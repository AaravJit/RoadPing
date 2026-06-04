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
import React, { useEffect, useMemo, useState } from 'react';
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
import { SelectField, type SelectOption } from '@/components/SelectField';
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
  generateVehicleLabel,
  hasValidationErrors,
  setPrimaryVehicle,
  updateVehicle,
  validateVehicleInput,
  YEAR_MAX,
  type BodyTypeUi,
  type VehicleInput,
  type VehicleInputErrors,
} from '@/services/vehicle';
import {
  inferBodyType,
  makeHasModels,
  modelsForMake,
  OTHER_MAKE,
  VEHICLE_MAKES,
} from '@/services/vehicleData';

// ─── Dropdown option sets ──────────────────────────────────────────────────────

const YEAR_OPTIONS: SelectOption[] = Array.from(
  { length: YEAR_MAX - 1980 + 1 },
  (_, i) => {
    const y = YEAR_MAX - i;
    return { label: String(y), value: String(y) };
  },
);

const COLOR_OPTIONS: SelectOption[] = [
  'Black',
  'White',
  'Silver',
  'Gray',
  'Red',
  'Blue',
  'Green',
  'Yellow',
  'Orange',
  'Brown',
  'Gold',
  'Beige',
  'Purple',
  'Other',
].map((c) => ({ label: c, value: c }));

const BASE_MAKE_OPTIONS: SelectOption[] = [...VEHICLE_MAKES, OTHER_MAKE].map(
  (m) => ({ label: m, value: m }),
);

/**
 * Make options including the current value even if it isn't in the curated
 * list — so editing an existing vehicle with an uncommon make never loses it.
 */
function buildMakeOptions(current: string): SelectOption[] {
  const trimmed = current.trim();
  if (trimmed.length === 0) return BASE_MAKE_OPTIONS;
  const known = BASE_MAKE_OPTIONS.some(
    (o) => o.value.toLowerCase() === trimmed.toLowerCase(),
  );
  return known
    ? BASE_MAKE_OPTIONS
    : [{ label: trimmed, value: trimmed }, ...BASE_MAKE_OPTIONS];
}

/** Model options for a make, preserving an existing custom model value. */
function buildModelOptions(make: string, current: string): SelectOption[] {
  const base: SelectOption[] = modelsForMake(make).map((m) => ({
    label: m.name,
    value: m.name,
  }));
  base.push({ label: 'Other / not listed', value: OTHER_MAKE });
  const trimmed = current.trim();
  if (
    trimmed.length > 0 &&
    trimmed !== OTHER_MAKE &&
    !base.some((o) => o.value.toLowerCase() === trimmed.toLowerCase())
  ) {
    return [{ label: trimmed, value: trimmed }, ...base];
  }
  return base;
}

// ─── Form state helpers ──────────────────────────────────────────────────────

interface FormState {
  bodyType: BodyTypeUi | null;
  make: string;
  model: string;
  year: string; // string so the input can be empty
  color: string;
}

const EMPTY_FORM: FormState = {
  bodyType: null,
  make: '',
  model: '',
  year: '',
  color: '',
};

function fromVehicle(v: VehicleRow): FormState {
  return {
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
  // True when the model is entered as free text (make is "Other", has no
  // curated models, or the user picked "Other / not listed").
  const [customModel, setCustomModel] = useState(false);

  const makeOptions = useMemo(() => buildMakeOptions(form.make), [form.make]);
  const modelOptions = useMemo(
    () => buildModelOptions(form.make, form.model),
    [form.make, form.model],
  );
  const showModelDropdown = !customModel && makeHasModels(form.make);
  // The body type was filled in for the user from their model selection.
  const bodyTypeInferred =
    form.bodyType !== null && inferBodyType(form.make, form.model) === form.bodyType;

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

  // ── Make / model selection (with body-type inference) ───────────────────
  function applyMake(make: string) {
    setSaveError(null);
    if (make === OTHER_MAKE) {
      setCustomModel(true);
      setForm((f) => ({ ...f, make, model: '' }));
      return;
    }
    setCustomModel(false);
    setForm((f) => {
      const models = modelsForMake(make);
      const keep = models.some(
        (m) => m.name.toLowerCase() === f.model.trim().toLowerCase(),
      );
      const nextModel = keep ? f.model : '';
      const inferred = inferBodyType(make, nextModel);
      return { ...f, make, model: nextModel, bodyType: inferred ?? f.bodyType };
    });
  }

  function applyModelSelect(value: string) {
    if (value === OTHER_MAKE) {
      setCustomModel(true);
      setForm((f) => ({ ...f, model: '' }));
      return;
    }
    setForm((f) => {
      const inferred = inferBodyType(f.make, value);
      return { ...f, model: value, bodyType: inferred ?? f.bodyType };
    });
  }

  function applyModelText(text: string) {
    setForm((f) => {
      const inferred = inferBodyType(f.make, text);
      return { ...f, model: text, bodyType: inferred ?? f.bodyType };
    });
  }

  // ── Form open/close ─────────────────────────────────────────────────────
  function openAddForm() {
    setForm(EMPTY_FORM);
    setCustomModel(false);
    setFieldErrors({});
    setSaveError(null);
    setMode({ kind: 'form', editingId: null });
  }

  function openEditForm(v: VehicleRow) {
    const fs = fromVehicle(v);
    // Use the free-text model field when the saved make/model aren't in the
    // curated dataset, so existing vehicles keep their exact values.
    const custom =
      fs.make.trim().length > 0 &&
      (!makeHasModels(fs.make) ||
        !modelsForMake(fs.make).some(
          (m) => m.name.toLowerCase() === fs.model.trim().toLowerCase(),
        ));
    setForm(fs);
    setCustomModel(custom);
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
      // No nickname — the display label is auto-generated from these details.
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

    // First-ever vehicle during initial setup → send them to the theme step
    // before Drive, so onboarding ends on "pick your cockpit".
    const creatingFirstVehicle =
      mode.kind === 'form' && mode.editingId === null && vehicles.length === 0;

    setSaving(true);
    try {
      if (mode.kind === 'form' && mode.editingId !== null) {
        await updateVehicle(mode.editingId, user.id, input);
      } else {
        await createVehicle(user.id, input);
      }
      await refresh();
      if (creatingFirstVehicle) {
        router.replace('/theme-setup');
        return;
      }
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
              {isInitialSetup && editingVehicle === null && (
                <View style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>STEP 2 OF 2</Text>
                </View>
              )}
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

            {/* ── Details ────────────────────────────────────────────── */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Details</Text>

              <SelectField
                label="Make"
                value={form.make.length > 0 ? form.make : null}
                options={makeOptions}
                placeholder="Select make"
                searchable
                onChange={applyMake}
                error={fieldErrors.make}
              />

              {showModelDropdown ? (
                <SelectField
                  label="Model"
                  value={form.model.length > 0 ? form.model : null}
                  options={modelOptions}
                  placeholder="Select model"
                  searchable
                  onChange={applyModelSelect}
                  error={fieldErrors.model}
                />
              ) : (
                <AppInput
                  label="Model"
                  placeholder="e.g. Civic"
                  value={form.model}
                  onChangeText={applyModelText}
                  error={fieldErrors.model}
                  autoCapitalize="words"
                  maxLength={80}
                  returnKeyType="next"
                />
              )}

              <SelectField
                label="Year"
                value={form.year.length > 0 ? form.year : null}
                options={YEAR_OPTIONS}
                placeholder="Select year"
                searchable
                onChange={(v) => setForm({ ...form, year: v })}
                error={fieldErrors.year}
              />

              <SelectField
                label="Color"
                value={form.color.length > 0 ? form.color : null}
                options={COLOR_OPTIONS}
                placeholder="Select color"
                onChange={(v) => setForm({ ...form, color: v })}
                error={fieldErrors.color}
              />
            </View>

            {/* ── Body type chips ────────────────────────────────────── */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Body type</Text>
              <Text style={styles.sectionHint}>
                {bodyTypeInferred
                  ? 'Picked from your model — tap to change.'
                  : 'Sets the icon shown on the live map.'}
              </Text>
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

            {/* ── Auto-generated label preview ───────────────────────── */}
            {form.make.trim().length > 0 && form.model.trim().length > 0 && (
              <View style={styles.previewBox}>
                <Text style={styles.previewLabel}>SHOWN TO NEARBY DRIVERS AS</Text>
                <Text style={styles.previewValue}>
                  {generateVehicleLabel({
                    year: form.year.length > 0 ? Number(form.year) : null,
                    make: form.make,
                    model: form.model,
                    color: form.color,
                  })}
                </Text>
              </View>
            )}

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
  stepBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.primaryMuted,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md12,
    paddingVertical: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  stepBadgeText: {
    fontSize: FontSize.micro,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
    letterSpacing: 1,
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
  sectionHint: {
    fontSize: FontSize.caption,
    color: Colors.textTertiary,
    marginTop: -Spacing.sm,
    lineHeight: FontSize.caption * 1.4,
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

  // Auto-label preview
  previewBox: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  previewLabel: {
    fontSize: FontSize.micro,
    fontWeight: FontWeight.semibold,
    color: Colors.textTertiary,
    letterSpacing: 1,
  },
  previewValue: {
    fontSize: FontSize.bodyLarge,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
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

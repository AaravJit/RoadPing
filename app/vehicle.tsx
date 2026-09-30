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
import { ActionSheetIOS, Alert, Platform, Pressable, View } from 'react-native';
import { Redirect, Stack, useRouter } from 'expo-router';

import { ErrorState } from '@/components/ErrorState';
import { LoadingState } from '@/components/LoadingState';
import { SelectField, type SelectOption } from '@/components/SelectField';
import { VehicleCard } from '@/components/VehicleCard';
import { AppText, Button, Notice, ScreenBackground, ScreenScroll, TextField, haptic } from '@/components/ui';
import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH_TARGET, Radius, SCREEN_INSET, Spacing } from '@/theme/spacing';
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
  const styles = useStyles();
  const { colors, accent } = useTheme();
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
      <ScreenBackground>
        <ErrorState
          title="Couldn't load vehicles"
          message={vehiclesError}
          onRetry={() => {
            void refresh();
          }}
        />
      </ScreenBackground>
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
      `Delete ${v.label}?`,
      'It will be removed from your vehicles.',
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
                Alert.alert("Couldn't delete vehicle", friendlyVehicleError(err));
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

  function openVehicleActions(v: VehicleRow) {
    const options = ['Edit', ...(v.is_active ? [] : ['Make Primary']), 'Delete Vehicle', 'Cancel'];
    const run = (label: string | undefined) => {
      if (label === 'Edit') openEditForm(v);
      if (label === 'Make Primary') void handleSetPrimary(v);
      if (label === 'Delete Vehicle') handleDelete(v);
    };
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: v.label,
          options,
          cancelButtonIndex: options.length - 1,
          destructiveButtonIndex: options.length - 2,
        },
        (i) => run(options[i]),
      );
      return;
    }
    Alert.alert(v.label, undefined, [
      ...options.slice(0, -1).map((text) => ({
        text,
        style: text === 'Delete Vehicle' ? ('destructive' as const) : ('default' as const),
        onPress: () => run(text),
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }

  function handleDone() {
    // Route gate in app/index.tsx forwards on once a vehicle exists.
    router.replace('/');
  }

  // ─── Render: form mode ──────────────────────────────────────────────────
  if (mode.kind === 'form') {
    const formTitle =
      editingVehicle !== null ? 'Edit Vehicle' : isInitialSetup ? 'Your vehicle' : 'Add Vehicle';
    return (
      <ScreenScroll>
        <Stack.Screen options={{ headerShown: !isInitialSetup, title: formTitle }} />

        {isInitialSetup && editingVehicle === null && (
          <View style={styles.intro}>
            <AppText variant="footnote" color="secondary" weight="medium">
              Step 2 of 2
            </AppText>
            <AppText variant="largeTitle" weight="bold" accessibilityRole="header">
              Your vehicle
            </AppText>
          </View>
        )}
        <AppText variant="body" color="secondary" style={styles.inset}>
          Nearby drivers see your vehicle&apos;s make, model and color while you&apos;re live.
        </AppText>

        <View style={styles.fields}>
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
            <TextField
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

        <View style={styles.fields}>
          <View style={styles.labelRow}>
            <AppText variant="footnote" color="secondary" weight="medium">
              Body type
            </AppText>
            <AppText variant="footnote" color="tertiary">
              {bodyTypeInferred ? 'Picked from your model' : 'Sets your map icon'}
            </AppText>
          </View>
          <View style={styles.chipRow} accessibilityRole="radiogroup" accessibilityLabel="Body type">
            {BODY_TYPE_OPTIONS.map((opt) => {
              const selected = form.bodyType === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  style={[
                    styles.chip,
                    selected && { backgroundColor: accent.muted, borderColor: accent.fill },
                  ]}
                  onPress={() => {
                    haptic.selection();
                    setForm({ ...form, bodyType: opt.value });
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={opt.label}
                >
                  <AppText variant="body" maxScale={1.2}>
                    {opt.emoji}
                  </AppText>
                  <AppText
                    variant="subheadline"
                    weight={selected ? 'semibold' : 'medium'}
                    style={{ color: selected ? accent.text : colors.textPrimary }}
                  >
                    {opt.label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
          {fieldErrors.bodyType !== undefined && (
            <AppText variant="footnote" color="danger" accessibilityRole="alert">
              {fieldErrors.bodyType}
            </AppText>
          )}
        </View>

        {form.make.trim().length > 0 && form.model.trim().length > 0 && (
          <View style={styles.inset}>
            <Notice
              icon="eye.fill"
              title="Nearby drivers will see"
              message={generateVehicleLabel({
                year: form.year.length > 0 ? Number(form.year) : null,
                make: form.make,
                model: form.model,
                color: form.color,
              })}
            />
          </View>
        )}

        <View style={styles.actions}>
          {saveError !== null && <Notice tone="danger" title="Couldn't save" message={saveError} />}
          <Button
            label={editingVehicle !== null ? 'Save' : 'Add Vehicle'}
            size="lg"
            fullWidth
            loading={saving}
            onPress={() => void handleSave()}
          />
          {vehicles.length > 0 && (
            <Button label="Cancel" variant="plain" fullWidth disabled={saving} onPress={closeForm} />
          )}
        </View>
      </ScreenScroll>
    );
  }

  // ─── Render: list mode ─────────────────────────────────────────────────
  return (
    <ScreenScroll>
      <Stack.Screen options={{ headerShown: true, title: 'Vehicles' }} />
      <AppText variant="footnote" color="secondary" style={styles.inset}>
        Your primary vehicle is what nearby drivers see when you go live. Tap a
        vehicle for options.
      </AppText>

      <View style={styles.cards}>
        {vehicles.map((v) => (
          <VehicleCard
            key={v.id}
            vehicle={v}
            busy={actingOnId === v.id}
            onPress={() => openVehicleActions(v)}
          />
        ))}
      </View>

      <View style={styles.actions}>
        <Button label="Add Vehicle" icon="plus" variant="secondary" fullWidth onPress={openAddForm} />
        {!router.canGoBack() && <Button label="Done" size="lg" fullWidth onPress={handleDone} />}
      </View>
    </ScreenScroll>
  );
}

const useStyles = makeStyles((t) => ({
  intro: {
    paddingHorizontal: SCREEN_INSET,
    gap: Spacing.xs,
  },
  inset: {
    paddingHorizontal: SCREEN_INSET,
  },
  fields: {
    paddingHorizontal: SCREEN_INSET,
    gap: Spacing.md,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: Spacing.sm,
    marginBottom: -Spacing.xs,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: Spacing.md12 + 2,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: 'transparent',
    backgroundColor: t.colors.surface,
  },
  cards: {
    paddingHorizontal: SCREEN_INSET,
    gap: Spacing.md,
  },
  actions: {
    paddingHorizontal: SCREEN_INSET,
    gap: Spacing.sm,
  },
}));

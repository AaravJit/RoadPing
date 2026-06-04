/**
 * app/profile.tsx — Profile setup and editing screen.
 *
 * Used in two contexts:
 *  1. Initial setup — user has no handle yet; route gate redirects here.
 *     After saving a valid handle, router.replace('/') returns to main content.
 *  2. Editing — user navigates here from settings to update their profile.
 *
 * Fields: handle, display_name, avatar_url (optional),
 *         default_range_m (preset chips), dnd_mode (toggle).
 */
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppInput } from '@/components/AppInput';
import { AppButton } from '@/components/AppButton';
import { LoadingState } from '@/components/LoadingState';
import { Colors } from '@/theme/colors';
import { FontSize, FontWeight, TextStyles } from '@/theme/typography';
import { Radius, Spacing } from '@/theme/spacing';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useUnits } from '@/hooks/useUnits';
import { closestPresetIndex, rangePresetsFor, DEFAULT_RANGE_M } from '@/services/units';
import {
  updateProfile,
  validateHandle,
  validateDisplayName,
  friendlyProfileError,
} from '@/services/profile';
import {
  pickAvatar,
  uploadAvatar,
  removeAvatarFile,
  friendlyAvatarError,
  type AvatarSource,
} from '@/services/avatar';
import { stopLiveSession } from '@/services/liveSession';

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const router = useRouter();
  const { user, isLoading: authLoading, signOut } = useAuth();
  const { system } = useUnits();
  const { profile, isLoading: profileLoading, refresh } = useProfile(
    user?.id ?? null,
  );

  // ── Form state ────────────────────────────────────────────────────────────
  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  // New users default to 3 miles; existing profiles overwrite this on load.
  const [rangeM, setRangeM] = useState(DEFAULT_RANGE_M);
  const [dndMode, setDndMode] = useState(false);

  // ── Validation state ──────────────────────────────────────────────────────
  const [handleError, setHandleError] = useState<string | null>(null);
  const [displayNameError, setDisplayNameError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // ── Populate form when profile loads ─────────────────────────────────────
  useEffect(() => {
    if (profile !== null) {
      setHandle(profile.handle ?? '');
      setDisplayName(profile.display_name);
      setAvatarUrl(profile.avatar_url ?? '');
      setRangeM(profile.default_range_m);
      setDndMode(profile.dnd_mode);
    }
  }, [profile]);

  // ── Guards ────────────────────────────────────────────────────────────────

  if (authLoading) {
    return <LoadingState message="Starting…" />;
  }

  // Safety: if somehow landed here without a session, redirect.
  if (user === null) {
    return <Redirect href="/onboarding" />;
  }

  if (profileLoading && profile === null) {
    return <LoadingState message="Loading profile…" />;
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  // isInitialSetup is true the first time the user goes through profile setup.
  const isInitialSetup = profile === null || profile.handle === null;

  // ── Handlers ─────────────────────────────────────────────────────────────

  function onHandleChange(text: string) {
    // Handles are always lowercase — auto-convert on input.
    const lower = text.toLowerCase();
    setHandle(lower);
    setHandleError(validateHandle(lower));
  }

  function onDisplayNameChange(text: string) {
    setDisplayName(text);
    setDisplayNameError(validateDisplayName(text));
  }

  async function handleSave() {
    setSaveError(null);

    // Run validation and surface errors before hitting the network.
    const hErr = validateHandle(handle);
    const dErr = validateDisplayName(displayName);
    setHandleError(hErr);
    setDisplayNameError(dErr);
    if (hErr !== null || dErr !== null) return;

    // TypeScript narrows user to null in async callbacks even though the
    // render-time guard above ensures we only reach this function when signed in.
    if (user === null) return;

    setSaving(true);
    try {
      await updateProfile(user.id, {
        handle,
        display_name: displayName,
        avatar_url: avatarUrl.trim().length > 0 ? avatarUrl.trim() : null,
        default_range_m: rangeM,
        dnd_mode: dndMode,
      });
      // Refresh the cached profile so isComplete updates.
      await refresh();
      // Route gate in index.tsx will now see isComplete = true.
      router.replace('/');
    } catch (err) {
      setSaveError(friendlyProfileError(err));
    } finally {
      setSaving(false);
    }
  }

  async function handlePhoto(source: AvatarSource) {
    if (user === null || photoBusy) return;
    setPhotoError(null);
    try {
      const asset = await pickAvatar(source);
      if (asset === null) return; // user cancelled — no-op
      setPhotoBusy(true);
      const url = await uploadAvatar(user.id, asset);
      setAvatarUrl(url);
    } catch (err) {
      setPhotoError(friendlyAvatarError(err));
    } finally {
      setPhotoBusy(false);
    }
  }

  function handleRemovePhoto() {
    setPhotoError(null);
    setAvatarUrl('');
    if (user !== null) void removeAvatarFile(user.id);
  }

  function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try { await stopLiveSession(); } catch {}
            await signOut();
            router.replace('/onboarding');
          })();
        },
      },
    ]);
  }

  // ─── Render ───────────────────────────────────────────────────────────────

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
          {/* ── Header ─────────────────────────────────────────────────────── */}
          <View style={styles.header}>
            {isInitialSetup && (
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>STEP 1 OF 2</Text>
              </View>
            )}
            <Text style={styles.title}>
              {isInitialSetup ? 'Set up your profile' : 'Edit profile'}
            </Text>
            <Text style={styles.subtitle}>
              {isInitialSetup
                ? 'Choose a handle and display name to get started.'
                : 'Update your RoadPing profile.'}
            </Text>
          </View>

          {/* ── Identity ───────────────────────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Identity</Text>

            <AppInput
              label="Handle"
              placeholder="e.g. fastdriver_99"
              value={handle}
              onChangeText={onHandleChange}
              error={handleError ?? undefined}
              helper="3–24 characters. Lowercase letters, numbers, underscores only."
              autoCapitalize="none"
              autoComplete="username"
              maxLength={24}
              returnKeyType="next"
            />

            <AppInput
              label="Display Name"
              placeholder="How you appear to others"
              value={displayName}
              onChangeText={onDisplayNameChange}
              error={displayNameError ?? undefined}
              autoCapitalize="words"
              maxLength={40}
              returnKeyType="next"
            />

            {/* Profile photo */}
            <View style={styles.photoBlock}>
              <View style={styles.photoPreviewWrap}>
                {avatarUrl.length > 0 ? (
                  <Image
                    source={{ uri: avatarUrl }}
                    style={styles.photoPreview}
                    accessibilityIgnoresInvertColors
                  />
                ) : (
                  <View style={[styles.photoPreview, styles.photoPlaceholder]}>
                    <Text style={styles.photoInitial}>
                      {displayName.trim()[0]?.toUpperCase() ?? '?'}
                    </Text>
                  </View>
                )}
                {photoBusy && (
                  <View style={styles.photoBusyOverlay}>
                    <ActivityIndicator color={Colors.primary} />
                  </View>
                )}
              </View>

              <View style={styles.photoActions}>
                <Text style={styles.photoLabel}>Profile photo</Text>
                <View style={styles.photoButtons}>
                  <Pressable
                    style={styles.photoBtn}
                    onPress={() => {
                      void handlePhoto('library');
                    }}
                    disabled={photoBusy}
                    accessibilityRole="button"
                    accessibilityLabel="Choose photo from library"
                  >
                    <Text style={styles.photoBtnText}>Choose from Library</Text>
                  </Pressable>
                  <Pressable
                    style={styles.photoBtn}
                    onPress={() => {
                      void handlePhoto('camera');
                    }}
                    disabled={photoBusy}
                    accessibilityRole="button"
                    accessibilityLabel="Take a photo"
                  >
                    <Text style={styles.photoBtnText}>Take Photo</Text>
                  </Pressable>
                </View>
                {avatarUrl.length > 0 && (
                  <Pressable
                    onPress={handleRemovePhoto}
                    disabled={photoBusy}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Remove photo"
                  >
                    <Text style={styles.photoRemove}>Remove Photo</Text>
                  </Pressable>
                )}
              </View>
            </View>
            {photoError !== null && (
              <Text style={styles.photoErrorText}>{photoError}</Text>
            )}
          </View>

          {/* ── Broadcast range ────────────────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Default Broadcast Range</Text>
            <Text style={styles.sectionHint}>
              Drivers within this radius can see and hear you when you go live.
            </Text>

            <View style={styles.rangePresets} accessibilityRole="radiogroup">
              {(() => {
                const presets = rangePresetsFor(system);
                const selIdx = closestPresetIndex(presets, rangeM);
                return presets.map((preset, i) => {
                  const selected = i === selIdx;
                  return (
                    <Pressable
                      key={preset.value}
                      style={[
                        styles.rangeChip,
                        selected && styles.rangeChipActive,
                      ]}
                      onPress={() => {
                        setRangeM(preset.value);
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`${preset.label} broadcast range`}
                    >
                      <Text
                        style={[
                          styles.rangeChipLabel,
                          selected && styles.rangeChipLabelActive,
                        ]}
                      >
                        {preset.label}
                      </Text>
                    </Pressable>
                  );
                });
              })()}
            </View>
          </View>

          {/* ── Privacy ────────────────────────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Privacy</Text>

            {/* Private zones link — secondary nav, hidden during first-run setup */}
            {!isInitialSetup && (
              <Pressable
                style={styles.linkRow}
                onPress={() => router.push('/private-zones')}
                accessibilityRole="button"
                accessibilityLabel="Manage private zones"
              >
                <View style={styles.linkRowText}>
                  <Text style={styles.linkRowTitle}>🔒  Private Zones</Text>
                  <Text style={styles.linkRowHint}>
                    Hide yourself near home, work, or anywhere private.
                  </Text>
                </View>
                <Text style={styles.linkRowChevron}>›</Text>
              </Pressable>
            )}

            <View style={styles.toggleRow}>
              <View style={styles.toggleTextWrap}>
                <Text style={styles.toggleTitle}>Do Not Disturb</Text>
                <Text style={styles.toggleHint}>
                  Hides your speaking status from nearby drivers. They can still
                  see you on the radar.
                </Text>
              </View>
              <Switch
                value={dndMode}
                onValueChange={setDndMode}
                trackColor={{
                  false: Colors.border,
                  true: Colors.primaryMuted,
                }}
                thumbColor={dndMode ? Colors.primary : Colors.textTertiary}
                accessibilityLabel="Do Not Disturb mode"
                accessibilityRole="switch"
              />
            </View>
          </View>

          {/* ── Account — secondary nav, hidden during first-run setup ─────── */}
          {!isInitialSetup && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Account</Text>
              <Pressable
                style={styles.linkRow}
                onPress={() => router.push('/settings')}
                accessibilityRole="button"
                accessibilityLabel="Open settings"
              >
                <View style={styles.linkRowText}>
                  <Text style={styles.linkRowTitle}>⚙️  Settings</Text>
                  <Text style={styles.linkRowHint}>
                    Privacy, blocked drivers, sign out, and more.
                  </Text>
                </View>
                <Text style={styles.linkRowChevron}>›</Text>
              </Pressable>
            </View>
          )}

          {/* ── Save error ─────────────────────────────────────────────────── */}
          {saveError !== null && (
            <View style={styles.errorBanner} accessibilityRole="alert">
              <Text style={styles.errorText}>{saveError}</Text>
            </View>
          )}

          {/* ── Actions ────────────────────────────────────────────────────── */}
          <View style={styles.actions}>
            <AppButton
              label={isInitialSetup ? 'Continue' : 'Save Changes'}
              variant="primary"
              size="lg"
              fullWidth
              loading={saving}
              onPress={handleSave}
            />

            <AppButton
              label="Sign Out"
              variant="danger"
              size="md"
              fullWidth
              disabled={saving}
              onPress={handleSignOut}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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

  // ── Header ───────────────────────────────────────────────────────────────
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

  // ── Section ──────────────────────────────────────────────────────────────
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
  },

  // ── Profile photo ──────────────────────────────────────────────────────────
  photoBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  photoPreviewWrap: {
    width: 72,
    height: 72,
  },
  photoPreview: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.surfaceElevated,
  },
  photoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryMuted,
  },
  photoInitial: {
    fontSize: FontSize.heading,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
  },
  photoBusyOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 36,
    backgroundColor: 'rgba(10, 10, 20, 0.55)',
  },
  photoActions: {
    flex: 1,
    gap: Spacing.sm,
  },
  photoLabel: {
    fontSize: FontSize.label,
    fontWeight: FontWeight.medium,
    color: Colors.textSecondary,
  },
  photoButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  photoBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceElevated,
  },
  photoBtnText: {
    fontSize: FontSize.caption,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  photoRemove: {
    fontSize: FontSize.caption,
    color: Colors.error,
    fontWeight: FontWeight.medium,
  },
  photoErrorText: {
    fontSize: FontSize.caption,
    color: Colors.error,
    marginTop: -Spacing.sm,
  },

  // ── Range presets ─────────────────────────────────────────────────────────
  rangePresets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  rangeChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md12,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    minWidth: 68,
    alignItems: 'center',
  },
  rangeChipActive: {
    backgroundColor: Colors.primaryMuted,
    borderColor: Colors.primary,
  },
  rangeChipLabel: {
    fontSize: FontSize.body,
    fontWeight: FontWeight.medium,
    color: Colors.textSecondary,
  },
  rangeChipLabelActive: {
    color: Colors.primary,
    fontWeight: FontWeight.semibold,
  },

  // ── Privacy link row ─────────────────────────────────────────────────────
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  linkRowText: {
    flex: 1,
    gap: 2,
  },
  linkRowTitle: {
    fontSize: FontSize.body,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  linkRowHint: {
    fontSize: FontSize.caption,
    color: Colors.textSecondary,
    lineHeight: FontSize.caption * 1.5,
  },
  linkRowChevron: {
    fontSize: FontSize.heading,
    color: Colors.textTertiary,
  },

  // ── DND toggle ────────────────────────────────────────────────────────────
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  toggleTextWrap: {
    flex: 1,
    gap: Spacing.xs,
  },
  toggleTitle: {
    fontSize: FontSize.body,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  toggleHint: {
    fontSize: FontSize.caption,
    color: Colors.textSecondary,
    lineHeight: FontSize.caption * 1.5,
  },

  // ── Error banner ──────────────────────────────────────────────────────────
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

  // ── Actions ───────────────────────────────────────────────────────────────
  actions: {
    gap: Spacing.sm,
  },
});

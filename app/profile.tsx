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
import { ActionSheetIOS, ActivityIndicator, Alert, Platform, View } from 'react-native';
import { Redirect, Stack, useRouter } from 'expo-router';

import { LoadingState } from '@/components/LoadingState';
import { RangeSelector } from '@/components/RangeSelector';
import {
  AppText,
  Avatar,
  Button,
  ListSection,
  ListSwitchRow,
  Notice,
  ScreenScroll,
  TextField,
} from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { DEFAULT_RANGE_M } from '@/services/units';
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
import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import { SCREEN_INSET, Spacing } from '@/theme/spacing';

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const router = useRouter();
  const styles = useStyles();
  const { colors } = useTheme();
  const { user, isLoading: authLoading, signOut } = useAuth();
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
      if (!isInitialSetup && router.canGoBack()) {
        router.back();
      } else {
        // Route gate in index.tsx will now see isComplete = true.
        router.replace('/');
      }
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

  function openPhotoMenu() {
    const hasPhoto = avatarUrl.length > 0;
    const options = ['Choose from Library', 'Take Photo', ...(hasPhoto ? ['Remove Photo'] : []), 'Cancel'];
    const run = (i: number) => {
      if (i === 0) void handlePhoto('library');
      if (i === 1) void handlePhoto('camera');
      if (hasPhoto && i === 2) handleRemovePhoto();
    };
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: options.length - 1,
          destructiveButtonIndex: hasPhoto ? 2 : undefined,
        },
        run,
      );
      return;
    }
    Alert.alert('Profile Photo', undefined, [
      ...options.slice(0, -1).map((text, i) => ({ text, onPress: () => run(i) })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }

  function handleSignOut() {
    Alert.alert('Sign out of RoadPing?', undefined, [
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

  const previewName = displayName.trim().length > 0 ? displayName : handle;

  return (
    <ScreenScroll>
      <Stack.Screen options={{ headerShown: !isInitialSetup, title: 'Profile' }} />

      {isInitialSetup && (
        <View style={styles.intro}>
          <AppText variant="footnote" color="secondary" weight="medium">
            Step 1 of 2
          </AppText>
          <AppText variant="largeTitle" weight="bold" accessibilityRole="header">
            Your profile
          </AppText>
          <AppText variant="body" color="secondary">
            This is how nearby drivers and room members see you.
          </AppText>
        </View>
      )}

      <View style={styles.photo}>
        <View>
          <Avatar name={previewName} uri={avatarUrl.length > 0 ? avatarUrl : null} size={96} self />
          {photoBusy && (
            <View style={[styles.photoBusy, { backgroundColor: colors.scrim }]}>
              <ActivityIndicator color={colors.textOnColor} />
            </View>
          )}
        </View>
        <Button
          label={avatarUrl.length > 0 ? 'Edit Photo' : 'Add Photo'}
          variant="plain"
          size="sm"
          disabled={photoBusy}
          onPress={openPhotoMenu}
        />
        {photoError !== null && <Notice tone="danger" message={photoError} style={styles.fullWidth} />}
      </View>

      <View style={styles.fields}>
        <TextField
          label="Handle"
          placeholder="e.g. fastdriver_99"
          value={handle}
          onChangeText={onHandleChange}
          error={handleError}
          helper="3–24 characters: lowercase letters, numbers and underscores."
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          maxLength={24}
          returnKeyType="next"
        />
        <TextField
          label="Display name"
          placeholder="How you appear to others"
          value={displayName}
          onChangeText={onDisplayNameChange}
          error={displayNameError}
          autoCapitalize="words"
          maxLength={40}
          returnKeyType="done"
        />
      </View>

      <ListSection
        header="Default range"
        footer="Live drivers within this distance can see you, and you them."
      >
        <View style={styles.block}>
          <RangeSelector value={rangeM} onChange={setRangeM} />
        </View>
      </ListSection>

      <ListSection footer="They still see you on the map.">
        <ListSwitchRow
          icon="moon.fill"
          title="Do Not Disturb"
          subtitle="Hide your talking status from nearby drivers"
          value={dndMode}
          onValueChange={setDndMode}
        />
      </ListSection>

      <View style={styles.actions}>
        {saveError !== null && <Notice tone="danger" title="Couldn't save" message={saveError} />}
        <Button
          label={isInitialSetup ? 'Continue' : 'Save'}
          size="lg"
          fullWidth
          loading={saving}
          onPress={() => void handleSave()}
        />
        {isInitialSetup && (
          <Button label="Sign Out" variant="plain" fullWidth disabled={saving} onPress={handleSignOut} />
        )}
      </View>
    </ScreenScroll>
  );
}

const useStyles = makeStyles(() => ({
  intro: {
    paddingHorizontal: SCREEN_INSET,
    gap: Spacing.xs,
  },
  photo: {
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: SCREEN_INSET,
  },
  photoBusy: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  fields: {
    paddingHorizontal: SCREEN_INSET,
    gap: Spacing.md,
  },
  block: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md12,
  },
  actions: {
    paddingHorizontal: SCREEN_INSET,
    gap: Spacing.sm,
  },
}));

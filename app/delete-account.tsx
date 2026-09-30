/**
 * app/delete-account.tsx — In-app account deletion (Apple App Review
 * requirement 5.1.1(v)).
 *
 * Two-step:
 *  1. Plain-language summary of what is deleted, kept, and that the action
 *     is irreversible.
 *  2. Native Alert confirm — destructive.
 *
 * On success: the Edge Function has already removed the auth user, so the
 * Supabase client's next request will fail. We sign out locally to clear
 * the session, then redirect to /onboarding.
 */
import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';

import { AppText, Button, Icon, ListSection, Notice, ScreenScroll } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { deleteAccount } from '@/services/account';
import { stopLiveSession } from '@/services/liveSession';
import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH_TARGET, SCREEN_INSET, Spacing } from '@/theme/spacing';

const DELETED_ITEMS = [
  'Your profile, handle, and display name',
  'Your vehicles',
  'Your private zones',
  'Any active live session and live location',
  'Your push notification tokens',
  'Drivers you have blocked',
  'Your room memberships',
] as const;

const RETAINED_ITEMS = [
  'Reports you filed are kept for safety review, but your identity as the reporter is removed (anonymized).',
] as const;

function Bullet({ text, kept = false }: { text: string; kept?: boolean }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.bullet}>
      <Icon
        name={kept ? 'info.circle.fill' : 'minus.circle.fill'}
        size={18}
        color={kept ? colors.textSecondary : colors.danger}
      />
      <AppText variant="body" style={styles.flex}>
        {text}
      </AppText>
    </View>
  );
}

export default function DeleteAccountScreen() {
  const router = useRouter();
  const styles = useStyles();
  const { signOut } = useAuth();
  const [deleting, setDeleting] = useState(false);

  function handleConfirm() {
    Alert.alert(
      'Delete your account?',
      'This permanently deletes your RoadPing account and cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Forever',
          style: 'destructive',
          onPress: () => {
            void runDelete();
          },
        },
      ],
    );
  }

  async function runDelete() {
    setDeleting(true);
    try {
      // Best-effort: end the server session before destructive work.
      try {
        await stopLiveSession();
      } catch {
        // Already ended or unreachable — proceed.
      }

      await deleteAccount();

      // The server has destroyed the user; clear local session and route out.
      try {
        await signOut();
      } catch {
        // Auth row already gone — token will be rejected anyway.
      }
      router.replace('/onboarding');
    } catch {
      setDeleting(false);
      Alert.alert(
        "Couldn't delete your account",
        'Please check your connection and try again. If this keeps happening, email support@roadping.app.',
      );
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerBackVisible: !deleting, gestureEnabled: !deleting }} />
      <ScreenScroll>
        <AppText variant="body" color="secondary" style={styles.lead}>
          You can permanently delete your RoadPing account at any time, right
          here in the app. You don't need to email us first.
        </AppText>

        <ListSection header="What gets deleted">
          {DELETED_ITEMS.map((item) => (
            <Bullet key={item} text={item} />
          ))}
        </ListSection>

        <ListSection header="What RoadPing keeps">
          {RETAINED_ITEMS.map((item) => (
            <Bullet key={item} text={item} kept />
          ))}
        </ListSection>

        <View style={styles.actions}>
          <Notice
            tone="danger"
            title="This can't be undone"
            message="Your account is removed immediately. You won't be able to recover your handle, vehicles or zones."
          />
          <Button
            label={deleting ? 'Deleting…' : 'Delete My Account'}
            variant="destructive"
            size="lg"
            fullWidth
            loading={deleting}
            disabled={deleting}
            onPress={handleConfirm}
          />
          <Button
            label="Cancel"
            variant="plain"
            fullWidth
            disabled={deleting}
            onPress={() => router.back()}
          />
          <AppText variant="footnote" color="secondary" align="center">
            Need help? Email support@roadping.app
          </AppText>
        </View>
      </ScreenScroll>
    </>
  );
}

const useStyles = makeStyles(() => ({
  lead: {
    paddingHorizontal: SCREEN_INSET,
  },
  bullet: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md12,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md12 - 2,
  },
  flex: {
    flex: 1,
  },
  actions: {
    paddingHorizontal: SCREEN_INSET,
    gap: Spacing.md12,
  },
}));

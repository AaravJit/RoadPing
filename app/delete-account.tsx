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
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/AppButton';
import { Colors } from '@/theme/colors';
import { FontSize, FontWeight } from '@/theme/typography';
import { Radius, Spacing } from '@/theme/spacing';
import { useAuth } from '@/hooks/useAuth';
import { deleteAccount } from '@/services/account';
import { stopLiveSession } from '@/services/liveSession';

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

export default function DeleteAccountScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const [deleting, setDeleting] = useState(false);

  function handleConfirm() {
    Alert.alert(
      'Delete account?',
      'This permanently deletes your RoadPing account and cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete forever',
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
    } catch (e) {
      setDeleting(false);
      Alert.alert(
        'Could not delete account',
        'Something went wrong. Please check your connection and try again. ' +
          'If this keeps happening, email support@roadping.app.',
      );
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          disabled={deleting}
        >
          <Text style={[styles.backBtn, deleting && styles.disabledText]}>
            ‹ Back
          </Text>
        </Pressable>
        <Text style={styles.title}>Delete account</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.lead}>
          You can permanently delete your RoadPing account at any time, right
          here in the app. There is no need to email us first.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>What gets deleted</Text>
          {DELETED_ITEMS.map((item) => (
            <View key={item} style={styles.bulletRow}>
              <Text style={styles.bulletDot}>•</Text>
              <Text style={styles.bulletText}>{item}</Text>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>What we keep</Text>
          {RETAINED_ITEMS.map((item) => (
            <View key={item} style={styles.bulletRow}>
              <Text style={styles.bulletDot}>•</Text>
              <Text style={styles.bulletText}>{item}</Text>
            </View>
          ))}
        </View>

        <View style={styles.warningCard}>
          <Text style={styles.warningTitle}>This cannot be undone</Text>
          <Text style={styles.warningBody}>
            Once you tap Delete forever, your account is removed immediately.
            You will not be able to recover your handle, vehicles, or zones.
          </Text>
        </View>

        <View style={styles.actions}>
          <AppButton
            label={deleting ? 'Deleting…' : 'Delete my account'}
            variant="danger"
            size="lg"
            fullWidth
            loading={deleting}
            disabled={deleting}
            onPress={handleConfirm}
          />
          <AppButton
            label="Cancel"
            variant="ghost"
            size="md"
            fullWidth
            disabled={deleting}
            onPress={() => router.back()}
          />
        </View>

        <Text style={styles.supportNote}>
          Need help? Contact support@roadping.app
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    fontSize: FontSize.body,
    color: Colors.primary,
    fontWeight: FontWeight.medium,
    minWidth: 60,
  },
  disabledText: { opacity: 0.4 },
  title: {
    flex: 1,
    fontSize: FontSize.body,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  headerSpacer: { minWidth: 60 },

  scroll: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxl,
    gap: Spacing.lg,
  },
  lead: {
    fontSize: FontSize.body,
    color: Colors.textSecondary,
    lineHeight: FontSize.body * 1.5,
  },

  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  cardTitle: {
    fontSize: FontSize.bodySmall,
    fontWeight: FontWeight.semibold,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  bulletRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  bulletDot: {
    fontSize: FontSize.body,
    color: Colors.primary,
    width: 12,
  },
  bulletText: {
    flex: 1,
    fontSize: FontSize.bodySmall,
    color: Colors.textPrimary,
    lineHeight: FontSize.bodySmall * 1.5,
  },

  warningCard: {
    backgroundColor: Colors.errorMuted,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.error,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  warningTitle: {
    fontSize: FontSize.body,
    fontWeight: FontWeight.semibold,
    color: Colors.error,
  },
  warningBody: {
    fontSize: FontSize.bodySmall,
    color: Colors.textSecondary,
    lineHeight: FontSize.bodySmall * 1.5,
  },

  actions: {
    gap: Spacing.sm,
  },

  supportNote: {
    fontSize: FontSize.caption,
    color: Colors.textTertiary,
    textAlign: 'center',
  },
});

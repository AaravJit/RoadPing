import React from 'react';
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

import { LoadingState } from '@/components/LoadingState';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { Colors } from '@/theme/colors';
import { FontSize, FontWeight } from '@/theme/typography';
import { Radius, Spacing } from '@/theme/spacing';
import { useBlockedUsers } from '@/hooks/useBlockedUsers';
import type { BlockedUserProfile } from '@/services/moderation';

// ─── BlockedUserRow ───────────────────────────────────────────────────────────

interface BlockedUserRowProps {
  user: BlockedUserProfile;
  onUnblock: () => void;
  disabled: boolean;
}

function BlockedUserRow({ user, onUnblock, disabled }: BlockedUserRowProps) {
  const initial = user.display_name[0]?.toUpperCase() ?? '?';

  function confirmUnblock() {
    const label = user.handle !== null ? `@${user.handle}` : user.display_name;
    Alert.alert(
      'Unblock driver?',
      `You and ${label} will be able to see each other again when both live.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Unblock', onPress: onUnblock },
      ],
    );
  }

  return (
    <View style={styles.row}>
      <View style={styles.avatar}>
        <Text style={styles.avatarLetter}>{initial}</Text>
      </View>

      <View style={styles.rowInfo}>
        <Text style={styles.displayName} numberOfLines={1}>
          {user.display_name}
        </Text>
        {user.handle !== null && (
          <Text style={styles.handle} numberOfLines={1}>
            @{user.handle}
          </Text>
        )}
      </View>

      <Pressable
        style={[styles.unblockBtn, disabled && styles.unblockBtnDisabled]}
        onPress={confirmUnblock}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`Unblock ${user.display_name}`}
      >
        <Text style={styles.unblockBtnLabel}>Unblock</Text>
      </Pressable>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function BlockedUsersScreen() {
  const router = useRouter();
  const { blockedUsers, isLoading, isMutating, error, refresh, unblock } =
    useBlockedUsers();

  async function handleUnblock(blockedId: string) {
    try {
      await unblock(blockedId);
    } catch {
      Alert.alert('Unblock failed', 'Please try again.');
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
        >
          <Text style={styles.backBtn}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Blocked Drivers</Text>
        <View style={styles.headerSpacer} />
      </View>

      {isLoading ? (
        <LoadingState message="Loading…" />
      ) : error !== null ? (
        <ErrorState
          title="Couldn't load"
          message={error}
          onRetry={() => {
            void refresh();
          }}
        />
      ) : blockedUsers.length === 0 ? (
        <EmptyState
          icon="🚫"
          title="No blocked drivers"
          message="Drivers you block will appear here. They won't be able to see you, and you won't see them."
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        >
          {blockedUsers.map((u) => (
            <BlockedUserRow
              key={u.blocked_id}
              user={u}
              onUnblock={() => {
                void handleUnblock(u.blocked_id);
              }}
              disabled={isMutating}
            />
          ))}
        </ScrollView>
      )}
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
    fontSize: FontSize.body,
    color: Colors.primary,
    fontWeight: FontWeight.medium,
    minWidth: 60,
  },
  title: {
    flex: 1,
    fontSize: FontSize.body,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  headerSpacer: {
    minWidth: 60,
  },

  list: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontSize: FontSize.body,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
  },
  rowInfo: {
    flex: 1,
    gap: 2,
  },
  displayName: {
    fontSize: FontSize.body,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  handle: {
    fontSize: FontSize.caption,
    color: Colors.textSecondary,
  },

  unblockBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceElevated,
  },
  unblockBtnDisabled: {
    opacity: 0.4,
  },
  unblockBtnLabel: {
    fontSize: FontSize.caption,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
  },
});

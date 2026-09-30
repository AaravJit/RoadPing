/**
 * app/blocked-users.tsx — people you've blocked, with Unblock.
 * Blocks are mutual and silent; the copy says so.
 */
import React from 'react';
import { Alert } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { LoadingState } from '@/components/LoadingState';
import { personHandle, personName } from '@/components/identity';
import { Avatar, Button, ListRow, ListSection, ScreenBackground, ScreenScroll } from '@/components/ui';
import { useBlockedUsers } from '@/hooks/useBlockedUsers';
import type { BlockedUserProfile } from '@/services/moderation';

function BlockedUserRow({
  user,
  onUnblock,
  disabled,
}: {
  user: BlockedUserProfile;
  onUnblock: () => void;
  disabled: boolean;
}) {
  const name = personName(user);
  const handle = personHandle(user);

  function confirmUnblock() {
    Alert.alert(
      `Unblock ${name}?`,
      "You'll be able to see each other again when you're both live. They won't be told.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Unblock', onPress: onUnblock },
      ],
    );
  }

  return (
    <ListRow
      title={name}
      subtitle={handle !== null && handle !== name ? handle : undefined}
      leading={<Avatar name={name} uri={user.avatar_url} size={40} />}
      trailing={
        <Button
          label="Unblock"
          variant="secondary"
          size="sm"
          onPress={confirmUnblock}
          disabled={disabled}
          accessibilityLabel={`Unblock ${name}`}
        />
      }
    />
  );
}

export default function BlockedUsersScreen() {
  const { blockedUsers, isLoading, isMutating, error, refresh, unblock } = useBlockedUsers();

  async function handleUnblock(blockedId: string) {
    try {
      await unblock(blockedId);
    } catch {
      Alert.alert("Couldn't unblock", 'Please try again.');
    }
  }

  if (isLoading) return <LoadingState message="Loading…" />;

  if (error !== null) {
    return (
      <ScreenBackground>
        <ErrorState title="Couldn't load blocked drivers" message={error} onRetry={() => void refresh()} />
      </ScreenBackground>
    );
  }

  if (blockedUsers.length === 0) {
    return (
      <ScreenBackground>
        <EmptyState
          icon="nosign"
          title="No blocked drivers"
          message="When you block someone, you stop seeing each other on RoadPing. They aren't told."
        />
      </ScreenBackground>
    );
  }

  return (
    <ScreenScroll>
      <ListSection footer="Blocked drivers can't see you on the live map, and you won't see them. They aren't told.">
        {blockedUsers.map((u) => (
          <BlockedUserRow
            key={u.blocked_id}
            user={u}
            onUnblock={() => void handleUnblock(u.blocked_id)}
            disabled={isMutating}
          />
        ))}
      </ListSection>
    </ScreenScroll>
  );
}

/**
 * app/rooms.tsx — rooms you belong to; create one or join with a code.
 *
 * Rooms are always private. Only members can access them.
 * No text chat, no persistent audio, no social feed.
 * Deleting or leaving a room happens inside the room.
 */
import React, { useState } from 'react';
import { ActionSheetIOS, Alert, Platform, Pressable, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';

import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { LoadingState } from '@/components/LoadingState';
import {
  Button,
  Icon,
  ListRow,
  ListSection,
  ScreenBackground,
  ScreenScroll,
  Sheet,
  TextField,
} from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { useRooms } from '@/hooks/useRooms';
import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH_TARGET, Spacing } from '@/theme/spacing';

type Panel = 'none' | 'create' | 'join';

export default function RoomsScreen() {
  const router = useRouter();
  const styles = useStyles();
  const { accent } = useTheme();
  const { user } = useAuth();
  const { rooms, isLoading, isMutating, error, refresh, create, join } = useRooms();

  const [panel, setPanel] = useState<Panel>('none');
  const [roomName, setRoomName] = useState('');
  const [roomDescription, setRoomDescription] = useState('');
  const [roomNameError, setRoomNameError] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState('');
  const [inviteCodeError, setInviteCodeError] = useState<string | null>(null);

  function openPanel(mode: Panel) {
    setRoomName('');
    setRoomDescription('');
    setRoomNameError(null);
    setInviteCode('');
    setInviteCodeError(null);
    setPanel(mode);
  }

  function openAddMenu() {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['New Room', 'Join with Code', 'Cancel'], cancelButtonIndex: 2 },
        (i) => {
          if (i === 0) openPanel('create');
          if (i === 1) openPanel('join');
        },
      );
      return;
    }
    Alert.alert('Rooms', undefined, [
      { text: 'New Room', onPress: () => openPanel('create') },
      { text: 'Join with Code', onPress: () => openPanel('join') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function handleCreate() {
    const trimmedName = roomName.trim();
    if (trimmedName.length === 0) {
      setRoomNameError('Room name is required.');
      return;
    }
    if (trimmedName.length > 80) {
      setRoomNameError('Must be 80 characters or fewer.');
      return;
    }
    setRoomNameError(null);

    try {
      const resp = await create({
        name: trimmedName,
        description: roomDescription.trim() || undefined,
        is_private: true,
      });
      setPanel('none');
      router.push(`/room/${resp.room_id}`);
    } catch (e) {
      Alert.alert("Couldn't create room", e instanceof Error ? e.message : 'Please try again.');
    }
  }

  async function handleJoin() {
    const code = inviteCode.trim().toUpperCase();
    if (code.length === 0) {
      setInviteCodeError('Enter an invite code.');
      return;
    }
    setInviteCodeError(null);

    try {
      const resp = await join(code);
      setPanel('none');
      router.push(`/room/${resp.room_id}`);
    } catch (e) {
      setInviteCodeError(e instanceof Error ? e.message : 'Invalid code.');
    }
  }

  const headerRight = () => (
    <Pressable
      onPress={openAddMenu}
      hitSlop={8}
      style={styles.headerBtn}
      accessibilityRole="button"
      accessibilityLabel="New room or join with code"
    >
      <Icon name="plus" size={20} color={accent.text} weight="semibold" />
    </Pressable>
  );

  let content: React.ReactNode;
  if (isLoading) {
    content = <LoadingState message="Loading rooms…" />;
  } else if (error !== null) {
    content = (
      <ScreenBackground>
        <ErrorState title="Couldn't load rooms" message={error} onRetry={() => void refresh()} />
      </ScreenBackground>
    );
  } else if (rooms.length === 0) {
    content = (
      <ScreenBackground>
        <EmptyState
          icon="person.3.fill"
          title="No rooms yet"
          message="A room is a private channel for a group you drive with. Create one or join with an invite code."
          actionLabel="New Room"
          onAction={() => openPanel('create')}
        />
        <View style={styles.joinBelow}>
          <Button label="Join with Code" variant="plain" onPress={() => openPanel('join')} />
        </View>
      </ScreenBackground>
    );
  } else {
    content = (
      <ScreenScroll>
        <ListSection footer="Rooms are private. Only people with the invite code can join.">
          {rooms.map((room) => {
            const isOwner = room.owner_id === user?.id;
            const detail =
              room.description !== null && room.description.length > 0
                ? room.description
                : isOwner
                  ? 'You created this room'
                  : 'Private room';
            return (
              <ListRow
                key={room.id}
                icon="person.3.fill"
                iconTone="accent"
                title={room.name}
                subtitle={detail}
                onPress={() => router.push(`/room/${room.id}`)}
              />
            );
          })}
        </ListSection>
      </ScreenScroll>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerRight }} />
      {content}

      <Sheet visible={panel === 'create'} onClose={() => setPanel('none')} title="New Room">
        <View style={styles.form}>
          <TextField
            label="Name"
            placeholder="e.g. Friday Night Cruise"
            value={roomName}
            onChangeText={(t) => {
              setRoomName(t);
              setRoomNameError(null);
            }}
            error={roomNameError}
            maxLength={80}
            autoFocus
            returnKeyType="next"
          />
          <TextField
            label="Description (optional)"
            placeholder="What is this room for?"
            value={roomDescription}
            onChangeText={setRoomDescription}
            maxLength={300}
            returnKeyType="done"
          />
          <Button
            label="Create Room"
            size="lg"
            fullWidth
            loading={isMutating}
            onPress={() => void handleCreate()}
          />
        </View>
      </Sheet>

      <Sheet visible={panel === 'join'} onClose={() => setPanel('none')} title="Join a Room">
        <View style={styles.form}>
          <TextField
            label="Invite code"
            placeholder="e.g. XKZM4QRT"
            value={inviteCode}
            onChangeText={(t) => {
              setInviteCode(t.toUpperCase());
              setInviteCodeError(null);
            }}
            error={inviteCodeError}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={12}
            autoFocus
            returnKeyType="go"
            onSubmitEditing={() => void handleJoin()}
          />
          <Button label="Join" size="lg" fullWidth loading={isMutating} onPress={() => void handleJoin()} />
        </View>
      </Sheet>
    </>
  );
}

const useStyles = makeStyles(() => ({
  headerBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinBelow: {
    alignItems: 'center',
    paddingBottom: Spacing.xxl,
  },
  form: {
    paddingHorizontal: Spacing.md20,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
}));

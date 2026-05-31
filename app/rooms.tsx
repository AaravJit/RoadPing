/**
 * app/rooms.tsx — list rooms you're a member of; create or join a room.
 *
 * Rooms are always private. Only members can access them.
 * No text chat, no persistent audio, no social feed.
 */
import React, { useState } from 'react';
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
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/AppButton';
import { AppInput } from '@/components/AppInput';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { LoadingState } from '@/components/LoadingState';
import { RoomCard } from '@/components/RoomCard';
import { Colors } from '@/theme/colors';
import { FontSize, FontWeight } from '@/theme/typography';
import { Radius, Spacing } from '@/theme/spacing';
import { useAuth } from '@/hooks/useAuth';
import { useRooms } from '@/hooks/useRooms';

// ─── Panel mode ───────────────────────────────────────────────────────────────

type PanelMode = 'none' | 'create' | 'join';

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function RoomsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { rooms, isLoading, isMutating, error, refresh, create, join, remove } =
    useRooms();

  // ── Panel state ───────────────────────────────────────────────────────────
  const [panelMode, setPanelMode] = useState<PanelMode>('none');
  const [roomName, setRoomName] = useState('');
  const [roomDescription, setRoomDescription] = useState('');
  const [roomNameError, setRoomNameError] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState('');
  const [inviteCodeError, setInviteCodeError] = useState<string | null>(null);

  // ── Handlers ──────────────────────────────────────────────────────────────

  function openPanel(mode: PanelMode) {
    setRoomName('');
    setRoomDescription('');
    setRoomNameError(null);
    setInviteCode('');
    setInviteCodeError(null);
    setPanelMode(mode);
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
      setPanelMode('none');
      // Navigate into the newly created room.
      router.push(`/room/${resp.room_id}`);
    } catch (e) {
      Alert.alert(
        'Could not create room',
        e instanceof Error ? e.message : 'Please try again.',
      );
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
      setPanelMode('none');
      router.push(`/room/${resp.room_id}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Invalid code.';
      setInviteCodeError(msg);
    }
  }

  function handleDeleteRoom(roomId: string, roomName_: string) {
    Alert.alert(
      'Delete room?',
      `"${roomName_}" and all its members will be removed. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await remove(roomId);
              } catch (e) {
                Alert.alert(
                  'Delete failed',
                  e instanceof Error ? e.message : 'Please try again.',
                );
              }
            })();
          },
        },
      ],
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text style={styles.backBtn}>‹ Back</Text>
          </Pressable>
          <Text style={styles.title}>Rooms</Text>
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => openPanel(panelMode === 'join' ? 'none' : 'join')}
              style={styles.headerBtn}
              accessibilityRole="button"
              accessibilityLabel="Join room"
            >
              <Text style={styles.headerBtnText}>Join</Text>
            </Pressable>
            <Pressable
              onPress={() => openPanel(panelMode === 'create' ? 'none' : 'create')}
              style={[styles.headerBtn, styles.headerBtnPrimary]}
              accessibilityRole="button"
              accessibilityLabel="Create room"
            >
              <Text style={[styles.headerBtnText, styles.headerBtnPrimaryText]}>
                + Create
              </Text>
            </Pressable>
          </View>
        </View>

        {/* ── Create / Join panel ─────────────────────────────────────────── */}
        {panelMode === 'create' && (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Create Room</Text>
            <AppInput
              label="Room Name"
              placeholder="e.g. Friday Night Cruise"
              value={roomName}
              onChangeText={(t) => {
                setRoomName(t);
                setRoomNameError(null);
              }}
              error={roomNameError ?? undefined}
              maxLength={80}
              autoFocus
              returnKeyType="next"
            />
            <AppInput
              label="Description (optional)"
              placeholder="What is this room for?"
              value={roomDescription}
              onChangeText={setRoomDescription}
              maxLength={300}
              returnKeyType="done"
            />
            <View style={styles.panelActions}>
              <AppButton
                label="Cancel"
                variant="ghost"
                size="md"
                onPress={() => setPanelMode('none')}
              />
              <AppButton
                label="Create"
                variant="primary"
                size="md"
                loading={isMutating}
                onPress={() => {
                  void handleCreate();
                }}
              />
            </View>
          </View>
        )}

        {panelMode === 'join' && (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Join by Invite Code</Text>
            <AppInput
              label="Invite Code"
              placeholder="e.g. XKZM4QRT"
              value={inviteCode}
              onChangeText={(t) => {
                setInviteCode(t.toUpperCase());
                setInviteCodeError(null);
              }}
              error={inviteCodeError ?? undefined}
              autoCapitalize="characters"
              maxLength={12}
              autoFocus
              returnKeyType="go"
            />
            <View style={styles.panelActions}>
              <AppButton
                label="Cancel"
                variant="ghost"
                size="md"
                onPress={() => setPanelMode('none')}
              />
              <AppButton
                label="Join"
                variant="primary"
                size="md"
                loading={isMutating}
                onPress={() => {
                  void handleJoin();
                }}
              />
            </View>
          </View>
        )}

        {/* ── Room list ───────────────────────────────────────────────────── */}
        {isLoading ? (
          <LoadingState message="Loading rooms…" />
        ) : error !== null ? (
          <ErrorState
            title="Couldn't load rooms"
            message={error}
            onRetry={() => {
              void refresh();
            }}
          />
        ) : rooms.length === 0 ? (
          <EmptyState
            icon="🚗"
            title="No rooms yet"
            message="Create a private room or join one with an invite code to drive and talk with a group."
          />
        ) : (
          <ScrollView
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          >
            {rooms.map((room) => {
              const isOwner = room.owner_id === user?.id;
              return (
                <View key={room.id} style={styles.roomRowWrap}>
                  <RoomCard
                    room={room}
                    isOwner={isOwner}
                    onPress={() => router.push(`/room/${room.id}`)}
                  />
                  {isOwner && (
                    <Pressable
                      style={styles.deleteBtn}
                      onPress={() => handleDeleteRoom(room.id, room.name)}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete room ${room.name}`}
                    >
                      <Text style={styles.deleteBtnText}>Delete</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </ScrollView>
        )}
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

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.sm,
  },
  backBtn: {
    fontSize: FontSize.body,
    color: Colors.primary,
    fontWeight: FontWeight.medium,
    minWidth: 50,
  },
  title: {
    flex: 1,
    fontSize: FontSize.body,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  headerBtn: {
    paddingHorizontal: Spacing.md12,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  headerBtnPrimary: {
    backgroundColor: Colors.primaryMuted,
    borderColor: Colors.primary,
  },
  headerBtnText: {
    fontSize: FontSize.bodySmall,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
  },
  headerBtnPrimaryText: {
    color: Colors.primary,
  },

  // Create / Join panel
  panel: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  panelTitle: {
    fontSize: FontSize.bodyLarge,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  panelActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
  },

  // Room list
  list: {
    padding: Spacing.md,
    gap: Spacing.md,
  },
  roomRowWrap: {
    gap: Spacing.xs,
  },
  deleteBtn: {
    alignSelf: 'flex-end',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  deleteBtnText: {
    fontSize: FontSize.caption,
    color: Colors.error,
    fontWeight: FontWeight.medium,
  },
});

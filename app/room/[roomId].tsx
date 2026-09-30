/**
 * app/room/[roomId].tsx — Room session screen.
 *
 * Shows active members (vehicle-first identity + speaking indicators),
 * an invite code to share, and a Hold-to-Talk button.
 *
 * PTT requires the user to have an active live session (started from Drive).
 * Members are polled every 3 s for speaking state changes.
 *
 * Rules upheld:
 *  - Non-members are blocked by get-room-members (403)
 *  - No text chat, no permanent audio, no exact coordinates
 *  - Owner: Delete room button. Non-owner: Leave room button.
 *  - Owner cannot leave while other members are present.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActionSheetIOS, Alert, Linking, Platform, Pressable, ScrollView, Share, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { HoldToTalkButton } from '@/components/HoldToTalkButton';
import { LoadingState } from '@/components/LoadingState';
import { ReportModal, type ReportTarget } from '@/components/ReportModal';
import { SpeakingWave } from '@/components/SpeakingWave';
import { personName, vehicleDescription, vehicleEmoji } from '@/components/identity';
import {
  AppText,
  Avatar,
  Icon,
  ListRow,
  ListSection,
  Notice,
  ScreenBackground,
} from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useHoldToTalk } from '@/hooks/useHoldToTalk';
import { blockUser } from '@/services/moderation';
import { getRoomMembers, leaveRoom, deleteRoom, getActiveLiveSessionId } from '@/services/rooms';
import { supabase } from '@/services/supabase';
import { subscribeToSpeakingState } from '@/services/voice';
import { agoraUidForUser, setRemoteSpeakingListener } from '@/services/agoraVoice';
import type { RoomMember } from '@/services/api';
import type { RoomRow } from '@/services/types';
import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH_TARGET, SCREEN_INSET, Spacing } from '@/theme/spacing';

const POLL_INTERVAL_MS = 3_000;

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function RoomScreen() {
  const router = useRouter();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { colors, accent } = useTheme();
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const { user } = useAuth();
  const { profile } = useProfile(user?.id ?? null);

  // ── Room metadata ──────────────────────────────────────────────────────────
  const [room, setRoom] = useState<RoomRow | null>(null);
  const [roomLoading, setRoomLoading] = useState(true);
  const [roomError, setRoomError] = useState<string | null>(null);

  // ── Members ────────────────────────────────────────────────────────────────
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [membersError, setMembersError] = useState<string | null>(null);

  // ── PTT: active live session ───────────────────────────────────────────────
  const [liveSessionId, setLiveSessionId] = useState<string | null>(null);

  // ── UI ─────────────────────────────────────────────────────────────────────
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [leaving, setLeaving] = useState(false);

  // user_ids currently producing audio, per Agora's volume callback (native
  // builds only). Self-clearing: each callback reports the full speaking set.
  const [agoraSpeaking, setAgoraSpeaking] = useState<Set<string>>(new Set());

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const membersRef = useRef<RoomMember[]>([]);
  membersRef.current = members;

  // ── Fetch room details ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!roomId) return;
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('rooms')
          .select('*')
          .eq('id', roomId)
          .maybeSingle();
        if (error) throw error;
        if (!data) {
          setRoomError('Room not found.');
          return;
        }
        setRoom(data as RoomRow);
      } catch {
        setRoomError('Failed to load room.');
      } finally {
        setRoomLoading(false);
      }
    })();
  }, [roomId]);

  // ── Fetch active live session for PTT ──────────────────────────────────────
  useEffect(() => {
    void (async () => {
      const id = await getActiveLiveSessionId();
      setLiveSessionId(id);
    })();
  }, []);

  // ── Load members + start polling ───────────────────────────────────────────
  const fetchMembers = useCallback(async () => {
    if (!roomId) return;
    try {
      const list = await getRoomMembers(roomId);
      setMembers(list);
      setMembersError(null);
    } catch (e) {
      setMembersError(e instanceof Error ? e.message : 'Failed to load members.');
    } finally {
      setMembersLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    void fetchMembers();
    pollRef.current = setInterval(() => {
      void fetchMembers();
    }, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current !== null) clearInterval(pollRef.current);
    };
  }, [fetchMembers]);

  // Realtime: fast-forward is_speaking between the 3 s poll cycles.
  useEffect(() => {
    if (!roomId) return;
    const unsub = subscribeToSpeakingState(roomId, (change) => {
      setMembers((prev) =>
        prev.map((m) =>
          m.user_id === change.user_id
            ? { ...m, is_speaking: change.is_speaking }
            : m,
        ),
      );
    });
    return unsub;
  }, [roomId]);

  // Map Agora remote-speaking uids → member user_ids for fast indicators.
  useEffect(() => {
    const unsub = setRemoteSpeakingListener((uids) => {
      const set = new Set<string>();
      for (const m of membersRef.current) {
        if (uids.includes(agoraUidForUser(m.user_id))) set.add(m.user_id);
      }
      setAgoraSpeaking(set);
    });
    return unsub;
  }, []);

  // ── Hold-to-Talk ───────────────────────────────────────────────────────────
  const ptt = useHoldToTalk({
    liveSessionId,
    enabled: liveSessionId !== null,
    roomId,
    dnd: profile?.dnd_mode ?? false,
  });

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleShareCode() {
    if (room?.invite_code == null) return;
    try {
      await Share.share({
        message: `Join my RoadPing room "${room.name}" with code: ${room.invite_code}`,
        title: 'RoadPing Room Invite',
      });
    } catch {
      // Share dialog dismissed — no-op.
    }
  }

  function handleBlock(member: RoomMember) {
    const label = personName(member);
    Alert.alert(
      `Block ${label}?`,
      "You won't see each other on RoadPing. They won't be told.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await blockUser({ blocked_user_id: member.user_id });
                setMembers((prev) =>
                  prev.filter((m) => m.user_id !== member.user_id),
                );
                Alert.alert('Blocked', `You won't see ${label} anymore.`);
              } catch {
                Alert.alert("Couldn't block", 'Please try again.');
              }
            })();
          },
        },
      ],
    );
  }

  function handleReport(member: RoomMember) {
    setReportTarget({
      user_id: member.user_id,
      display_name: member.display_name,
      handle: member.handle,
    });
  }

  function handleLeaveOrDelete() {
    if (!room || !user) return;
    const isOwner = room.owner_id === user.id;

    if (isOwner) {
      Alert.alert(
        `Delete "${room.name}"?`,
        'The room and its member list are removed for everyone. This can\'t be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete Room',
            style: 'destructive',
            onPress: () => {
              void (async () => {
                setLeaving(true);
                try {
                  await deleteRoom(room.id);
                  router.back();
                } catch (e) {
                  Alert.alert(
                    "Couldn't delete room",
                    e instanceof Error ? e.message : 'Please try again.',
                  );
                  setLeaving(false);
                }
              })();
            },
          },
        ],
      );
    } else {
      Alert.alert(`Leave "${room.name}"?`, 'You can rejoin later with the invite code.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setLeaving(true);
              try {
                await leaveRoom(room.id);
                router.back();
              } catch (e) {
                Alert.alert(
                  "Couldn't leave room",
                  e instanceof Error ? e.message : 'Please try again.',
                );
                setLeaving(false);
              }
            })();
          },
        },
      ]);
    }
  }

  function openMemberActions(member: RoomMember) {
    const name = personName(member);
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: name,
          options: ['Report', 'Block', 'Cancel'],
          destructiveButtonIndex: 1,
          cancelButtonIndex: 2,
        },
        (i) => {
          if (i === 0) handleReport(member);
          if (i === 1) handleBlock(member);
        },
      );
      return;
    }
    Alert.alert(name, undefined, [
      { text: 'Report', onPress: () => handleReport(member) },
      { text: 'Block', style: 'destructive', onPress: () => handleBlock(member) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  function openRoomMenu() {
    if (room === null) return;
    const isOwnerNow = user !== null && room.owner_id === user.id;
    const hasCode = room.invite_code != null;
    const options = [
      ...(hasCode ? ['Share Invite Code'] : []),
      isOwnerNow ? 'Delete Room' : 'Leave Room',
      'Cancel',
    ];
    const destructiveIndex = hasCode ? 1 : 0;
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, destructiveButtonIndex: destructiveIndex, cancelButtonIndex: options.length - 1 },
        (i) => {
          if (hasCode && i === 0) void handleShareCode();
          if (i === destructiveIndex) handleLeaveOrDelete();
        },
      );
      return;
    }
    Alert.alert(room.name, undefined, [
      ...(hasCode ? [{ text: 'Share Invite Code', onPress: () => void handleShareCode() }] : []),
      { text: options[destructiveIndex] ?? 'Leave Room', style: 'destructive' as const, onPress: handleLeaveOrDelete },
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  if (roomLoading) return <LoadingState message="Loading room…" />;
  if (roomError !== null) {
    return (
      <ScreenBackground>
        <Stack.Screen options={{ title: 'Room' }} />
        <ErrorState title="Room unavailable" message={roomError} />
      </ScreenBackground>
    );
  }

  const headerRight = () => (
    <Pressable
      onPress={openRoomMenu}
      disabled={leaving}
      hitSlop={8}
      style={styles.headerBtn}
      accessibilityRole="button"
      accessibilityLabel="Room options"
    >
      <Icon name="ellipsis" size={20} color={accent.text} weight="semibold" />
    </Pressable>
  );

  const memberCountLabel = `${members.length} ${members.length === 1 ? 'member' : 'members'}`;

  return (
    <ScreenBackground>
      <Stack.Screen options={{ title: room?.name ?? 'Room', headerRight }} />

      <ScrollView
        style={styles.flex}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.scroll}
      >
        {room?.invite_code != null && (
          <ListSection footer="Anyone with this code can join. Rooms are private and have no text chat.">
            <ListRow
              icon="square.and.arrow.up"
              iconTone="accent"
              title="Invite code"
              value={room.invite_code}
              onPress={() => void handleShareCode()}
              accessibilityLabel={`Invite code ${room.invite_code.split('').join(' ')}. Share`}
            />
          </ListSection>
        )}

        {membersLoading ? (
          <LoadingState fill={false} message="Loading members…" />
        ) : membersError !== null ? (
          <ErrorState
            fill={false}
            title="Couldn't load members"
            message={membersError}
            onRetry={() => void fetchMembers()}
          />
        ) : members.length === 0 ? (
          <EmptyState fill={false} icon="person.3.fill" title="No one here yet" message="Share the invite code to bring people in." />
        ) : (
          <ListSection header={memberCountLabel}>
            {members.map((raw) => {
              const m = agoraSpeaking.has(raw.user_id) ? { ...raw, is_speaking: true } : raw;
              const self = m.user_id === user?.id;
              const name = personName(m);
              const vehicle = `${vehicleEmoji(m.vehicle_type)} ${vehicleDescription(m)}`;
              const tags = [self ? 'You' : null, m.is_moderator ? 'Moderator' : null]
                .filter(Boolean)
                .join(' · ');
              return (
                <ListRow
                  key={m.user_id}
                  title={name}
                  subtitle={vehicle}
                  leading={
                    <Avatar name={name} uri={m.avatar_url} size={40} ring={m.is_speaking ? 'live' : undefined} self={self} />
                  }
                  trailing={
                    m.is_speaking ? (
                      <View style={styles.talking}>
                        <SpeakingWave active size={12} />
                        <AppText variant="footnote" weight="semibold" color="live">
                          Talking
                        </AppText>
                      </View>
                    ) : tags.length > 0 ? (
                      <AppText variant="footnote" color="secondary">
                        {tags}
                      </AppText>
                    ) : undefined
                  }
                  onPress={self ? undefined : () => openMemberActions(m)}
                  accessibilityLabel={`${name}${tags ? `, ${tags}` : ''}, ${vehicleDescription(m)}${m.is_speaking ? ', talking' : ''}`}
                  accessibilityHint={self ? undefined : 'Report or block'}
                />
              );
            })}
          </ListSection>
        )}
      </ScrollView>

      <View style={[styles.talkBar, { paddingBottom: Math.max(insets.bottom, Spacing.md) }]}>
        {liveSessionId === null ? (
          <Notice
            icon="mic.slash.fill"
            title="Go live to talk"
            message="Go live from Drive, then come back to hold to talk in this room."
            style={styles.fullWidth}
          />
        ) : (
          <>
            {ptt.micPermissionDenied && (
              <Notice
                tone="warning"
                title="Microphone is off"
                message="Allow microphone access in Settings to talk."
                actionLabel="Open Settings"
                onPress={() => void Linking.openSettings()}
                style={styles.fullWidth}
              />
            )}
            <HoldToTalkButton
              state={ptt.state}
              disabled={ptt.isDisabled}
              onPressIn={ptt.onPressIn}
              onPressOut={ptt.onPressOut}
              audience="the room"
            />
            <View style={styles.voiceStatus}>
              <Icon
                name={ptt.voiceConnected ? 'waveform' : 'info.circle.fill'}
                size={13}
                color={ptt.voiceConnected ? colors.success : colors.textSecondary}
              />
              <AppText variant="footnote" color="secondary">
                {ptt.voiceConnected
                  ? 'Room audio connected'
                  : "Talk status only. Audio isn't available right now."}
              </AppText>
            </View>
          </>
        )}
      </View>

      <ReportModal
        visible={reportTarget !== null}
        driver={reportTarget}
        context="room"
        onClose={() => setReportTarget(null)}
      />
    </ScreenBackground>
  );
}

const useStyles = makeStyles((t) => ({
  flex: {
    flex: 1,
  },
  scroll: {
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
    gap: Spacing.lg,
  },
  headerBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  talking: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  talkBar: {
    alignItems: 'center',
    gap: Spacing.md12,
    paddingTop: Spacing.md,
    paddingHorizontal: SCREEN_INSET,
    backgroundColor: t.colors.surface,
    borderTopWidth: 0.5,
    borderTopColor: t.colors.separator,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  voiceStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
}));

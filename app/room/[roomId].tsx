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
import {
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/AppButton';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { HoldToTalkButton } from '@/components/HoldToTalkButton';
import { LoadingState } from '@/components/LoadingState';
import { ReportModal } from '@/components/ReportModal';
import { RoomMemberCard } from '@/components/RoomMemberCard';
import { Colors } from '@/theme/colors';
import { FontSize, FontWeight } from '@/theme/typography';
import { Radius, Spacing } from '@/theme/spacing';
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

// Adapted from NearbyDriverCard shape for ReportModal compatibility.
type ReportTarget = {
  user_id: string;
  display_name: string;
  handle: string | null;
};

const POLL_INTERVAL_MS = 3_000;

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function RoomScreen() {
  const router = useRouter();
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
    const label = member.handle !== null ? `@${member.handle}` : member.display_name ?? 'this driver';
    Alert.alert(
      'Block driver?',
      `You and ${label} will become invisible to each other.`,
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
                Alert.alert('Blocked', "You won't see each other anymore.");
              } catch {
                Alert.alert('Block failed', 'Please try again.');
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
      display_name: member.display_name ?? 'Unknown',
      handle: member.handle,
    });
  }

  function handleLeaveOrDelete() {
    if (!room || !user) return;
    const isOwner = room.owner_id === user.id;

    if (isOwner) {
      Alert.alert(
        'Delete room?',
        `"${room.name}" and all members will be removed permanently.`,
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
                    'Delete failed',
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
      Alert.alert('Leave room?', `You will no longer be a member of "${room.name}".`, [
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
                  'Leave failed',
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

  // ── ReportModal shim (ReportModal expects NearbyDriverCard shape) ──────────
  const reportModalDriver = reportTarget !== null
    ? {
        user_id: reportTarget.user_id,
        display_name: reportTarget.display_name,
        handle: reportTarget.handle,
        avatar_url: null,
        vehicle_type: null,
        vehicle_label: null,
        vehicle_color: null,
        vehicle_make: null,
        vehicle_model: null,
        approximate_distance_m: 0,
        is_speaking: false,
        session_id: '',
        dnd: false,
      }
    : null;

  // ─── Render ─────────────────────────────────────────────────────────────

  if (roomLoading) return <LoadingState message="Loading room…" />;
  if (roomError !== null) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ErrorState title="Room unavailable" message={roomError} />
      </SafeAreaView>
    );
  }

  const isOwner = room !== null && user !== null && room.owner_id === user.id;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.backBtn}>‹ Back</Text>
        </Pressable>

        <View style={styles.headerCenter}>
          <Text style={styles.roomName} numberOfLines={1}>
            {room?.name ?? '…'}
          </Text>
          <Text style={styles.memberCount}>
            {members.length} {members.length === 1 ? 'member' : 'members'}
          </Text>
        </View>

        <AppButton
          label={leaving ? '…' : isOwner ? 'Delete' : 'Leave'}
          variant="danger"
          size="sm"
          loading={leaving}
          disabled={leaving}
          onPress={handleLeaveOrDelete}
        />
      </View>

      {/* ── Invite code bar ─────────────────────────────────────────────── */}
      {room?.invite_code != null && (
        <Pressable
          style={styles.codeBar}
          onPress={() => {
            void handleShareCode();
          }}
          accessibilityRole="button"
          accessibilityLabel={`Share invite code ${room.invite_code}`}
        >
          <Text style={styles.codeBarLabel}>Invite code</Text>
          <Text style={styles.codeBarCode}>{room.invite_code}</Text>
          <Text style={styles.codeBarShare}>Tap to share ↗</Text>
        </Pressable>
      )}

      {/* ── Member list ─────────────────────────────────────────────────── */}
      {membersLoading ? (
        <LoadingState message="Loading members…" />
      ) : membersError !== null ? (
        <ErrorState
          title="Couldn't load members"
          message={membersError}
          onRetry={() => {
            void fetchMembers();
          }}
        />
      ) : members.length === 0 ? (
        <EmptyState icon="🚗" title="No members" message="The room appears empty." />
      ) : (
        <ScrollView
          contentContainerStyle={styles.memberList}
          showsVerticalScrollIndicator={false}
        >
          {members.map((m) => (
            <RoomMemberCard
              key={m.user_id}
              member={
                agoraSpeaking.has(m.user_id)
                  ? { ...m, is_speaking: true }
                  : m
              }
              isSelf={m.user_id === user?.id}
              onBlock={m.user_id !== user?.id ? () => handleBlock(m) : undefined}
              onReport={m.user_id !== user?.id ? () => handleReport(m) : undefined}
            />
          ))}
        </ScrollView>
      )}

      {/* ── PTT zone ────────────────────────────────────────────────────── */}
      <View style={styles.pttZone}>
        {liveSessionId === null ? (
          <View style={styles.notLiveBanner}>
            <Text style={styles.notLiveText}>
              🎙 Start RoadPing from the Drive screen to use Hold to Talk
            </Text>
          </View>
        ) : (
          <>
            <HoldToTalkButton
              state={ptt.state}
              disabled={ptt.isDisabled}
              onPressIn={ptt.onPressIn}
              onPressOut={ptt.onPressOut}
            />
            {ptt.voiceConnected ? (
              <Text style={styles.voiceStatusOn}>🔊 Live room audio on</Text>
            ) : (
              <Text style={styles.voiceStatusOff}>
                Indicator only — live audio needs the TestFlight build
              </Text>
            )}
            {ptt.micPermissionDenied && (
              <Text style={styles.micDenied}>
                Mic access denied — enable it in Settings to talk
              </Text>
            )}
          </>
        )}
      </View>

      {/* ── Report modal ────────────────────────────────────────────────── */}
      <ReportModal
        visible={reportTarget !== null}
        driver={reportModalDriver}
        context="room"
        onClose={() => setReportTarget(null)}
        onSubmitted={() => setReportTarget(null)}
      />
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
    gap: Spacing.sm,
  },
  backBtn: {
    fontSize: FontSize.body,
    color: Colors.primary,
    fontWeight: FontWeight.medium,
    minWidth: 50,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  roomName: {
    fontSize: FontSize.body,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  memberCount: {
    fontSize: FontSize.caption,
    color: Colors.textTertiary,
  },

  // Invite code bar
  codeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surfaceElevated,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md12,
  },
  codeBarLabel: {
    fontSize: FontSize.caption,
    color: Colors.textTertiary,
    fontWeight: FontWeight.medium,
  },
  codeBarCode: {
    flex: 1,
    fontSize: FontSize.body,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    letterSpacing: 2,
  },
  codeBarShare: {
    fontSize: FontSize.caption,
    color: Colors.primary,
    fontWeight: FontWeight.medium,
  },

  // Member list
  memberList: {
    padding: Spacing.md,
    gap: Spacing.md,
  },

  // PTT zone
  pttZone: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  notLiveBanner: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md12,
    marginHorizontal: Spacing.md,
  },
  notLiveText: {
    fontSize: FontSize.bodySmall,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: FontSize.bodySmall * 1.5,
  },
  voiceStatusOn: {
    marginTop: Spacing.sm,
    fontSize: FontSize.caption,
    color: Colors.live,
    fontWeight: FontWeight.semibold,
    textAlign: 'center',
  },
  voiceStatusOff: {
    marginTop: Spacing.sm,
    fontSize: FontSize.caption,
    color: Colors.textTertiary,
    textAlign: 'center',
  },
  micDenied: {
    marginTop: Spacing.xs,
    fontSize: FontSize.caption,
    color: Colors.error,
    textAlign: 'center',
  },
});

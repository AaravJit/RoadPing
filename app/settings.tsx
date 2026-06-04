/**
 * app/settings.tsx — App settings: DND, default range, privacy links,
 * account actions (sign out, delete placeholder).
 *
 * Sign out stops the live session server-side before clearing the local auth
 * session, so the user's presence disappears from nearby radars immediately.
 */
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';

import { LoadingState } from '@/components/LoadingState';
import { ThemePicker } from '@/components/ThemePicker';
import { Colors } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';
import { FontSize, FontWeight } from '@/theme/typography';
import { Radius, Spacing } from '@/theme/spacing';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useVehicles } from '@/hooks/useVehicles';
import { useEntitlement } from '@/hooks/useEntitlement';
import { useUnits } from '@/hooks/useUnits';
import { useLiveMapBehavior } from '@/hooks/useLiveMapBehavior';
import {
  closestPresetIndex,
  rangePresetsFor,
  DEFAULT_RANGE_M,
} from '@/services/units';
import { updateProfile } from '@/services/profile';
import { stopLiveSession } from '@/services/liveSession';

// ─── Constants ────────────────────────────────────────────────────────────────

const APP_VERSION: string =
  (Constants.expoConfig?.version as string | undefined) ?? '1.0.0';

const SUPPORT_EMAIL = 'support@roadping.app';

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return <Text style={styles.sectionLabel}>{label}</Text>;
}

interface LinkRowProps {
  title: string;
  hint?: string;
  /** Current value/status shown on the right (e.g. the active vehicle). */
  value?: string;
  onPress: () => void;
  variant?: 'default' | 'danger';
}

function LinkRow({
  title,
  hint,
  value,
  onPress,
  variant = 'default',
}: LinkRowProps) {
  return (
    <Pressable
      style={styles.linkRow}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={value !== undefined ? `${title}, ${value}` : title}
    >
      <View style={styles.linkRowText}>
        <Text
          style={[
            styles.linkRowTitle,
            variant === 'danger' && styles.linkRowTitleDanger,
          ]}
        >
          {title}
        </Text>
        {hint !== undefined && (
          <Text style={styles.linkRowHint}>{hint}</Text>
        )}
      </View>
      {value !== undefined && (
        <Text style={styles.linkRowValue} numberOfLines={1}>
          {value}
        </Text>
      )}
      <Text style={styles.linkRowChevron}>›</Text>
    </Pressable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const router = useRouter();
  const { accent } = useTheme();
  const { isPlus, purchasesAvailable } = useEntitlement();
  const { system, setSystem, formatRange } = useUnits();
  const { behavior: liveMapBehavior, setBehavior: setLiveMapBehavior } =
    useLiveMapBehavior();
  const { user, signOut } = useAuth();
  const { profile, isLoading: profileLoading, refresh: refreshProfile } =
    useProfile(user?.id ?? null);
  const { primary: primaryVehicle } = useVehicles(user?.id ?? null);

  const [dndMode, setDndMode] = useState(false);
  const [rangeM, setRangeM] = useState(DEFAULT_RANGE_M);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (profile !== null) {
      setDndMode(profile.dnd_mode);
      setRangeM(profile.default_range_m);
    }
  }, [profile]);

  if (profileLoading && profile === null) {
    return <LoadingState message="Loading…" />;
  }

  // ── Handlers ────────────────────────────────────────────────────────────────

  async function handleToggleDnd(value: boolean) {
    if (user === null) return;
    setDndMode(value);
    setSaving(true);
    try {
      await updateProfile(user.id, { dnd_mode: value });
      await refreshProfile();
    } catch {
      setDndMode(!value); // revert
      Alert.alert('Could not update', 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRangeChange(value: number) {
    if (user === null) return;
    setRangeM(value);
    setSaving(true);
    try {
      await updateProfile(user.id, { default_range_m: value });
      await refreshProfile();
    } catch {
      setRangeM(profile?.default_range_m ?? DEFAULT_RANGE_M); // revert
      Alert.alert('Could not update', 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setSigningOut(true);
            try {
              // Best-effort: end server session before clearing local auth.
              await stopLiveSession();
            } catch {
              // Session may already be ended — proceed regardless.
            }
            try {
              await signOut();
              router.replace('/onboarding');
            } catch {
              Alert.alert('Sign out failed', 'Please try again.');
              setSigningOut(false);
            }
          })();
        },
      },
    ]);
  }

  function handleDeleteAccount() {
    router.push('/delete-account');
  }

  function handleSupport() {
    void Linking.openURL(`mailto:${SUPPORT_EMAIL}`);
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  const rangePresets = rangePresetsFor(system);
  const selectedRangeIndex = closestPresetIndex(rangePresets, rangeM);
  const activeVehicleLabel = primaryVehicle?.label ?? 'Not set';
  const rangeValueLabel = formatRange(rangeM);
  const unitsValueLabel = system === 'imperial' ? 'Miles' : 'Kilometers';

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
        <Text style={styles.title}>Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Account ──────────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <SectionLabel label="Account" />
          <LinkRow
            title="Profile"
            hint="Update your name and photo."
            onPress={() => router.push('/profile')}
          />
          <Pressable
            style={styles.linkRow}
            onPress={handleSignOut}
            disabled={signingOut}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
          >
            <View style={styles.linkRowText}>
              <Text style={[styles.linkRowTitle, styles.linkRowTitleDanger]}>
                {signingOut ? 'Signing out…' : 'Sign Out'}
              </Text>
              <Text style={styles.linkRowHint}>
                End your session on this device.
              </Text>
            </View>
          </Pressable>
        </View>

        {/* ── RoadPing ─────────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <SectionLabel label="RoadPing" />

          {/* Live range */}
          <View style={styles.rangeBlock}>
            <View style={styles.blockTitleRow}>
              <Text style={styles.toggleTitle}>Live Range</Text>
              <Text style={[styles.blockValue, { color: accent.accent }]}>
                {rangeValueLabel}
              </Text>
            </View>
            <Text style={styles.toggleHint}>
              Choose how far RoadPing looks for nearby drivers.
            </Text>
            <View style={styles.rangePresets} accessibilityRole="radiogroup">
              {rangePresets.map((preset, i) => {
                const selected = i === selectedRangeIndex;
                return (
                  <Pressable
                    key={preset.value}
                    style={[
                      styles.rangeChip,
                      selected && styles.rangeChipActive,
                      selected && {
                        backgroundColor: accent.accentMuted,
                        borderColor: accent.accent,
                      },
                      saving && styles.rangeChipDisabled,
                    ]}
                    onPress={() => {
                      if (!saving) void handleRangeChange(preset.value);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${preset.label} broadcast range`}
                  >
                    <Text
                      style={[
                        styles.rangeChipLabel,
                        selected && styles.rangeChipLabelActive,
                        selected && { color: accent.accent },
                      ]}
                    >
                      {preset.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Distance units */}
          <View style={styles.rangeBlock}>
            <View style={styles.blockTitleRow}>
              <Text style={styles.toggleTitle}>Distance Units</Text>
              <Text style={[styles.blockValue, { color: accent.accent }]}>
                {unitsValueLabel}
              </Text>
            </View>
            <Text style={styles.toggleHint}>
              Switch between miles and kilometers.
            </Text>
            <View style={styles.segment} accessibilityRole="radiogroup">
              {(['imperial', 'metric'] as const).map((opt) => {
                const active = system === opt;
                return (
                  <Pressable
                    key={opt}
                    onPress={() => setSystem(opt)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={
                      opt === 'imperial' ? 'Imperial (mi / ft)' : 'Metric (km / m)'
                    }
                    style={[
                      styles.segmentItem,
                      active && { backgroundColor: accent.accentMuted, borderColor: accent.accent },
                    ]}
                  >
                    <Text
                      style={[
                        styles.segmentLabel,
                        active && { color: accent.accent, fontWeight: FontWeight.semibold },
                      ]}
                    >
                      {opt === 'imperial' ? 'Imperial · mi/ft' : 'Metric · km/m'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Live map behavior */}
          <View style={styles.rangeBlock}>
            <Text style={styles.toggleTitle}>Live Map Behavior</Text>
            <Text style={styles.toggleHint}>
              Choose what happens when you leave the app.
            </Text>
            <View style={styles.behaviorList} accessibilityRole="radiogroup">
              {(
                [
                  {
                    key: 'pause' as const,
                    title: 'Pause when app closes',
                    hint: 'Recommended. You stop broadcasting the moment you leave the app or it goes to the background.',
                    badge: null,
                  },
                  {
                    key: 'alwaysOn' as const,
                    title: 'Always On',
                    hint: 'Stay live in the background.',
                    badge: 'Soon',
                  },
                ]
              ).map((opt) => {
                const active = liveMapBehavior === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => setLiveMapBehavior(opt.key)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={opt.title}
                    style={[
                      styles.behaviorRow,
                      active && {
                        backgroundColor: accent.accentMuted,
                        borderColor: accent.accent,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.behaviorRadio,
                        active && { borderColor: accent.accent },
                      ]}
                    >
                      {active && (
                        <View
                          style={[
                            styles.behaviorRadioDot,
                            { backgroundColor: accent.accent },
                          ]}
                        />
                      )}
                    </View>
                    <View style={styles.behaviorText}>
                      <View style={styles.behaviorTitleRow}>
                        <Text style={styles.behaviorTitle}>{opt.title}</Text>
                        {opt.badge !== null && (
                          <View style={styles.behaviorBadge}>
                            <Text style={styles.behaviorBadgeText}>
                              {opt.badge}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.behaviorHint}>{opt.hint}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {liveMapBehavior === 'alwaysOn' && (
              <Text style={styles.behaviorNote}>
                RoadPing currently pauses when you leave the app. Always On
                requires background location support and will be added in a
                future build — your live session still stops in the background
                for now.
              </Text>
            )}
          </View>

          {/* Do Not Disturb */}
          <View style={styles.toggleRow}>
            <View style={styles.toggleTextWrap}>
              <Text style={styles.toggleTitle}>Do Not Disturb</Text>
              <Text style={styles.toggleHint}>
                Hides your speaking status from nearby drivers.
              </Text>
            </View>
            <Switch
              value={dndMode}
              onValueChange={(v) => {
                void handleToggleDnd(v);
              }}
              disabled={saving}
              trackColor={{ false: Colors.border, true: accent.accentMuted }}
              thumbColor={dndMode ? accent.accent : Colors.textTertiary}
              accessibilityLabel="Do Not Disturb mode"
              accessibilityRole="switch"
            />
          </View>
        </View>

        {/* ── Vehicle ──────────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <SectionLabel label="Vehicle" />
          <LinkRow
            title="Manage Vehicle"
            hint="Update the vehicle shown on your live map."
            value={activeVehicleLabel}
            onPress={() => router.push('/vehicle')}
          />
        </View>

        {/* ── Appearance ───────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <SectionLabel label="Appearance" />
          <Text style={styles.toggleHint}>
            Match RoadPing to your cockpit style. Applies instantly.
          </Text>
          <ThemePicker />
        </View>

        {/* ── Subscription ─────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <SectionLabel label="Subscription" />
          <LinkRow
            title="⭐  RoadPing Plus"
            hint="Manage premium features and future subscription options."
            value={
              isPlus ? 'Active' : purchasesAvailable ? undefined : 'Free'
            }
            onPress={() => router.push('/plus')}
          />
          <LinkRow
            title="🚗  Rooms"
            hint="Private drive rooms with group hold-to-talk."
            onPress={() => router.push('/rooms')}
          />
        </View>

        {/* ── Privacy & Safety ─────────────────────────────────────────────── */}
        <View style={styles.section}>
          <SectionLabel label="Privacy & Safety" />
          <LinkRow
            title="🔒  Private Zones"
            hint="Hide your live presence near saved places."
            onPress={() => router.push('/private-zones')}
          />
          <LinkRow
            title="🚫  Blocked Drivers"
            hint="Manage drivers you've blocked."
            onPress={() => router.push('/blocked-users')}
          />
          <LinkRow
            title="📄  Privacy Policy"
            hint="What we collect, why, and what we don't do."
            onPress={() => router.push('/privacy')}
          />
          <LinkRow
            title="🛡  Safety & Community"
            hint="Drive responsibly. Block, report, contact us."
            onPress={() => router.push('/safety')}
          />
          <LinkRow
            title="✉  Contact Support"
            hint={SUPPORT_EMAIL}
            onPress={handleSupport}
          />
          <LinkRow
            title="Delete Account"
            hint="Permanently remove your RoadPing account."
            variant="danger"
            onPress={handleDeleteAccount}
          />
        </View>

        {/* ── About ────────────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <SectionLabel label="About" />
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>Version</Text>
            <Text style={styles.aboutValue}>{APP_VERSION}</Text>
          </View>
        </View>
      </ScrollView>
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

  scroll: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xxl,
    gap: Spacing.xl,
  },

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

  // DND toggle
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

  // Distance-units segmented control
  segment: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: Spacing.md12,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    alignItems: 'center',
  },
  segmentLabel: {
    fontSize: FontSize.bodySmall,
    color: Colors.textSecondary,
  },

  // Range presets
  rangeBlock: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  rangePresets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  rangeChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md12,
    borderRadius: Radius.full,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    minWidth: 68,
    alignItems: 'center',
  },
  rangeChipActive: {
    backgroundColor: Colors.primaryMuted,
    borderColor: Colors.primary,
  },
  rangeChipDisabled: {
    opacity: 0.5,
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

  // Live map behavior
  behaviorList: {
    gap: Spacing.sm,
  },
  behaviorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    backgroundColor: Colors.background,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  behaviorRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  behaviorRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
  },
  behaviorText: {
    flex: 1,
    gap: 2,
  },
  behaviorTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  behaviorTitle: {
    fontSize: FontSize.body,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  behaviorBadge: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 1,
  },
  behaviorBadgeText: {
    fontSize: FontSize.micro,
    fontWeight: FontWeight.bold,
    color: Colors.textTertiary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  behaviorHint: {
    fontSize: FontSize.caption,
    color: Colors.textSecondary,
    lineHeight: FontSize.caption * 1.5,
  },
  behaviorNote: {
    fontSize: FontSize.caption,
    color: Colors.textTertiary,
    lineHeight: FontSize.caption * 1.5,
    fontStyle: 'italic',
  },

  // Link rows
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
  linkRowTitleDanger: {
    color: Colors.error,
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
  linkRowValue: {
    fontSize: FontSize.bodySmall,
    color: Colors.textTertiary,
    maxWidth: 130,
    textAlign: 'right',
  },

  // Inline block title row (title + current value)
  blockTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  blockValue: {
    fontSize: FontSize.bodySmall,
    fontWeight: FontWeight.semibold,
  },

  // Account actions
  actionGap: {
    gap: Spacing.sm,
    alignItems: 'center',
  },
  deleteLink: {
    fontSize: FontSize.bodySmall,
    color: Colors.error,
    textDecorationLine: 'underline',
  },

  // About row
  aboutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  aboutLabel: {
    fontSize: FontSize.body,
    color: Colors.textSecondary,
  },
  aboutValue: {
    fontSize: FontSize.body,
    color: Colors.textTertiary,
    fontWeight: FontWeight.medium,
  },
});

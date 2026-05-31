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

import { AppButton } from '@/components/AppButton';
import { LoadingState } from '@/components/LoadingState';
import { Colors } from '@/theme/colors';
import { FontSize, FontWeight } from '@/theme/typography';
import { Radius, Spacing } from '@/theme/spacing';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { updateProfile } from '@/services/profile';
import { stopLiveSession } from '@/services/liveSession';

// ─── Constants ────────────────────────────────────────────────────────────────

const RANGE_PRESETS = [
  { label: '500 m', value: 500 },
  { label: '1 km', value: 1000 },
  { label: '2 km', value: 2000 },
  { label: '3 km', value: 3000 },
  { label: '5 km', value: 5000 },
] as const;

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
  onPress: () => void;
  variant?: 'default' | 'danger';
}

function LinkRow({ title, hint, onPress, variant = 'default' }: LinkRowProps) {
  return (
    <Pressable
      style={styles.linkRow}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
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
      <Text style={styles.linkRowChevron}>›</Text>
    </Pressable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { profile, isLoading: profileLoading, refresh: refreshProfile } =
    useProfile(user?.id ?? null);

  const [dndMode, setDndMode] = useState(false);
  const [rangeM, setRangeM] = useState(2000);
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
      setRangeM(profile?.default_range_m ?? 2000); // revert
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
        {/* ── Preferences ──────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <SectionLabel label="Preferences" />

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
              trackColor={{ false: Colors.border, true: Colors.primaryMuted }}
              thumbColor={dndMode ? Colors.primary : Colors.textTertiary}
              accessibilityLabel="Do Not Disturb mode"
              accessibilityRole="switch"
            />
          </View>

          {/* Default broadcast range */}
          <View style={styles.rangeBlock}>
            <Text style={styles.toggleTitle}>Default Broadcast Range</Text>
            <Text style={styles.toggleHint}>
              Drivers within this radius can see you when you go live.
            </Text>
            <View style={styles.rangePresets} accessibilityRole="radiogroup">
              {RANGE_PRESETS.map((preset) => (
                <Pressable
                  key={preset.value}
                  style={[
                    styles.rangeChip,
                    rangeM === preset.value && styles.rangeChipActive,
                    saving && styles.rangeChipDisabled,
                  ]}
                  onPress={() => {
                    if (!saving) void handleRangeChange(preset.value);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: rangeM === preset.value }}
                  accessibilityLabel={`${preset.label} broadcast range`}
                >
                  <Text
                    style={[
                      styles.rangeChipLabel,
                      rangeM === preset.value && styles.rangeChipLabelActive,
                    ]}
                  >
                    {preset.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        {/* ── Community ────────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <SectionLabel label="Community" />
          <LinkRow
            title="🚗  Rooms"
            hint="Private drive rooms with group hold-to-talk."
            onPress={() => router.push('/rooms')}
          />
        </View>

        {/* ── Privacy ──────────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <SectionLabel label="Privacy" />
          <LinkRow
            title="🔒  Private Zones"
            hint="Hide yourself near home, work, or anywhere private."
            onPress={() => router.push('/private-zones')}
          />
          <LinkRow
            title="🚫  Blocked Drivers"
            hint="Manage drivers you've blocked."
            onPress={() => router.push('/blocked-users')}
          />
        </View>

        {/* ── Legal & Support ─────────────────────────────────────────────── */}
        <View style={styles.section}>
          <SectionLabel label="Legal & Support" />
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
        </View>

        {/* ── Account ──────────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <SectionLabel label="Account" />
          <View style={styles.actionGap}>
            <AppButton
              label={signingOut ? 'Signing out…' : 'Sign Out'}
              variant="danger"
              size="md"
              fullWidth
              loading={signingOut}
              onPress={handleSignOut}
            />
            <Pressable
              onPress={handleDeleteAccount}
              accessibilityRole="button"
              accessibilityLabel="Delete account"
            >
              <Text style={styles.deleteLink}>Delete account</Text>
            </Pressable>
          </View>
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

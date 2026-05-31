/**
 * app/onboarding.tsx — Welcome / feature overview screen.
 *
 * Shown to users who are not authenticated.
 * Navigates to /auth with a mode query param for the auth screen.
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/AppButton';
import { Colors } from '@/theme/colors';
import { FontSize, FontWeight, TextStyles } from '@/theme/typography';
import { Radius, Spacing } from '@/theme/spacing';

// ─── Feature bullets ──────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: '📡',
    title: 'Nearby drivers radar',
    body: 'See who\'s around you — approximate distance only, never exact locations.',
  },
  {
    icon: '🎙️',
    title: 'Hold-to-talk alerts',
    body: 'Broadcast a live voice alert to everyone nearby. Like a CB radio for modern drivers.',
  },
  {
    icon: '🚗',
    title: 'Drive Rooms',
    body: 'Create or join a channel with your crew for group voice chat on the road.',
  },
  {
    icon: '🔒',
    title: 'Private Zones',
    body: 'Mark locations as private. RoadPing goes silent when you arrive — automatically.',
  },
] as const;

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <View style={styles.hero}>
          <View style={styles.logoWrap}>
            <Text style={styles.logoIcon}>🚗</Text>
          </View>
          <Text style={styles.appName}>RoadPing</Text>
          <Text style={styles.tagline}>
            One-tap voice alerts{'\n'}for nearby drivers.
          </Text>
        </View>

        {/* ── Feature cards ─────────────────────────────────────────────────── */}
        <View style={styles.features}>
          {FEATURES.map((feature) => (
            <View key={feature.title} style={styles.featureRow}>
              <Text style={styles.featureIcon}>{feature.icon}</Text>
              <View style={styles.featureText}>
                <Text style={styles.featureTitle}>{feature.title}</Text>
                <Text style={styles.featureBody}>{feature.body}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* ── CTAs ─────────────────────────────────────────────────────────── */}
        <View style={styles.ctas}>
          <AppButton
            label="Get Started"
            variant="primary"
            size="lg"
            fullWidth
            onPress={() => {
              router.push('/auth?mode=signup');
            }}
          />
          <AppButton
            label="Sign In"
            variant="ghost"
            size="md"
            fullWidth
            onPress={() => {
              router.push('/auth?mode=signin');
            }}
          />
        </View>

        {/* ── Privacy & safety note ────────────────────────────────────────── */}
        <Text style={styles.privacyNote}>
          No location history stored. No recordings saved.
        </Text>
        <Text style={styles.privacyNote}>
          Use RoadPing only when it is safe and legal to do so.
        </Text>
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
  scroll: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.xl,
    gap: Spacing.xl,
    flexGrow: 1,
  },

  // ── Hero ─────────────────────────────────────────────────────────────────
  hero: {
    alignItems: 'center',
    gap: Spacing.md,
  },
  logoWrap: {
    width: 96,
    height: 96,
    borderRadius: Radius.xl,
    backgroundColor: Colors.primaryMuted,
    borderWidth: 1,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoIcon: {
    fontSize: 48,
  },
  appName: {
    ...TextStyles.display,
    color: Colors.textPrimary,
    letterSpacing: -1,
  },
  tagline: {
    ...TextStyles.bodyLarge,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: FontSize.bodyLarge * 1.5,
  },

  // ── Features ─────────────────────────────────────────────────────────────
  features: {
    gap: Spacing.sm,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  featureIcon: {
    fontSize: 24,
    width: 32,
    textAlign: 'center',
    marginTop: 2,
  },
  featureText: {
    flex: 1,
    gap: Spacing.xs,
  },
  featureTitle: {
    fontSize: FontSize.body,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  featureBody: {
    fontSize: FontSize.bodySmall,
    color: Colors.textSecondary,
    lineHeight: FontSize.bodySmall * 1.5,
  },

  // ── CTAs ─────────────────────────────────────────────────────────────────
  ctas: {
    gap: Spacing.sm,
  },

  // ── Privacy ───────────────────────────────────────────────────────────────
  privacyNote: {
    fontSize: FontSize.caption,
    color: Colors.textTertiary,
    textAlign: 'center',
  },
});

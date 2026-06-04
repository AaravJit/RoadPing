/**
 * app/theme-setup.tsx — "Pick your cockpit" step.
 *
 * Shown once, right after a new user adds their first vehicle (vehicle.tsx
 * routes here instead of straight to Drive). Picking a theme applies it live —
 * including the Continue button below, which previews the choice instantly.
 *
 * Tapping Continue hands back to the route gate (app/index.tsx), which forwards
 * the now fully-set-up user to Drive. This step never blocks: Amber Glow is the
 * default, so a user can continue without changing anything.
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/AppButton';
import { ThemePicker } from '@/components/ThemePicker';
import { Colors } from '@/theme/colors';
import { FontSize, FontWeight, TextStyles } from '@/theme/typography';
import { Radius, Spacing } from '@/theme/spacing';

export default function ThemeSetupScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.stepBadge}>
            <Text style={styles.stepBadgeText}>ONE MORE THING</Text>
          </View>
          <Text style={styles.title}>Pick your cockpit</Text>
          <Text style={styles.subtitle}>
            Choose a theme for RoadPing. You can change it anytime in Settings.
          </Text>
        </View>

        <ThemePicker />
      </ScrollView>

      <View style={styles.footer}>
        <AppButton
          label="Continue to RoadPing"
          variant="primary"
          size="lg"
          fullWidth
          onPress={() => {
            router.replace('/');
          }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.lg,
    gap: Spacing.xl,
  },
  header: {
    gap: Spacing.sm,
  },
  stepBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.primaryMuted,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md12,
    paddingVertical: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  stepBadgeText: {
    fontSize: FontSize.micro,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
    letterSpacing: 1,
  },
  title: {
    ...TextStyles.headingLarge,
    color: Colors.textPrimary,
  },
  subtitle: {
    ...TextStyles.body,
    color: Colors.textSecondary,
  },
  footer: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
});

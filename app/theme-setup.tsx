/**
 * app/theme-setup.tsx — "Make it yours" step.
 *
 * Shown once, right after a new user adds their first vehicle (vehicle.tsx
 * routes here instead of straight to Drive). Appearance and accent apply
 * live, including to the Continue button. Nothing needs changing: System
 * appearance and RoadPing Orange are the defaults.
 */
import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';

import { AccentPicker, AppearancePicker } from '@/components/AppearanceSettings';
import { AppText, Button, ListSection, Screen, ScreenScroll } from '@/components/ui';
import { makeStyles } from '@/theme/ThemeProvider';
import { SCREEN_INSET, Spacing } from '@/theme/spacing';

export default function ThemeSetupScreen() {
  const router = useRouter();
  const styles = useStyles();

  return (
    <Screen>
      <ScreenScroll>
        <View style={styles.header}>
          <AppText variant="largeTitle" weight="bold" accessibilityRole="header">
            Make it yours
          </AppText>
          <AppText variant="body" color="secondary">
            Choose how RoadPing looks. You can change this anytime in Settings.
          </AppText>
        </View>

        <ListSection header="Appearance" footer="System follows your iPhone, including automatic light and dark.">
          <View style={styles.block}>
            <AppearancePicker />
          </View>
        </ListSection>

        <ListSection header="Accent">
          <View style={styles.block}>
            <AccentPicker />
          </View>
        </ListSection>
      </ScreenScroll>

      <View style={styles.footer}>
        <Button label="Continue" size="lg" fullWidth onPress={() => router.replace('/')} />
      </View>
    </Screen>
  );
}

const useStyles = makeStyles(() => ({
  header: {
    paddingHorizontal: SCREEN_INSET,
    gap: Spacing.sm,
  },
  block: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md12,
  },
  footer: {
    paddingHorizontal: SCREEN_INSET,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
}));

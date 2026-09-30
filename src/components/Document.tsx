/**
 * Reading-surface primitives for policy and guidance screens (Privacy,
 * Safety). Plain background, comfortable measure, real headings for
 * VoiceOver's rotor. No cards, no glass.
 */
import React from 'react';
import { Linking, Pressable, View } from 'react-native';

import { AppText } from '@/components/ui';
import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH_TARGET, SCREEN_INSET, Spacing } from '@/theme/spacing';

export function DocSection({ title, children }: { title: string; children: React.ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.section}>
      <AppText variant="title3" weight="semibold" accessibilityRole="header">
        {title}
      </AppText>
      {children}
    </View>
  );
}

export function P({ children }: { children: React.ReactNode }) {
  return (
    <AppText variant="body" color="secondary">
      {children}
    </AppText>
  );
}

export function Bullet({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.bullet}>
      <AppText variant="body" color="tertiary" accessibilityElementsHidden>
        •
      </AppText>
      <AppText variant="body" color="secondary" style={styles.flex}>
        {children}
      </AppText>
    </View>
  );
}

export function MailLink({ address }: { address: string }) {
  const { accent } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      onPress={() => void Linking.openURL(`mailto:${address}`)}
      style={styles.link}
      accessibilityRole="link"
      accessibilityLabel={`Email ${address}`}
    >
      <AppText variant="body" weight="semibold" style={{ color: accent.text }}>
        {address}
      </AppText>
    </Pressable>
  );
}

/** Horizontal padding wrapper for free text inside a ScreenScroll. */
export function DocBody({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  return <View style={styles.body}>{children}</View>;
}

const useStyles = makeStyles(() => ({
  body: {
    paddingHorizontal: SCREEN_INSET,
    gap: Spacing.xl,
    maxWidth: 680,
  },
  section: {
    gap: Spacing.sm,
  },
  bullet: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingLeft: Spacing.xs,
  },
  flex: {
    flex: 1,
  },
  link: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
}));

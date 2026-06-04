/**
 * app/welcome.tsx — first-time education (Phase 17).
 *
 * Three short, holographic-style cards shown once to a signed-in user before
 * profile setup. Flow is Next/arrow with dot indicators; "Skip" is a small,
 * clearly-secondary text action (never equal weight to Next). Finishing or
 * skipping marks the AsyncStorage flag and hands back to the route gate, which
 * continues to profile → vehicle → theme → Drive.
 *
 * App Store-safe copy only — no cops/checkpoints/racing/speeding/surveillance.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/AppButton';
import { useTheme } from '@/theme/ThemeProvider';
import { Colors } from '@/theme/colors';
import { FontSize, FontWeight, TextStyles } from '@/theme/typography';
import { MIN_TOUCH_TARGET, Radius, Spacing } from '@/theme/spacing';
import { useOnboardingSeen } from '@/hooks/useOnboardingSeen';

interface Card {
  glyph: string;
  title: string;
  copy: string;
}

const CARDS: readonly Card[] = [
  {
    glyph: '🟢',
    title: 'You control live mode',
    copy: 'RoadPing only shows you when you start it. Nothing is shared until you go live.',
  },
  {
    glyph: '🧭',
    title: 'See nearby drivers',
    copy: 'Your map stays centered around your drive, with nearby drivers around you.',
  },
  {
    glyph: '🛑',
    title: 'Hide anytime',
    copy: 'Stop & Hide is always one tap away. You disappear from the map instantly.',
  },
];

export default function WelcomeScreen() {
  const router = useRouter();
  const { accent } = useTheme();
  const { markSeen } = useOnboardingSeen();

  const [index, setIndex] = useState(0);
  const isLast = index === CARDS.length - 1;
  const card = CARDS[index]!; // index is always clamped to 0..CARDS.length-1

  function finish() {
    markSeen();
    router.replace('/');
  }

  function next() {
    if (isLast) finish();
    else setIndex((i) => i + 1);
  }

  function back() {
    setIndex((i) => Math.max(0, i - 1));
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* Top row: Back (when past first) + Skip (small, secondary) */}
      <View style={styles.topRow}>
        {index > 0 ? (
          <Pressable
            onPress={back}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Previous"
          >
            <Text style={[styles.topAction, { color: accent.accent }]}>‹ Back</Text>
          </Pressable>
        ) : (
          <View style={styles.topSpacer} />
        )}
        <Pressable
          onPress={finish}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Skip introduction"
        >
          <Text style={styles.skip}>Skip</Text>
        </Pressable>
      </View>

      {/* Holographic card */}
      <View style={styles.body}>
        <View
          style={[
            styles.card,
            {
              borderColor: accent.accent,
              shadowColor: accent.accent,
              backgroundColor: accent.accentMuted,
            },
          ]}
        >
          <View
            style={[
              styles.glyphRing,
              { borderColor: accent.accent, backgroundColor: Colors.background },
            ]}
          >
            <Text style={styles.glyph}>{card.glyph}</Text>
          </View>
          <Text style={styles.cardTitle}>{card.title}</Text>
          <Text style={styles.cardCopy}>{card.copy}</Text>
        </View>

        {/* Dot indicators */}
        <View style={styles.dots}>
          {CARDS.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === index && [styles.dotActive, { backgroundColor: accent.accent }],
              ]}
            />
          ))}
        </View>
      </View>

      {/* Primary action */}
      <View style={styles.footer}>
        <AppButton
          label={isLast ? 'Get started' : 'Next'}
          variant="primary"
          size="lg"
          fullWidth
          onPress={next}
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
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
  },
  topSpacer: {
    width: 60,
  },
  topAction: {
    fontSize: FontSize.body,
    fontWeight: FontWeight.medium,
  },
  skip: {
    fontSize: FontSize.bodySmall,
    color: Colors.textTertiary,
    fontWeight: FontWeight.medium,
  },

  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.xl,
  },
  card: {
    width: '100%',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.xxl,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.xl,
    borderWidth: 1,
    // Holographic glow — accent-tinted surface + colored shadow halo.
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 8,
  },
  glyphRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  glyph: {
    fontSize: 44,
  },
  cardTitle: {
    ...TextStyles.headingLarge,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  cardCopy: {
    ...TextStyles.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: FontSize.body * 1.55,
  },

  dots: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.border,
  },
  dotActive: {
    width: 22,
  },

  footer: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
  },
});

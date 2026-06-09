/**
 * app/legal.tsx — Terms of Use / EULA gate.
 *
 * App Store Guideline 1.2 (User Generated Content): the user must agree to the
 * Terms/EULA *before* registering or logging in. The route gate (app/index.tsx)
 * redirects here whenever the current TERMS_VERSION has not been accepted on
 * this device — which, for a signed-out user, is the very first screen they see.
 *
 * The zero-tolerance language is shown verbatim (services/legal.ts → TERMS_SUMMARY).
 * "I Agree" records acceptance (locally + best-effort to Supabase) and returns to
 * the route gate, which then routes the user on to onboarding / auth.
 */
import React, { useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/AppButton';
import { RoadPingLogo } from '@/components/RoadPingLogo';
import { useAuth } from '@/hooks/useAuth';
import { useTermsAcceptance } from '@/hooks/useTermsAcceptance';
import { TERMS_OF_USE_URL, TERMS_SUMMARY } from '@/services/legal';
import { Colors } from '@/theme/colors';
import { FontSize, FontWeight, TextStyles } from '@/theme/typography';
import { MIN_TOUCH_TARGET, Radius, Spacing } from '@/theme/spacing';

const PROHIBITED = [
  'Harassment, threats, stalking, or abuse',
  'Hateful, discriminatory, or sexual content',
  'Impersonation, spam, or scams',
  'Coordinating illegal activity',
  'Distracting drivers or endangering others',
];

export default function LegalScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { accept } = useTermsAcceptance();
  const [submitting, setSubmitting] = useState(false);

  async function handleAgree() {
    if (submitting) return;
    setSubmitting(true);
    try {
      await accept(user?.id ?? null);
      // Return to the route gate, which now sees terms as accepted and
      // continues to onboarding / auth / drive as appropriate.
      router.replace('/');
    } catch {
      // accept() is fail-safe and shouldn't throw, but never get stuck.
      setSubmitting(false);
    }
  }

  function openTerms() {
    void Linking.openURL(TERMS_OF_USE_URL).catch(() => {
      /* no-op: never crash if the link can't open */
    });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brand}>
          <RoadPingLogo size={72} />
          <Text style={styles.appName}>
            Road<Text style={styles.appNamePing}>Ping</Text>
          </Text>
        </View>

        <Text style={styles.title}>Community rules</Text>
        <Text style={styles.body}>{TERMS_SUMMARY}</Text>

        <View style={styles.rulesCard}>
          <Text style={styles.rulesHeading}>Zero tolerance — never:</Text>
          {PROHIBITED.map((line) => (
            <View key={line} style={styles.ruleRow}>
              <Text style={styles.ruleDot}>•</Text>
              <Text style={styles.ruleText}>{line}</Text>
            </View>
          ))}
          <Text style={styles.rulesFooter}>
            Violations may lead to reports, blocks, suspension, or permanent
            removal. You can report or block any user from their card at any time.
            RoadPing shares the approximate location of nearby active users and
            is intended for adults (18+).
          </Text>
        </View>

        <View style={styles.linksRow}>
          <Pressable
            onPress={openTerms}
            hitSlop={8}
            accessibilityRole="link"
            accessibilityLabel="Terms of Use"
          >
            <Text style={styles.link}>Terms of Use</Text>
          </Pressable>
          <Text style={styles.linkSep}>·</Text>
          <Pressable
            onPress={() => router.push('/privacy')}
            hitSlop={8}
            accessibilityRole="link"
            accessibilityLabel="Privacy Policy"
          >
            <Text style={styles.link}>Privacy Policy</Text>
          </Pressable>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <AppButton
          label="I Agree"
          variant="primary"
          size="lg"
          fullWidth
          loading={submitting}
          onPress={() => {
            void handleAgree();
          }}
        />
        <Text style={styles.footnote}>
          By tapping “I Agree” you accept RoadPing’s Terms of Use and Privacy
          Policy.
        </Text>
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
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.lg,
    gap: Spacing.md,
  },
  brand: {
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  appName: {
    ...TextStyles.heading,
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  appNamePing: {
    color: Colors.primary,
  },
  title: {
    fontSize: FontSize.heading,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  body: {
    fontSize: FontSize.body,
    color: Colors.textSecondary,
    lineHeight: FontSize.body * 1.55,
  },
  rulesCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  rulesHeading: {
    fontSize: FontSize.bodySmall,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  ruleRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  ruleDot: {
    fontSize: FontSize.bodySmall,
    color: Colors.primary,
    lineHeight: FontSize.bodySmall * 1.5,
  },
  ruleText: {
    flex: 1,
    fontSize: FontSize.bodySmall,
    color: Colors.textSecondary,
    lineHeight: FontSize.bodySmall * 1.5,
  },
  rulesFooter: {
    marginTop: Spacing.sm,
    fontSize: FontSize.caption,
    color: Colors.textTertiary,
    lineHeight: FontSize.caption * 1.5,
  },
  linksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  link: {
    fontSize: FontSize.bodySmall,
    color: Colors.textBrand,
    fontWeight: FontWeight.semibold,
  },
  linkSep: {
    color: Colors.textTertiary,
  },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  footnote: {
    fontSize: FontSize.caption,
    color: Colors.textTertiary,
    textAlign: 'center',
    lineHeight: FontSize.caption * 1.45,
    minHeight: MIN_TOUCH_TARGET / 2,
  },
});

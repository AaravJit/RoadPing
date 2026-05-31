/**
 * app/safety.tsx — In-app Safety & Community Guidelines.
 *
 * Linked from Settings. Sets clear expectations about responsible use,
 * which both keeps users safe and directly addresses Apple guideline 1.4.1
 * (physical harm) and 1.2 (user-generated content).
 */
import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/theme/colors';
import { FontSize, FontWeight } from '@/theme/typography';
import { Radius, Spacing } from '@/theme/spacing';

const SUPPORT_EMAIL = 'support@roadping.app';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <Text style={styles.paragraph}>{children}</Text>;
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.bullet}>
      <Text style={styles.bulletDot}>•</Text>
      <Text style={styles.bulletText}>{children}</Text>
    </View>
  );
}

export default function SafetyScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.backBtn}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Safety & Community</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>Drive first. Talk second.</Text>
          <Text style={styles.heroBody}>
            Use RoadPing only when it is safe and legal to do so. If looking
            at your phone would distract you, do not look at your phone.
          </Text>
        </View>

        <Section title="When to use RoadPing">
          <Bullet>Hold to talk only when it is safe to do so.</Bullet>
          <Bullet>Mount your phone — do not hold it while driving.</Bullet>
          <Bullet>Pull over if you need to focus on the app.</Bullet>
          <Bullet>Obey all traffic laws and local rules of the road.</Bullet>
        </Section>

        <Section title="What RoadPing is not">
          <P>
            RoadPing is for friendly, responsible road awareness between
            drivers. It is not:
          </P>
          <Bullet>Emergency services. If there is an emergency, call your local emergency number.</Bullet>
          <Bullet>A way to report crimes — contact local authorities.</Bullet>
          <Bullet>A turn-by-turn navigation or safety-critical driving system.</Bullet>
          <Bullet>A racing, evasion, or distracted-driving tool.</Bullet>
        </Section>

        <Section title="Community rules">
          <P>
            Voice and any user-generated content in RoadPing must follow these
            rules. Breaking them can lead to your account being suspended or
            permanently removed.
          </P>
          <Bullet>No harassment, threats, or hate speech.</Bullet>
          <Bullet>No sexual or sexually suggestive content.</Bullet>
          <Bullet>No content encouraging reckless or illegal driving.</Bullet>
          <Bullet>No impersonation or doxxing.</Bullet>
          <Bullet>No spam or commercial solicitation.</Bullet>
        </Section>

        <Section title="Block and report">
          <P>
            If a driver makes you uncomfortable, you can block or report them
            from their card on the map or in any room. Blocks are mutual: you
            will both become invisible to each other. Reports are silent — the
            reported user is never told.
          </P>
          <P>
            We review reports and act on community-safety violations. Serious
            or repeat violations can result in account removal.
          </P>
        </Section>

        <Section title="Your privacy is on by default">
          <Bullet>You are invisible until you tap Start RoadPing.</Bullet>
          <Bullet>Other drivers never see your exact coordinates.</Bullet>
          <Bullet>Hide makes you disappear from the map immediately.</Bullet>
          <Bullet>Voice is live only — nothing is recorded.</Bullet>
          <Bullet>No location history is stored.</Bullet>
        </Section>

        <Section title="Contact">
          <P>Questions, abuse reports, or safety concerns:</P>
          <Pressable
            onPress={() => {
              void Linking.openURL(`mailto:${SUPPORT_EMAIL}`);
            }}
          >
            <Text style={styles.link}>{SUPPORT_EMAIL}</Text>
          </Pressable>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
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
  headerSpacer: { minWidth: 60 },

  scroll: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxl,
    gap: Spacing.lg,
  },

  heroCard: {
    backgroundColor: Colors.primaryMuted,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.primary,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  heroTitle: {
    fontSize: FontSize.subheading,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
  },
  heroBody: {
    fontSize: FontSize.bodySmall,
    color: Colors.textPrimary,
    lineHeight: FontSize.bodySmall * 1.6,
  },

  section: {
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSize.subheading,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  paragraph: {
    fontSize: FontSize.bodySmall,
    color: Colors.textSecondary,
    lineHeight: FontSize.bodySmall * 1.6,
  },
  bullet: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  bulletDot: {
    fontSize: FontSize.bodySmall,
    color: Colors.primary,
    width: 12,
  },
  bulletText: {
    flex: 1,
    fontSize: FontSize.bodySmall,
    color: Colors.textSecondary,
    lineHeight: FontSize.bodySmall * 1.6,
  },
  link: {
    fontSize: FontSize.body,
    color: Colors.primary,
    fontWeight: FontWeight.medium,
  },
});

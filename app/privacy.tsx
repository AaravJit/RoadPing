/**
 * app/privacy.tsx — In-app Privacy Policy.
 *
 * Apple requires a privacy policy linked from the app *and* App Store
 * Connect. This is the in-app copy; the canonical Markdown source is
 * docs/PRIVACY.md (kept in sync manually).
 */
import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/theme/colors';
import { FontSize, FontWeight } from '@/theme/typography';
import { Radius, Spacing } from '@/theme/spacing';

const LAST_UPDATED = '2026-05-28';
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

export default function PrivacyScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.backBtn}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Privacy Policy</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.updated}>Last updated: {LAST_UPDATED}</Text>

        <Section title="Summary">
          <P>
            RoadPing is a live, map-first voice tool for nearby drivers. We
            collect the minimum information needed to make that work and we do
            not sell your data.
          </P>
          <Bullet>Your location is used only while RoadPing is active.</Bullet>
          <Bullet>We do not store location history.</Bullet>
          <Bullet>Voice is live only — nothing is recorded or saved.</Bullet>
          <Bullet>You can delete your account from inside the app.</Bullet>
        </Section>

        <Section title="What we collect">
          <P>When you create an account we collect:</P>
          <Bullet>Email and password (handled by Supabase Auth).</Bullet>
          <Bullet>Profile: display name, handle, avatar URL, preferences.</Bullet>
          <Bullet>Vehicles you add (label, type, make, model, year, color).</Bullet>
          <Bullet>Private zones you create (center + radius).</Bullet>
          <P>While RoadPing is active we briefly process:</P>
          <Bullet>Your current location (latitude, longitude, accuracy, heading, speed).</Bullet>
          <Bullet>Live session and voice session metadata (start time, range).</Bullet>
        </Section>

        <Section title="Location">
          <P>
            RoadPing only requests "While Using the App" location access. We do
            not request background location. We do not store location history.
          </P>
          <P>
            Your current position is held only as your live presence record. It
            is deleted when:
          </P>
          <Bullet>You tap Stop or Hide.</Bullet>
          <Bullet>You sign out, close, or background the app.</Bullet>
          <Bullet>Your session expires from inactivity.</Bullet>
          <Bullet>You drive into a private zone.</Bullet>
          <P>
            Other drivers never see your exact coordinates — only an
            approximate distance and direction within your broadcast range.
          </P>
        </Section>

        <Section title="Microphone and voice">
          <P>
            The microphone is only used while you hold the talk button. Voice
            is delivered live to nearby drivers or room members. RoadPing does
            not record, store, or transcribe voice.
          </P>
        </Section>

        <Section title="Blocks and reports">
          <P>
            Blocks are stored so we can keep both users invisible to each
            other.
          </P>
          <P>
            Reports are stored to let us review abuse and keep the community
            safe. The reported user is never told they were reported. If you
            delete your account, reports you filed are kept for safety review
            but your identity as the reporter is removed (anonymized).
          </P>
        </Section>

        <Section title="What we do not do">
          <Bullet>We do not sell your personal data.</Bullet>
          <Bullet>We do not use your data for advertising.</Bullet>
          <Bullet>We do not track you across other apps or websites.</Bullet>
          <Bullet>We do not store location history.</Bullet>
          <Bullet>We do not record voice.</Bullet>
          <Bullet>We do not run third-party analytics SDKs.</Bullet>
        </Section>

        <Section title="Third parties">
          <P>
            RoadPing uses Supabase (authentication, database, edge functions)
            and Apple Push Notification Service if you opt into notifications.
            Map tiles are rendered by Apple Maps on iOS. These providers
            process data on our behalf so RoadPing can function.
          </P>
        </Section>

        <Section title="Your choices">
          <Bullet>You can revoke location or microphone access in iOS Settings at any time.</Bullet>
          <Bullet>You can turn on Do Not Disturb in Settings to hide your speaking indicator.</Bullet>
          <Bullet>You can stop being visible at any time with Stop or Hide.</Bullet>
          <Bullet>You can delete your account from Settings → Delete account.</Bullet>
        </Section>

        <Section title="Children">
          <P>
            RoadPing is not directed at children under 13 and we do not
            knowingly collect data from them.
          </P>
        </Section>

        <Section title="Contact">
          <P>For privacy questions or deletion help, contact:</P>
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
  updated: {
    fontSize: FontSize.caption,
    color: Colors.textTertiary,
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

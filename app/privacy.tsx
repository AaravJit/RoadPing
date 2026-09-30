/**
 * app/privacy.tsx — In-app Privacy Policy.
 *
 * Apple requires a privacy policy linked from the app *and* App Store
 * Connect. This is the in-app copy; the canonical Markdown source is
 * docs/PRIVACY.md (kept in sync manually).
 */
import React from 'react';

import { Bullet, DocBody, DocSection, MailLink, P } from '@/components/Document';
import { AppText, ScreenScroll } from '@/components/ui';

const LAST_UPDATED = '2026-09-30';
const SUPPORT_EMAIL = 'support@roadping.app';

export default function PrivacyScreen() {
  return (
    <ScreenScroll>
      <DocBody>
        <AppText variant="footnote" color="secondary">
          Last updated {LAST_UPDATED}
        </AppText>

        <DocSection title="Summary">
          <P>
            RoadPing is a live, map-first voice tool for nearby drivers. We
            collect the minimum information needed to make that work and we do
            not sell your data.
          </P>
          <Bullet>Your location is used only while RoadPing is active.</Bullet>
          <Bullet>We do not store location history.</Bullet>
          <Bullet>Voice is live only — nothing is recorded or saved.</Bullet>
          <Bullet>You can delete your account from inside the app.</Bullet>
        </DocSection>

        <DocSection title="What we collect">
          <P>When you create an account we collect:</P>
          <Bullet>Email and password (handled by Supabase Auth).</Bullet>
          <Bullet>Profile: display name, handle, avatar URL, preferences.</Bullet>
          <Bullet>Vehicles you add (label, type, make, model, year, color).</Bullet>
          <Bullet>Private zones you create (center + radius).</Bullet>
          <P>While RoadPing is active we briefly process:</P>
          <Bullet>Your current location (latitude, longitude, accuracy, heading, speed).</Bullet>
          <Bullet>Live session and voice session metadata (start time, range).</Bullet>
        </DocSection>

        <DocSection title="Location">
          <P>
            RoadPing only requests "While Using the App" location access. We do
            not request background location. We do not store location history.
          </P>
          <P>
            Your current position is held only as your live presence record. It
            is deleted when:
          </P>
          <Bullet>You end your live session.</Bullet>
          <Bullet>You sign out, close, or background the app.</Bullet>
          <Bullet>Your session expires from inactivity.</Bullet>
          <Bullet>You drive into a private zone.</Bullet>
          <P>
            Other drivers never see your exact coordinates — only a rounded,
            approximate distance within your broadcast range. The map places
            drivers at approximate positions and does not show which direction
            they are.
          </P>
        </DocSection>

        <DocSection title="Microphone and voice">
          <P>
            The microphone is only used while you hold the talk button. Voice
            is delivered live to nearby drivers or room members. RoadPing does
            not record, store, or transcribe voice.
          </P>
        </DocSection>

        <DocSection title="Blocks and reports">
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
        </DocSection>

        <DocSection title="What we do not do">
          <Bullet>We do not sell your personal data.</Bullet>
          <Bullet>We do not use your data for advertising.</Bullet>
          <Bullet>We do not track you across other apps or websites.</Bullet>
          <Bullet>We do not store location history.</Bullet>
          <Bullet>We do not record voice.</Bullet>
          <Bullet>We do not run third-party analytics SDKs.</Bullet>
        </DocSection>

        <DocSection title="Third parties">
          <P>
            RoadPing uses Supabase (authentication, database, edge functions)
            and Apple Push Notification Service if you opt into notifications.
            Map tiles are rendered by Apple Maps on iOS. These providers
            process data on our behalf so RoadPing can function.
          </P>
        </DocSection>

        <DocSection title="Your choices">
          <Bullet>You can revoke location or microphone access in iOS Settings at any time.</Bullet>
          <Bullet>You can turn on Do Not Disturb in Settings to hide your speaking indicator.</Bullet>
          <Bullet>You can stop being visible at any time by ending your live session.</Bullet>
          <Bullet>You can delete your account from Settings → Delete Account.</Bullet>
        </DocSection>

        <DocSection title="Children">
          <P>
            RoadPing is not directed at children under 13 and we do not
            knowingly collect data from them.
          </P>
        </DocSection>

        <DocSection title="Contact">
          <P>For privacy questions or deletion help, contact:</P>
          <MailLink address={SUPPORT_EMAIL} />
        </DocSection>
      </DocBody>
    </ScreenScroll>
  );
}

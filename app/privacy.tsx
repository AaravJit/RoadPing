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

const LAST_UPDATED = '2026-10-01';
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
          <Bullet>Your location is used only while you are live, from Go Live until you end it. RoadPing never goes live on its own.</Bullet>
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
          <P>While you are live we briefly process:</P>
          <Bullet>Your current location (latitude, longitude, accuracy, heading, speed).</Bullet>
          <Bullet>Live session and voice session metadata (start time, range).</Bullet>
          <Bullet>
            With voice on: a push-to-talk token for this iPhone (deleted when
            your live session ends) and short-lived records of each time you
            talk (who, when, which room; deleted within about an hour). Never
            what you said.
          </Bullet>
        </DocSection>

        <DocSection title="Location">
          <P>
            RoadPing only requests "While Using the App" location access. It
            never asks for "Always". We do not store location history.
          </P>
          <P>
            Once you tap Go Live, RoadPing keeps using your location while you
            stay live, including when RoadPing is in the background or your
            screen is locked, so nearby drivers keep seeing you and private
            zones keep working. iOS shows a location indicator the whole time.
            This stops the moment your live session ends. If RoadPing is
            closed while you are live, the session ends and does not restart
            when you open the app again.
          </P>
          <P>
            Your current position is held only as your live presence record. It
            is deleted when:
          </P>
          <Bullet>You end your live session.</Bullet>
          <Bullet>You sign out, or RoadPing is closed (force-quit or ended by iOS).</Bullet>
          <Bullet>Your session expires from inactivity.</Bullet>
          <Bullet>You drive into a private zone.</Bullet>
          <P>
            Other drivers are never shown your coordinates, your exact
            distance, or which direction you are from them, and RoadPing does
            not place you on their map. While you are both live and within each
            other's range, they see only a broad distance range, such as "½–1
            mi" or "0.8–1.6 km". Our servers work that range out from positions
            snapped to a coarse grid (about 250 m) and keep it the same for
            about 30 seconds at a time. A broad range still says you are
            somewhere nearby: someone who can see you on the road, or who keeps
            comparing ranges while moving around, may be able to narrow down
            roughly where you are. The ranges you can choose (½, 1, 2 or 3 mi)
            sit on the same edges as these distance ranges, so changing your
            own range never tells anyone more. Use Private Zones and Stop &
            Hide wherever that matters to you.
          </P>
        </DocSection>

        <DocSection title="Microphone and voice">
          <P>
            The microphone is only used while you talk: while you hold the
            talk button, or use iOS push to talk from the Lock Screen, a
            headset button or CarPlay. Each time you talk, our servers decide
            who may hear it (live drivers within range, or the members of the
            room you have open), and each listener gets a private, short-lived
            pass for that one moment. Voice is delivered live through Agora
            and is not recorded, stored, or transcribed by RoadPing.
          </P>
          <P>
            Do Not Disturb pauses incoming voice: while it is on, no one's
            voice is played to you. You stay visible and can still talk.
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
            RoadPing uses Supabase (authentication, database, edge functions),
            Agora (live voice delivery; it sees technical data such as your IP
            address and a random per-talk ID, and RoadPing does not ask it to
            record anything) and Apple Push Notification Service (push to
            talk, and notifications if you opt in). Map tiles are rendered by
            Apple Maps on iOS. These providers process data on our behalf so
            RoadPing can function.
          </P>
        </DocSection>

        <DocSection title="Your choices">
          <Bullet>You can revoke location or microphone access in iOS Settings at any time.</Bullet>
          <Bullet>You can turn on Do Not Disturb to stop hearing incoming voice.</Bullet>
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

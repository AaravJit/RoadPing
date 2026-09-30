/**
 * app/safety.tsx — In-app Safety & Community Guidelines.
 *
 * Linked from Settings. Sets clear expectations about responsible use,
 * which both keeps users safe and directly addresses Apple guideline 1.4.1
 * (physical harm) and 1.2 (user-generated content).
 */
import React from 'react';

import { Bullet, DocBody, DocSection, MailLink, P } from '@/components/Document';
import { Notice, ScreenScroll } from '@/components/ui';

const SUPPORT_EMAIL = 'support@roadping.app';

export default function SafetyScreen() {
  return (
    <ScreenScroll>
      <DocBody>
        <Notice
          icon="hand.raised.fill"
          title="Drive first. Talk second."
          message="Use RoadPing only when it is safe and legal to do so. If looking at your phone would distract you, don't look at your phone."
        />

        <DocSection title="When to use RoadPing">
          <Bullet>Hold to talk only when it is safe to do so.</Bullet>
          <Bullet>Mount your phone — do not hold it while driving.</Bullet>
          <Bullet>Pull over if you need to focus on the app.</Bullet>
          <Bullet>Obey all traffic laws and local rules of the road.</Bullet>
        </DocSection>

        <DocSection title="What RoadPing is not">
          <P>
            RoadPing is for friendly, responsible road awareness between
            drivers. It is not:
          </P>
          <Bullet>Emergency services. If there is an emergency, call your local emergency number.</Bullet>
          <Bullet>A way to report crimes — contact local authorities.</Bullet>
          <Bullet>A turn-by-turn navigation or safety-critical driving system.</Bullet>
          <Bullet>A racing, evasion, or distracted-driving tool.</Bullet>
        </DocSection>

        <DocSection title="Community rules">
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
        </DocSection>

        <DocSection title="Block and report">
          <P>
            If a driver makes you uncomfortable, you can block or report them
            from their card in Nearby or in any room. Blocks are mutual: you
            will both become invisible to each other. Reports are silent — the
            reported user is never told.
          </P>
          <P>
            We review reports and act on community-safety violations. Serious
            or repeat violations can result in account removal.
          </P>
        </DocSection>

        <DocSection title="Your privacy is on by default">
          <Bullet>You are invisible until you tap Go Live.</Bullet>
          <Bullet>Other drivers never see your coordinates, exact distance or direction.</Bullet>
          <Bullet>Ending your live session removes you from Nearby immediately.</Bullet>
          <Bullet>Voice is live only — nothing is recorded.</Bullet>
          <Bullet>No location history is stored.</Bullet>
        </DocSection>

        <DocSection title="Contact">
          <P>Questions, abuse reports, or safety concerns:</P>
          <MailLink address={SUPPORT_EMAIL} />
        </DocSection>
      </DocBody>
    </ScreenScroll>
  );
}

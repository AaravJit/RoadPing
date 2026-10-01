/**
 * voice-transmission
 *
 * Server-authorized push-to-talk (Phase 3). See handler.ts for the actions
 * and the privacy contract, and docs/PHASE3_VOICE_PTT.md for the design.
 *
 * Secrets (names only): AGORA_APP_ID, AGORA_APP_CERTIFICATE (never sent to
 * clients), APNS_TEAM_ID, APNS_KEY_ID, APNS_PRIVATE_KEY, APNS_BUNDLE_ID.
 * Without the APNS_* secrets transmissions still work for listeners whose
 * app is open (they join from the Realtime speaking state); nobody is woken.
 */

import { createAdminClient } from '../_shared/client.ts';
import { getAuthUser } from '../_shared/auth.ts';
import { isRateLimited } from '../_shared/rateLimit.ts';
import { agoraConfigFromEnv } from '../_shared/agoraToken.ts';
import { apnsConfigFromEnv, sendPttPush } from '../_shared/apns.ts';
import { handleVoiceTransmission } from './handler.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

Deno.serve((req: Request) =>
  handleVoiceTransmission(req, {
    getAuthUser,
    createAdminClient,
    isRateLimited,
    agora: agoraConfigFromEnv(),
    apns: apnsConfigFromEnv(),
    sendPush: (cfg, target, payload) => sendPttPush(cfg, target, payload),
    runInBackground: (p) => {
      const guarded = p.catch((e) => console.error('ptt fan-out error:', e instanceof Error ? e.message : 'unknown'));
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime) EdgeRuntime.waitUntil(guarded);
    },
    nowMs: () => Date.now(),
  }),
);

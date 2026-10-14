/**
 * Agora RTC token minting for Phase 3 push-to-talk (docs/PHASE3_VOICE_PTT.md).
 *
 * The App Certificate never leaves the server. Every token is bound to one
 * opaque per-press channel and one uid, and expires quickly:
 *
 *   • Token and join privilege expire together (agora-token's tokenExpire and
 *     privilegeExpire are both "seconds from now"). Agora removes a user from
 *     the channel when the join privilege expires, so access ends by itself
 *     unless the server re-authorizes a renewal.
 *   • Lifetime is min(45 s, time to the transmission's hard end + 5 s).
 *     The SDK warns 30 s before expiry (onTokenPrivilegeWillExpire), so a
 *     listener re-asks the server roughly every 15 s of a long press.
 *
 * Roles: listeners get SUBSCRIBER and speakers PUBLISHER. Agora enforces the
 * subscriber role only when "co-host authentication" is enabled for the
 * project; until then a subscriber token can technically publish. That is a
 * documented residual risk (the channel is per press, the token expires in
 * <= 45 s, and the client subscribes only to the speaker's uid).
 */

import { RtcRole, RtcTokenBuilder } from 'npm:agora-token@2.0.5';

/** Upper bound for any voice token, seconds. */
export const VOICE_TOKEN_MAX_TTL_S = 45;
/** Slack past the hard end so a speaker's last words are not cut off. */
export const VOICE_TOKEN_HARD_END_SLACK_S = 5;

export interface AgoraConfig {
  appId: string;
  appCertificate: string;
}

/** Reads AGORA_APP_ID / AGORA_APP_CERTIFICATE. Null when either is missing. */
export function agoraConfigFromEnv(): AgoraConfig | null {
  const appId = Deno.env.get('AGORA_APP_ID');
  const appCertificate = Deno.env.get('AGORA_APP_CERTIFICATE');
  if (!appId || !appCertificate) return null;
  return { appId, appCertificate };
}

/**
 * Seconds a token for a transmission ending at hardEndIso should live, or 0
 * when the transmission is already past its hard end (mint nothing).
 */
export function voiceTokenTtlSeconds(hardEndIso: string, nowMs: number): number {
  const hardEndMs = Date.parse(hardEndIso);
  if (!Number.isFinite(hardEndMs)) return 0;
  const remaining = Math.ceil((hardEndMs - nowMs) / 1000);
  if (remaining <= 0) return 0;
  return Math.min(VOICE_TOKEN_MAX_TTL_S, remaining + VOICE_TOKEN_HARD_END_SLACK_S);
}

export type VoiceRole = 'publisher' | 'subscriber';

export function mintVoiceToken(
  cfg: AgoraConfig,
  channel: string,
  uid: number,
  role: VoiceRole,
  ttlSeconds: number,
): string {
  if (!Number.isInteger(uid) || uid < 1 || uid > 0xffffffff) throw new Error('invalid uid');
  if (!(ttlSeconds >= 1 && ttlSeconds <= VOICE_TOKEN_MAX_TTL_S)) throw new Error('invalid ttl');
  return RtcTokenBuilder.buildTokenWithUid(
    cfg.appId,
    cfg.appCertificate,
    channel,
    uid,
    role === 'publisher' ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER,
    ttlSeconds,
    ttlSeconds,
  );
}

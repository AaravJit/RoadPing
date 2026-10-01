/**
 * Calls to the Phase 3 voice endpoints (voice-transmission, ptt-token).
 *
 * The server decides who may hear whom on every call; this module only
 * carries requests and turns error responses into stable codes the voice
 * controller can act on. No Agora secret or certificate is ever involved
 * here: the client receives a channel name, a uid and a short-lived token.
 */
import { supabase } from '../supabase';
import { edgeFnUrl } from '../api';
import type { SpeakerGrant } from './transmissionMachine';

/** Stable failure codes. 'denied' is the same for unknown and refused. */
export type VoiceErrorCode =
  | 'not_live'
  | 'not_member'
  | 'transmission_ended'
  | 'denied'
  | 'voice_unavailable'
  | 'rate_limited'
  | 'invalid'
  | 'unauthorized'
  | 'network'
  | 'server';

export class VoiceApiError extends Error {
  constructor(public readonly code: VoiceErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'VoiceApiError';
  }
}

export interface ListenerGrant {
  transmissionId: string;
  appId: string;
  channel: string;
  uid: number;
  speakerUid: number;
  speakerId: string;
  token: string;
  tokenExpiresAt: string;
  hardEndAt: string;
  roomId: string | null;
}

/** Maps an HTTP status + server error string to a code. Exported for tests. */
export function voiceErrorCode(status: number, error: string | undefined): VoiceErrorCode {
  switch (error) {
    case 'not_live':
    case 'not_member':
    case 'transmission_ended':
    case 'denied':
    case 'voice_unavailable':
    case 'invalid':
      return error;
  }
  if (status === 401) return 'unauthorized';
  if (status === 429) return 'rate_limited';
  if (status === 400) return 'invalid';
  if (status === 403) return 'denied';
  return 'server';
}

async function post<Res>(name: string, body: Record<string, unknown>): Promise<Res> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new VoiceApiError('unauthorized');
  let res: Response;
  try {
    res = await fetch(edgeFnUrl(name), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new VoiceApiError('network');
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // fall through with null
  }
  if (!res.ok) {
    const error = (json as { error?: string } | null)?.error;
    throw new VoiceApiError(voiceErrorCode(res.status, error));
  }
  return json as Res;
}

interface BeginResponse {
  transmission_id: string;
  app_id: string;
  channel: string;
  uid: number;
  token: string;
  token_expires_at: string;
  hard_end_at: string;
  room_id: string | null;
}

/**
 * Starts (or, with the same clientTxId, renews) one press. Renewal is the
 * same call: the server re-checks everything and mints a fresh token for the
 * same transmission, or refuses.
 */
export async function beginTransmission(clientTxId: string): Promise<SpeakerGrant> {
  const r = await post<BeginResponse>('voice-transmission', { action: 'begin', client_tx_id: clientTxId });
  return {
    transmissionId: r.transmission_id,
    appId: r.app_id,
    channel: r.channel,
    uid: r.uid,
    token: r.token,
    tokenExpiresAt: r.token_expires_at,
    hardEndAt: r.hard_end_at,
    roomId: r.room_id,
  };
}

/** Speaker is publishing: the server shows "talking" from here on. */
export async function confirmTransmission(transmissionId: string): Promise<void> {
  await post('voice-transmission', { action: 'confirm', transmission_id: transmissionId });
}

/** Ends a press. transmissionId null ends any open press of this user. */
export async function endTransmission(
  transmissionId: string | null,
  reason: 'released' | 'max_hold' | 'failed' | 'interrupted' | 'aborted',
): Promise<void> {
  await post('voice-transmission', { action: 'end', transmission_id: transmissionId, reason });
}

/** Where this user's voice goes: a room id, or null for Nearby. */
export async function setVoiceContext(roomId: string | null): Promise<void> {
  await post('voice-transmission', { action: 'context', room_id: roomId });
}

interface GrantResponse {
  transmission_id: string;
  app_id: string;
  channel: string;
  uid: number;
  speaker_uid: number;
  speaker_id: string;
  token: string;
  token_expires_at: string;
  hard_end_at: string;
  room_id: string | null;
}

/**
 * Listener authorization for one transmission (by its id, or by the
 * voice_sessions row a foreground client saw in Realtime). Re-called to renew.
 */
export async function listenerGrant(
  ref: { transmissionId: string } | { voiceSessionId: string },
): Promise<ListenerGrant> {
  const body: Record<string, unknown> = { action: 'grant' };
  if ('transmissionId' in ref) body.transmission_id = ref.transmissionId;
  else body.voice_session_id = ref.voiceSessionId;
  const r = await post<GrantResponse>('voice-transmission', body);
  return {
    transmissionId: r.transmission_id,
    appId: r.app_id,
    channel: r.channel,
    uid: r.uid,
    speakerUid: r.speaker_uid,
    speakerId: r.speaker_id,
    token: r.token,
    tokenExpiresAt: r.token_expires_at,
    hardEndAt: r.hard_end_at,
    roomId: r.room_id,
  };
}

/** Stores this device's PushToTalk token for the current live session. */
export async function registerPttToken(args: {
  installationId: string;
  liveSessionId: string;
  token: string;
  environment: 'development' | 'production';
}): Promise<void> {
  await post('ptt-token', {
    action: 'register',
    installation_id: args.installationId,
    live_session_id: args.liveSessionId,
    token: args.token,
    apns_environment: args.environment,
  });
}

/** Removes this device's PushToTalk token (installationId null: all of the user's). */
export async function unregisterPttToken(installationId: string | null): Promise<void> {
  await post('ptt-token', { action: 'unregister', installation_id: installationId });
}

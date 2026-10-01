/**
 * voice-transmission request handling (Phase 3). index.ts wires the real
 * dependencies; handler.test.ts drives this with fakes.
 *
 * One endpoint, five actions. Every decision about who may hear whom is made
 * by the database (migration 013, private.voice_can_listen); this layer only
 * authenticates, rate-limits, mints short-lived Agora tokens and fans out
 * Apple PushToTalk pushes.
 *
 *   context  { room_id: uuid | null }        → set Nearby (null) or one Room
 *   begin    { client_tx_id: uuid }          → new press (or renew the
 *                                               speaker token: same id again)
 *   confirm  { transmission_id }             → speaker is publishing; turns on
 *                                               the public "talking" state
 *   end      { transmission_id?, reason? }   → release (never rate-limited)
 *   grant    { transmission_id | voice_session_id }
 *                                            → listener join or renewal; the
 *                                               server re-checks every time
 *
 * Privacy: responses and pushes carry no coordinates, distance or band. A
 * denied grant and a grant for a transmission that does not exist return the
 * same 403, so the endpoint cannot be used to probe who is talking.
 */

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { err, ok } from '../_shared/errors.ts';
import { isUUID } from '../_shared/validate.ts';
import type { RateLimitBucket } from '../_shared/rateLimit.ts';
import { type AgoraConfig, mintVoiceToken, voiceTokenTtlSeconds } from '../_shared/agoraToken.ts';
import type { ApnsConfig, ApnsEnvironment, PushOutcome } from '../_shared/apns.ts';

export interface VoiceDeps {
  getAuthUser: (req: Request) => Promise<User | null>;
  createAdminClient: () => SupabaseClient;
  isRateLimited: (admin: SupabaseClient, userId: string, bucket: RateLimitBucket) => Promise<boolean>;
  agora: AgoraConfig | null;
  apns: ApnsConfig | null;
  sendPush: (
    cfg: ApnsConfig,
    target: { token: string; environment: ApnsEnvironment },
    payload: Record<string, unknown>,
  ) => Promise<{ outcome: PushOutcome }>;
  /** Keeps work alive after the response (EdgeRuntime.waitUntil). */
  runInBackground: (p: Promise<unknown>) => void;
  nowMs: () => number;
}

const END_REASONS = new Set(['released', 'max_hold', 'failed', 'interrupted', 'aborted']);
const FANOUT_CONCURRENCY = 20;

type RpcResult = { ok: boolean; error?: string; [k: string]: unknown };

function denial(code: string | undefined): Response {
  switch (code) {
    case 'not_live':
      return err(409, 'not_live');
    case 'not_member':
      return err(403, 'not_member');
    case 'transmission_ended':
      return err(410, 'transmission_ended');
    case 'invalid':
      return err(400, 'invalid');
    default:
      return err(403, 'denied');
  }
}

function epochS(iso: string): number {
  return Math.floor(Date.parse(iso) / 1000);
}

export async function handleVoiceTransmission(req: Request, deps: VoiceDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return err(405, 'Method not allowed');

  try {
    const user = await deps.getAuthUser(req);
    if (!user) return err(401, 'Unauthorized');

    let body: Record<string, unknown>;
    try {
      const parsed: unknown = await req.json();
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error();
      body = parsed as Record<string, unknown>;
    } catch {
      return err(400, 'Request body must be a JSON object');
    }

    const admin = deps.createAdminClient();
    const action = body.action;

    // ── end: always allowed, never rate-limited (releasing must not fail) ──
    if (action === 'end') {
      const txId = body.transmission_id ?? null;
      if (txId !== null && !isUUID(txId)) return err(400, 'transmission_id must be a UUID');
      const reason = typeof body.reason === 'string' && END_REASONS.has(body.reason) ? body.reason : 'released';
      const { data, error } = await admin.rpc('voice_end_transmission', {
        p_user_id: user.id,
        p_transmission_id: txId,
        p_reason: reason,
      });
      if (error) {
        console.error('voice_end_transmission error:', error.code);
        return err(500, 'Failed to end transmission');
      }
      return ok({ ended: typeof data === 'number' ? data : 0 });
    }

    if (action === 'context') {
      const roomId = body.room_id ?? null;
      if (roomId !== null && !isUUID(roomId)) return err(400, 'room_id must be a UUID or null');
      if (await deps.isRateLimited(admin, user.id, 'voiceContext')) return err(429, 'Too many requests');
      const { data, error } = await admin.rpc('voice_set_context', { p_user_id: user.id, p_room_id: roomId });
      if (error) {
        console.error('voice_set_context error:', error.code);
        return err(500, 'Failed to set voice context');
      }
      const r = data as RpcResult;
      if (!r?.ok) return denial(r?.error);
      return ok({ room_id: roomId });
    }

    if (action === 'confirm') {
      if (!isUUID(body.transmission_id)) return err(400, 'transmission_id must be a UUID');
      const { data, error } = await admin.rpc('voice_confirm_transmission', {
        p_user_id: user.id,
        p_transmission_id: body.transmission_id,
      });
      if (error) {
        console.error('voice_confirm_transmission error:', error.code);
        return err(500, 'Failed to confirm transmission');
      }
      const r = data as RpcResult;
      if (!r?.ok) return denial(r?.error);
      return ok({ voice_session_id: r.voice_session_id, hard_end_at: r.hard_end_at });
    }

    if (action !== 'begin' && action !== 'grant') return err(400, 'Unknown action');

    // Token-issuing actions need Agora configured. The client's kill switch
    // (EXPO_PUBLIC_DISABLE_AGORA) normally prevents reaching this at all.
    if (!deps.agora) {
      console.error('voice-transmission: AGORA_APP_ID / AGORA_APP_CERTIFICATE not set');
      return err(503, 'voice_unavailable');
    }
    const agora = deps.agora;

    if (action === 'begin') {
      if (!isUUID(body.client_tx_id)) return err(400, 'client_tx_id must be a UUID');
      if (await deps.isRateLimited(admin, user.id, 'voiceBegin')) return err(429, 'Too many requests');

      const { data, error } = await admin.rpc('voice_begin_transmission', {
        p_user_id: user.id,
        p_client_tx_id: body.client_tx_id,
      });
      if (error) {
        console.error('voice_begin_transmission error:', error.code);
        return err(500, 'Failed to begin transmission');
      }
      const r = data as RpcResult;
      if (!r?.ok) return denial(r?.error);

      const hardEnd = String(r.hard_end_at);
      const now = deps.nowMs();
      const ttl = voiceTokenTtlSeconds(hardEnd, now);
      if (ttl <= 0) return err(410, 'transmission_ended');
      const channel = String(r.channel);
      const uid = Number(r.speaker_uid);
      const token = mintVoiceToken(agora, channel, uid, 'publisher', ttl);

      if (r.created === true) {
        deps.runInBackground(fanOut(admin, deps, user.id, String(r.transmission_id), r.room_id ?? null));
      }

      return ok({
        transmission_id: r.transmission_id,
        app_id: agora.appId,
        channel,
        uid,
        token,
        token_expires_at: new Date(now + ttl * 1000).toISOString(),
        hard_end_at: hardEnd,
        room_id: r.room_id ?? null,
      });
    }

    // ── grant ───────────────────────────────────────────────────────────────
    const txId = body.transmission_id ?? null;
    const vsId = body.voice_session_id ?? null;
    if ((txId === null) === (vsId === null)) {
      return err(400, 'Send exactly one of transmission_id or voice_session_id');
    }
    if ((txId !== null && !isUUID(txId)) || (vsId !== null && !isUUID(vsId))) {
      return err(400, 'ids must be UUIDs');
    }
    if (await deps.isRateLimited(admin, user.id, 'voiceGrant')) return err(429, 'Too many requests');

    const { data, error } = await admin.rpc('voice_listener_grant', {
      p_listener_id: user.id,
      p_transmission_id: txId,
      p_voice_session_id: vsId,
    });
    if (error) {
      console.error('voice_listener_grant error:', error.code);
      return err(500, 'Failed to authorize listener');
    }
    const r = data as RpcResult;
    if (!r?.ok) return err(403, 'denied');

    const hardEnd = String(r.hard_end_at);
    const now = deps.nowMs();
    const ttl = voiceTokenTtlSeconds(hardEnd, now);
    if (ttl <= 0) return err(403, 'denied');
    const channel = String(r.channel);
    const uid = Number(r.listener_uid);

    return ok({
      transmission_id: r.transmission_id,
      app_id: agora.appId,
      channel,
      uid,
      speaker_uid: Number(r.speaker_uid),
      speaker_id: r.speaker_id,
      token: mintVoiceToken(agora, channel, uid, 'subscriber', ttl),
      token_expires_at: new Date(now + ttl * 1000).toISOString(),
      hard_end_at: hardEnd,
      room_id: r.room_id ?? null,
    });
  } catch (e) {
    console.error('voice-transmission unhandled error:', e instanceof Error ? e.message : 'unknown');
    return err(500, 'Internal server error');
  }
}

interface FanoutRow {
  listener_id: string;
  listener_uid: number;
  token: string;
  apns_environment: ApnsEnvironment;
  channel: string;
  speaker_uid: number;
  hard_end_at: string;
}

/**
 * Sends one PushToTalk push per eligible listener device, each carrying that
 * listener's own short-lived subscriber token, so the woken app can join
 * without another round trip. Best effort: a missed push only means that
 * listener misses this press.
 *
 * Payload (key "rp", version 1). No location, distance or band:
 *   tx   transmission id      ch   channel        uid  listener uid
 *   suid speaker uid          sid  speaker user   name speaker display name
 *   room room id or null      tok  token          exp  token expiry (epoch s)
 *   end  hard end (epoch s)   app  Agora App ID (public)
 */
export async function fanOut(
  admin: SupabaseClient,
  deps: Pick<VoiceDeps, 'agora' | 'apns' | 'sendPush' | 'nowMs'>,
  speakerId: string,
  transmissionId: string,
  roomId: unknown,
): Promise<{ sent: number; dropped: number; failed: number }> {
  const result = { sent: 0, dropped: 0, failed: 0 };
  if (!deps.apns || !deps.agora) return result;
  const apns = deps.apns;
  const agora = deps.agora;

  const [{ data: rows, error }, { data: profile }] = await Promise.all([
    admin.rpc('voice_fanout_targets', { p_transmission_id: transmissionId }),
    admin.from('profiles').select('display_name').eq('id', speakerId).maybeSingle(),
  ]);
  if (error || !Array.isArray(rows) || rows.length === 0) return result;

  const name = String((profile as { display_name?: string } | null)?.display_name ?? 'Driver').slice(0, 40);
  const now = deps.nowMs();

  const queue = [...(rows as FanoutRow[])];
  const worker = async () => {
    for (let row = queue.shift(); row; row = queue.shift()) {
      const ttl = voiceTokenTtlSeconds(row.hard_end_at, now);
      if (ttl <= 0) return;
      const payload = {
        rp: {
          v: 1,
          tx: transmissionId,
          ch: row.channel,
          uid: row.listener_uid,
          suid: row.speaker_uid,
          sid: speakerId,
          name,
          room: roomId ?? null,
          tok: mintVoiceToken(agora, row.channel, row.listener_uid, 'subscriber', ttl),
          exp: Math.floor(now / 1000) + ttl,
          end: epochS(row.hard_end_at),
          app: agora.appId,
        },
      };
      const { outcome } = await deps.sendPush(apns, { token: row.token, environment: row.apns_environment }, payload);
      if (outcome === 'sent') result.sent++;
      else if (outcome === 'drop_token') {
        result.dropped++;
        await admin.rpc('drop_ptt_token', { p_token: row.token });
      } else result.failed++;
    }
  };
  await Promise.all(Array.from({ length: Math.min(FANOUT_CONCURRENCY, queue.length) }, worker));
  if (result.failed > 0 || result.dropped > 0) {
    console.log(`ptt fan-out: sent ${result.sent}, dropped ${result.dropped}, failed ${result.failed}`);
  }
  return result;
}

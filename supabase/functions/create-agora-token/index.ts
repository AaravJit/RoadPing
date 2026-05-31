/**
 * create-agora-token
 *
 * Mints a short-lived Agora RTC token so the mobile client can join a voice
 * channel for real-time, live-only push-to-talk audio.
 *
 * Supabase remains the source of truth for identity, live sessions, rooms and
 * moderation. Agora is used ONLY as the real-time audio transport. This
 * function never stores audio — it returns a join credential and nothing else.
 *
 * Input:
 *   {
 *     target: "nearby" | "room",
 *     session_id?: string,   // required when target === "nearby" (live_session.id)
 *     room_id?: string       // required when target === "room"
 *   }
 *
 * Behavior:
 *   1. Authenticate the JWT user.
 *   2. target = "nearby" → verify the user owns an ACTIVE live_session.
 *   3. target = "room"   → verify the user is an ACTIVE member of the room.
 *   4. Build an Agora RTC token bound to a deterministic per-user uid.
 *   5. Return { appId, channelName, token, uid, expiresAt }.
 *
 * Channel naming:
 *   • room:   roadping-room-{room_id}        ← all members share one channel
 *   • nearby: roadping-nearby-{session_id}   ← reserved; keyed to the caller's
 *             own session, so it does NOT yet group geographically-near drivers
 *             into a shared channel (see Phase 15 notes). The token is valid;
 *             real grouped nearby audio is deferred.
 *
 * Secrets (NOT prefixed SUPABASE_ — that prefix is reserved by Supabase):
 *   • AGORA_APP_ID
 *   • AGORA_APP_CERTIFICATE   (never sent to the client)
 */

import { RtcTokenBuilder, RtcRole } from 'npm:agora-token@2.0.5';
import { corsHeaders } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/client.ts';
import { getAuthUser } from '../_shared/auth.ts';
import { ok, err } from '../_shared/errors.ts';
import { isUUID } from '../_shared/validate.ts';

/** Token lifetime. Long enough for a full drive; the client refreshes by re-requesting. */
const TOKEN_TTL_SECONDS = 3600;

/**
 * Deterministic 32-bit Agora uid derived from the Supabase user id.
 *
 * Agora uids are unsigned 32-bit ints. We derive a stable, collision-resistant
 * uid from the user uuid (FNV-1a) so the same person always joins with the same
 * uid — this lets the client map remote audio back to a known member, and keeps
 * the value out of the [reserved 0] slot. MUST match agoraUidForUser() on the
 * client (src/services/agoraVoice.ts).
 */
function agoraUid(userId: string): number {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < userId.length; i++) {
    hash ^= userId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV prime
  }
  // Constrain to [1, 2^31 - 1] — keep it positive and clear of 0 (reserved).
  return (hash >>> 1 || 1) >>> 0;
}

type Target = 'nearby' | 'room';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── Secrets ───────────────────────────────────────────────────────────────
    const appId = Deno.env.get('AGORA_APP_ID');
    const appCertificate = Deno.env.get('AGORA_APP_CERTIFICATE');
    if (!appId || !appCertificate) {
      console.error('Agora secrets missing: set AGORA_APP_ID and AGORA_APP_CERTIFICATE');
      return err(500, 'Voice is not configured on the server');
    }

    // ── Auth ────────────────────────────────────────────────────────────────
    const user = await getAuthUser(req);
    if (!user) return err(401, 'Unauthorized');

    // ── Parse body ──────────────────────────────────────────────────────────
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return err(400, 'Request body must be valid JSON');
    }

    const target = body.target as Target | undefined;
    if (target !== 'nearby' && target !== 'room') {
      return err(400, 'target must be "nearby" or "room"');
    }

    const sessionId = body.session_id;
    const roomId = body.room_id;

    const admin = createAdminClient();
    let channelName: string;

    if (target === 'nearby') {
      // ── Verify the caller owns an active live session ──────────────────────
      if (!isUUID(sessionId)) {
        return err(400, 'session_id must be a valid UUID for nearby voice');
      }
      const { data: session } = await admin
        .from('live_sessions')
        .select('id')
        .eq('id', sessionId)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();
      if (!session) {
        return err(403, 'No active session or session does not belong to you');
      }
      channelName = `roadping-nearby-${sessionId}`;
    } else {
      // ── Verify active room membership ──────────────────────────────────────
      if (!isUUID(roomId)) {
        return err(400, 'room_id must be a valid UUID for room voice');
      }
      const { data: membership } = await admin
        .from('room_members')
        .select('user_id')
        .eq('room_id', roomId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (!membership) {
        return err(403, 'You are not a member of this room');
      }
      channelName = `roadping-room-${roomId}`;
    }

    // ── Mint the RTC token ────────────────────────────────────────────────────
    const uid = agoraUid(user.id);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = nowSeconds + TOKEN_TTL_SECONDS;

    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channelName,
      uid,
      RtcRole.PUBLISHER,
      TOKEN_TTL_SECONDS,
      privilegeExpiredTs,
    );

    return ok({
      appId,
      channelName,
      token,
      uid,
      expiresAt: new Date(privilegeExpiredTs * 1000).toISOString(),
    });
  } catch (e) {
    console.error('create-agora-token unhandled error:', e);
    return err(500, 'Internal server error');
  }
});

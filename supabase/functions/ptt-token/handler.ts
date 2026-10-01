/**
 * ptt-token request handling (Phase 3). index.ts wires the real dependencies.
 *
 * Stores the Apple PushToTalk ephemeral APNs token the system gives the app
 * after it joins its PushToTalk channel (that happens when the user goes
 * live). The token is bound to that live session and deleted when the
 * session ends, expires or the user logs out (migration 013).
 *
 *   register   { installation_id, live_session_id, token (hex), apns_environment }
 *   unregister { installation_id? }   (omit to remove every device's token)
 */

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { err, ok } from '../_shared/errors.ts';
import { isUUID } from '../_shared/validate.ts';
import type { RateLimitBucket } from '../_shared/rateLimit.ts';

export interface PttTokenDeps {
  getAuthUser: (req: Request) => Promise<User | null>;
  createAdminClient: () => SupabaseClient;
  isRateLimited: (admin: SupabaseClient, userId: string, bucket: RateLimitBucket) => Promise<boolean>;
}

const TOKEN_RE = /^[0-9a-fA-F]{64,512}$/;

export async function handlePttToken(req: Request, deps: PttTokenDeps): Promise<Response> {
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

    if (body.action === 'unregister') {
      const inst = body.installation_id ?? null;
      if (inst !== null && !isUUID(inst)) return err(400, 'installation_id must be a UUID');
      const { data, error } = await admin.rpc('unregister_ptt_token', {
        p_user_id: user.id,
        p_installation_id: inst,
      });
      if (error) {
        console.error('unregister_ptt_token error:', error.code);
        return err(500, 'Failed to remove token');
      }
      return ok({ removed: typeof data === 'number' ? data : 0 });
    }

    if (body.action !== 'register') return err(400, 'Unknown action');

    const { installation_id, live_session_id, token, apns_environment } = body;
    if (!isUUID(installation_id)) return err(400, 'installation_id must be a UUID');
    if (!isUUID(live_session_id)) return err(400, 'live_session_id must be a UUID');
    if (typeof token !== 'string' || !TOKEN_RE.test(token)) return err(400, 'token must be hex');
    if (apns_environment !== 'development' && apns_environment !== 'production') {
      return err(400, 'apns_environment must be development or production');
    }
    if (await deps.isRateLimited(admin, user.id, 'pttRegister')) return err(429, 'Too many requests');

    const { data, error } = await admin.rpc('register_ptt_token', {
      p_user_id: user.id,
      p_installation_id: installation_id,
      p_live_session_id: live_session_id,
      p_token: token,
      p_apns_environment: apns_environment,
    });
    if (error) {
      console.error('register_ptt_token error:', error.code);
      return err(500, 'Failed to store token');
    }
    const r = data as { ok?: boolean; error?: string } | null;
    if (!r?.ok) return r?.error === 'not_live' ? err(409, 'not_live') : err(400, 'invalid');
    return ok({ registered: true });
  } catch (e) {
    console.error('ptt-token unhandled error:', e instanceof Error ? e.message : 'unknown');
    return err(500, 'Internal server error');
  }
}

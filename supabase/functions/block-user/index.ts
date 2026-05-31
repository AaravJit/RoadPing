/**
 * block-user
 *
 * Adds a block relationship from the authenticated user to blocked_user_id.
 * Blocking is mutual: both parties become invisible to each other in all
 * nearby queries (enforced by is_blocked() in get_nearby_drivers).
 *
 * Idempotent: blocking the same user again returns success without error.
 * Self-block is rejected.
 * The blocked user is NEVER notified.
 */

import { corsHeaders } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/client.ts';
import { getAuthUser } from '../_shared/auth.ts';
import { ok, err } from '../_shared/errors.ts';
import { isUUID } from '../_shared/validate.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
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

    const { blocked_user_id } = body;

    if (!isUUID(blocked_user_id)) {
      return err(400, 'blocked_user_id must be a valid UUID');
    }

    // ── Self-block guard ─────────────────────────────────────────────────────
    if (blocked_user_id === user.id) {
      return err(400, 'Cannot block yourself');
    }

    const admin = createAdminClient();

    // ── Verify target user exists ────────────────────────────────────────────
    const { data: target } = await admin
      .from('profiles')
      .select('id')
      .eq('id', blocked_user_id)
      .maybeSingle();

    if (!target) {
      return err(404, 'User not found');
    }

    // ── Insert block (idempotent via unique PK) ──────────────────────────────
    const { error: blockError } = await admin
      .from('blocks')
      .insert({ blocker_id: user.id, blocked_id: blocked_user_id });

    // 23505 = unique_violation — block already exists; treat as success
    if (blockError && blockError.code !== '23505') {
      console.error('blocks insert error:', blockError);
      return err(500, 'Failed to block user');
    }

    return ok({ success: true });
  } catch (e) {
    console.error('block-user unhandled error:', e);
    return err(500, 'Internal server error');
  }
});

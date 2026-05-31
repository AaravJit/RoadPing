/**
 * expire-stale-sessions
 *
 * HTTP-callable trigger for the session cleanup job.
 * The primary cleanup mechanism is pg_cron (runs every minute automatically).
 * This Edge Function is for:
 *   • Manual on-demand cleanup (admin use)
 *   • Testing the cleanup flow
 *   • Integration with external schedulers if pg_cron is unavailable
 *
 * Security: requires a CRON_SECRET Authorization header to prevent abuse.
 * Set it via: supabase secrets set CRON_SECRET=your-secret-here
 *
 * Usage:
 *   curl -X POST https://<project>.supabase.co/functions/v1/expire-stale-sessions \
 *     -H "Authorization: Bearer <CRON_SECRET>"
 */

import { corsHeaders } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/client.ts';
import { ok, err } from '../_shared/errors.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── Secret-based auth (not JWT) ──────────────────────────────────────────
    const cronSecret = Deno.env.get('CRON_SECRET');
    if (!cronSecret) {
      // No secret configured → treat as misconfigured and deny
      console.error('CRON_SECRET env var is not set');
      return err(503, 'Service unavailable');
    }

    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token || token !== cronSecret) {
      return err(401, 'Unauthorized');
    }

    const admin = createAdminClient();

    // ── Run the cleanup job ──────────────────────────────────────────────────
    // expire_stale_sessions() handles:
    //   1. Voice sessions stuck with is_speaking = true past expires_at
    //   2. Stale location_presence rows
    //   3. live_sessions past their expires_at window
    const { error: rpcError } = await admin.rpc('expire_stale_sessions');

    if (rpcError) {
      console.error('expire_stale_sessions RPC error:', rpcError);
      return err(500, 'Cleanup failed');
    }

    return ok({ success: true, ran_at: new Date().toISOString() });
  } catch (e) {
    console.error('expire-stale-sessions unhandled error:', e);
    return err(500, 'Internal server error');
  }
});

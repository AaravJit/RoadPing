/**
 * report-user
 *
 * Files a silent report against reported_user_id.
 *
 * Rules:
 *   • Self-report is rejected
 *   • The reported user is NEVER notified
 *   • Response is always the same shape regardless of outcome
 *     (prevents enumeration of whether a report was accepted)
 *   • Details are truncated at 500 chars (matches DB constraint)
 */

import { corsHeaders } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/client.ts';
import { getAuthUser } from '../_shared/auth.ts';
import { ok, err } from '../_shared/errors.ts';
import {
  isUUID,
  isReportReason,
  isReportContext,
} from '../_shared/validate.ts';

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

    const { reported_user_id, reason, context, details } = body;

    if (!isUUID(reported_user_id)) {
      return err(400, 'reported_user_id must be a valid UUID');
    }
    if (!isReportReason(reason)) {
      return err(400, 'Invalid report reason');
    }
    if (!isReportContext(context)) {
      return err(400, 'Invalid report context');
    }
    if (details !== undefined && typeof details !== 'string') {
      return err(400, 'details must be a string');
    }

    // ── Self-report guard ────────────────────────────────────────────────────
    if (reported_user_id === user.id) {
      return err(400, 'Cannot report yourself');
    }

    const admin = createAdminClient();

    // ── Insert report ────────────────────────────────────────────────────────
    const { error: reportError } = await admin
      .from('reports')
      .insert({
        reporter_id: user.id,
        reported_user_id,
        reason,
        context,
        details:
          typeof details === 'string'
            ? details.slice(0, 500) // enforce client-side too; DB has CHECK
            : null,
      });

    if (reportError) {
      // Log internally but return generic success to client.
      // The reported user must never know a report was filed.
      console.error('reports insert error:', reportError);
    }

    // Always return the same shape — prevents probing
    return ok({ success: true });
  } catch (e) {
    console.error('report-user unhandled error:', e);
    return err(500, 'Internal server error');
  }
});

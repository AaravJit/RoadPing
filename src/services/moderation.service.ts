// ============================================================================
// RoadPing — Moderation service (report + block)
//
// report_user and block_user go through Edge Functions.
// Listing own blocks is a direct Supabase query (own-row RLS).
// ============================================================================

import { supabase } from './supabase';
import { callEdgeFn } from './supabase';
import { ServiceError } from './types';
import type { Report, ReportCreate, Block } from './types';

// ── Reports ───────────────────────────────────────────────────────────────────

/**
 * File a report against another user.
 * The report is inserted silently — the reported user is never notified.
 *
 * @param input.reported_id  UUID of the user being reported (must not be self)
 * @param input.reason       Free-text reason
 * @param input.context      'map' | 'room' | 'voice' | 'profile'
 * @param input.session_id   Live session UUID if the incident was during a session
 */
export async function reportUser(input: ReportCreate): Promise<Report> {
  if (!input.reported_id) {
    throw new ServiceError('INVALID_INPUT', 'reported_id is required.');
  }
  if (!input.reason?.trim()) {
    throw new ServiceError('INVALID_INPUT', 'reason is required.');
  }

  const result = await callEdgeFn<{ report: Report }>('report_user', {
    reported_id: input.reported_id,
    reason:      input.reason.trim(),
    context:     input.context ?? null,
    session_id:  input.session_id ?? null,
  });

  return result.report;
}

/**
 * List the signed-in user's own filed reports, newest first.
 */
export async function listMyReports(): Promise<Report[]> {
  const { data, error } = await supabase
    .from('reports')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new ServiceError('DB_ERROR', error.message);
  return (data ?? []) as Report[];
}

// ── Blocks ────────────────────────────────────────────────────────────────────

/**
 * Block another user.
 * Idempotent — safe to call more than once.
 * The block is silent: the blocked user never knows and loses mutual visibility.
 */
export async function blockUser(blockedId: string): Promise<{ blocked: true; blocked_id: string }> {
  if (!blockedId) throw new ServiceError('INVALID_INPUT', 'blocked_id is required.');

  return callEdgeFn<{ blocked: true; blocked_id: string }>('block_user', {
    blocked_id: blockedId,
  });
}

/**
 * Unblock a user (delete the block row).
 * Direct Supabase delete — RLS ensures only the blocker can delete.
 */
export async function unblockUser(blockedId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new ServiceError('NOT_AUTHENTICATED', 'Not signed in.', 401);

  const { error } = await supabase
    .from('blocks')
    .delete()
    .eq('blocker_id', user.id)
    .eq('blocked_id', blockedId);

  if (error) throw new ServiceError('DB_ERROR', error.message);
}

/**
 * List all users the signed-in user has blocked.
 * Only the blocker can see this list — RLS hides it from the blocked user.
 */
export async function listMyBlocks(): Promise<Block[]> {
  const { data, error } = await supabase
    .from('blocks')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new ServiceError('DB_ERROR', error.message);
  return (data ?? []) as Block[];
}

/**
 * Check whether the signed-in user has blocked a specific user.
 */
export async function hasBlocked(targetUserId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await supabase
    .from('blocks')
    .select('blocker_id')
    .eq('blocker_id', user.id)
    .eq('blocked_id', targetUserId)
    .maybeSingle();

  if (error) throw new ServiceError('DB_ERROR', error.message);
  return data !== null;
}

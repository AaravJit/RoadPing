/**
 * Moderation service — block, unblock, silent report, list blocked users.
 *
 * block-user and report-user go through Edge Functions (server-side
 * mutual-block enforcement and silent reporting).
 * listBlockedUsers and unblockUser use the Supabase anon client directly
 * (RLS-gated: blocker can read/delete their own rows).
 */
import { supabase } from './supabase';
import { edgeFnUrl } from './api';
import type {
  BlockUserRequest,
  BlockUserResponse,
  ReportUserRequest,
  ReportUserResponse,
} from './api';
import type { ReportReason, ReportContext } from './types';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ReportReasonOption {
  value: ReportReason;
  label: string;
  description: string;
}

export type BlockedUserProfile = {
  blocked_id: string;
  display_name: string;
  handle: string | null;
  avatar_url: string | null;
  blocked_at: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

export const REPORT_REASON_OPTIONS: readonly ReportReasonOption[] = [
  {
    value: 'harassment',
    label: 'Harassment or abuse',
    description: 'Targeted, repeated, or abusive contact.',
  },
  {
    value: 'threats',
    label: 'Threats or unsafe behavior',
    description: 'Threatening, intimidating, or dangerous conduct.',
  },
  {
    value: 'hate_or_discrimination',
    label: 'Hate or discrimination',
    description: 'Hateful or discriminatory content toward a group.',
  },
  {
    value: 'inappropriate_content',
    label: 'Sexual or inappropriate content',
    description: 'Sexual, explicit, or otherwise inappropriate content.',
  },
  {
    value: 'spam',
    label: 'Spam or scam',
    description: 'Repetitive, commercial, or deceptive content.',
  },
  {
    value: 'dangerous_driving',
    label: 'Unsafe driving / road danger',
    description: 'Reckless, aggressive, or unsafe driving.',
  },
  {
    value: 'impersonation',
    label: 'Impersonation',
    description: "Pretending to be someone they're not.",
  },
  {
    value: 'other',
    label: 'Other',
    description: 'Something else not listed above.',
  },
] as const;

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function accessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  if (data.session === null) throw new Error('Not authenticated.');
  return data.session.access_token;
}

async function post<Req, Res>(name: string, body: Req): Promise<Res> {
  const token = await accessToken();
  const res = await fetch(edgeFnUrl(name), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { error?: string } & Res;
  if (!res.ok) {
    throw new Error(json.error ?? `Server error (${res.status})`);
  }
  return json;
}

// ─── Block ────────────────────────────────────────────────────────────────────

export async function blockUser(
  req: BlockUserRequest,
): Promise<BlockUserResponse> {
  return post<BlockUserRequest, BlockUserResponse>('block-user', req);
}

export async function unblockUser(blockedUserId: string): Promise<void> {
  const { data } = await supabase.auth.getSession();
  if (data.session === null) throw new Error('Not authenticated.');
  const { error } = await supabase
    .from('blocks')
    .delete()
    .eq('blocker_id', data.session.user.id)
    .eq('blocked_id', blockedUserId);
  if (error) throw error;
}

export async function listBlockedUsers(): Promise<BlockedUserProfile[]> {
  const { data } = await supabase.auth.getSession();
  if (data.session === null) throw new Error('Not authenticated.');

  const { data: blockRows, error: blockErr } = await supabase
    .from('blocks')
    .select('blocked_id, created_at')
    .eq('blocker_id', data.session.user.id)
    .order('created_at', { ascending: false });

  if (blockErr) throw blockErr;
  if (!blockRows || blockRows.length === 0) return [];

  const ids = blockRows.map((r) => r.blocked_id);
  const { data: profiles, error: profileErr } = await supabase
    .from('profiles')
    .select('id, display_name, handle, avatar_url')
    .in('id', ids);

  if (profileErr) throw profileErr;

  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.id, p]),
  );

  return blockRows.map((r) => {
    const p = profileMap.get(r.blocked_id);
    return {
      blocked_id: r.blocked_id,
      display_name: p?.display_name ?? 'Unknown',
      handle: p?.handle ?? null,
      avatar_url: p?.avatar_url ?? null,
      blocked_at: r.created_at,
    };
  });
}

// ─── Report ───────────────────────────────────────────────────────────────────

export async function reportUser(
  req: ReportUserRequest,
): Promise<ReportUserResponse> {
  return post<ReportUserRequest, ReportUserResponse>('report-user', req);
}

/**
 * Account service — destructive operations on the caller's own account.
 *
 * Apple App Review requires in-app account deletion. The actual auth-user
 * delete needs the Supabase service-role key, which we never expose to the
 * mobile client. Instead this calls the `delete-account` Edge Function which
 * runs the destructive work server-side under service role.
 *
 * Caller responsibility after success: clear the local auth session.
 */
import { supabase } from './supabase';
import { edgeFnUrl } from './api';

interface DeleteAccountResponse {
  success: true;
}

/**
 * Permanently delete the authenticated user's account.
 *
 * The Edge Function stops any active live session, removes presence/push
 * tokens/blocks/room memberships, anonymizes reports filed by the user
 * (kept for moderation), then calls auth.admin.deleteUser() — which
 * cascades the profiles row and every owned table.
 *
 * Throws on failure. On success the caller should call supabase.auth.signOut()
 * to clear the local session and redirect to onboarding.
 */
export async function deleteAccount(): Promise<DeleteAccountResponse> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(edgeFnUrl('delete-account'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new Error(`Server error (${res.status})`);
  }
  if (!res.ok) {
    throw new Error(
      (json as { error?: string }).error ?? `Server error (${res.status})`,
    );
  }
  return json as DeleteAccountResponse;
}

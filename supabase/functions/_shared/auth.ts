import type { User } from '@supabase/supabase-js';
import { createAdminClient } from './client.ts';

/**
 * Extracts and verifies the JWT from the Authorization header.
 * Returns the authenticated Supabase user, or null if the token is missing
 * or invalid.
 *
 * Uses the admin client's auth.getUser() to validate the token server-side.
 * This is the canonical way to authenticate Edge Function requests.
 */
export async function getAuthUser(req: Request): Promise<User | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7); // strip 'Bearer '
  if (!token) return null;

  const admin = createAdminClient();
  const {
    data: { user },
    error,
  } = await admin.auth.getUser(token);

  if (error || !user) return null;
  return user;
}

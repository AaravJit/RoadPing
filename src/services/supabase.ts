// ============================================================================
// RoadPing — Supabase client + Edge Function caller
//
// Setup (run once in your Expo project):
//   npx expo install @supabase/supabase-js @react-native-async-storage/async-storage
//
// Environment variables (.env):
//   EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
//   EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ServiceError } from './types';

const SUPABASE_URL     = process.env.EXPO_PUBLIC_SUPABASE_URL     ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    '[RoadPing] EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY is not set.\n' +
    'Create a .env file in the Expo project root:\n' +
    '  EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co\n' +
    '  EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-key>',
  );
}

/** Supabase client — use this for direct table queries and auth. */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// ── Edge Function caller ──────────────────────────────────────────────────────

/**
 * Envelope returned by every RoadPing Edge Function.
 *
 *   POST /functions/v1/<name>  →  { ok: true,  data: T }
 *                              →  { ok: false, error: { code, message } }
 */
interface EdgeEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
}

/**
 * Call a RoadPing Edge Function with the current user's JWT.
 *
 * Throws a `ServiceError` on:
 *   - network failure
 *   - JSON parse failure
 *   - { ok: false, error: {...} } in the response envelope
 */
export async function callEdgeFn<T = unknown>(
  name: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token ?? '';

  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(body ?? {}),
    });
  } catch (cause) {
    throw new ServiceError(
      'NETWORK_ERROR',
      `Network request to ${name} failed: ${(cause as Error).message}`,
      0,
    );
  }

  let envelope: EdgeEnvelope<T>;
  try {
    envelope = await res.json() as EdgeEnvelope<T>;
  } catch {
    throw new ServiceError('UNKNOWN', `Non-JSON response from ${name} (HTTP ${res.status})`, res.status);
  }

  if (!envelope.ok) {
    const err = envelope.error ?? { code: 'UNKNOWN', message: `HTTP ${res.status}` };
    throw new ServiceError(err.code, err.message, res.status);
  }

  return envelope.data as T;
}

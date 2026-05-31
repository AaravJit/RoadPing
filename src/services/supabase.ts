/**
 * Supabase client for RoadPing.
 *
 * Rules:
 *  - Only the anon (public) key is used here. Never the service-role key.
 *  - Sessions are persisted via AsyncStorage so the user stays logged in.
 *  - URL polyfill must be imported before createClient (handled by the import below).
 *  - detectSessionInUrl is false — deep-link auth is not used in this native app.
 *
 * STARTUP SAFETY:
 *  createClient() THROWS ("supabaseUrl is required.") when the env vars are
 *  empty — which happens if EAS didn't inject EXPO_PUBLIC_SUPABASE_* into the
 *  build. If that throw ran at module-import time it would crash the native
 *  launch (splash → close) before any error screen could render. So the client
 *  is built lazily, on first use, behind a Proxy. When env is missing, callers
 *  simply never touch it — the root layout shows a Configuration Error screen
 *  instead (gated on `isSupabaseConfigured`).
 */
import 'react-native-url-polyfill/auto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { ENV, isEnvConfigured } from './env';
import type { Database } from './types';

/** True when the Supabase env vars are present. Never throws. */
export const isSupabaseConfigured = isEnvConfigured();

let _client: SupabaseClient<Database> | null = null;

/** Builds (once) and returns the real Supabase client. Throws only if env is
 *  missing AND this is actually called — which the UI prevents by gating on
 *  `isSupabaseConfigured` before mounting anything that uses the client. */
export function getSupabase(): SupabaseClient<Database> {
  if (_client) return _client;
  _client = createClient<Database>(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
  return _client;
}

/**
 * Lazy proxy: existing `import { supabase }` call sites keep working unchanged,
 * but the underlying client is only constructed on first property access — so
 * merely importing this module never throws, even with missing env.
 */
export const supabase: SupabaseClient<Database> = new Proxy(
  {} as SupabaseClient<Database>,
  {
    get(_target, prop, receiver) {
      const client = getSupabase();
      const value = Reflect.get(client as object, prop, receiver);
      return typeof value === 'function' ? value.bind(client) : value;
    },
  },
);

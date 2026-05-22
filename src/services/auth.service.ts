// ============================================================================
// RoadPing — Auth service
// Thin wrapper around supabase.auth; exposes only the methods the app needs.
// ============================================================================

import { supabase } from './supabase';
import { ServiceError } from './types';
import type { AuthSession, AuthUser } from './types';
import type { AuthChangeEvent, Session, Subscription } from '@supabase/supabase-js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapSession(session: Session): AuthSession {
  return {
    access_token:  session.access_token,
    refresh_token: session.refresh_token ?? '',
    expires_at:    session.expires_at ?? 0,
    user: mapUser(session.user),
  };
}

function mapUser(user: { id: string; email?: string; phone?: string; created_at: string }): AuthUser {
  return {
    id:         user.id,
    email:      user.email,
    phone:      user.phone,
    created_at: user.created_at,
  };
}

function throwAuthError(error: { message?: string } | null | undefined): never {
  throw new ServiceError('NOT_AUTHENTICATED', error?.message ?? 'Authentication failed.', 401);
}

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * Sign in with email + password.
 * Throws `ServiceError` on wrong credentials or network failure.
 */
export async function signInWithEmail(
  email: string,
  password: string,
): Promise<AuthSession> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) throwAuthError(error);
  return mapSession(data.session!);
}

/**
 * Create a new account.
 * Returns a session immediately if email confirmation is disabled in Supabase;
 * otherwise session is null and the user must confirm their email.
 */
export async function signUpWithEmail(
  email: string,
  password: string,
): Promise<AuthSession | null> {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throwAuthError(error);
  return data.session ? mapSession(data.session) : null;
}

/**
 * Sign in / up via a magic-link email (passwordless).
 * Supabase sends the link; the app handles the deep-link redirect.
 */
export async function signInWithMagicLink(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({ email });
  if (error) throwAuthError(error);
}

/**
 * Sign the current user out and clear the local session.
 */
export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw new ServiceError('UNKNOWN', error.message);
}

/**
 * Return the current session from the persistent store, or null if not signed in.
 * Call this at app start to restore a previous session.
 */
export async function getSession(): Promise<AuthSession | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new ServiceError('UNKNOWN', error.message);
  return data.session ? mapSession(data.session) : null;
}

/**
 * Return the currently authenticated user, or null.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return mapUser(data.user);
}

/**
 * Subscribe to auth state changes (SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, etc.).
 * Returns an unsubscribe function — call it in a cleanup effect.
 *
 * @example
 *   const unsub = onAuthStateChange((event, session) => {
 *     setUser(session?.user ?? null);
 *   });
 *   return unsub;
 */
export function onAuthStateChange(
  callback: (event: AuthChangeEvent, session: AuthSession | null) => void,
): () => void {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session ? mapSession(session) : null);
  });
  return () => (data.subscription as Subscription).unsubscribe();
}

/**
 * Refresh the current session (rotate the JWT).
 * The Supabase client does this automatically, but you can call it explicitly
 * after a 401 to force a retry.
 */
export async function refreshSession(): Promise<AuthSession | null> {
  const { data, error } = await supabase.auth.refreshSession();
  if (error) throw new ServiceError('NOT_AUTHENTICATED', error.message, 401);
  return data.session ? mapSession(data.session) : null;
}

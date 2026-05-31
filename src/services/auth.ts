/**
 * Auth service — thin wrappers around Supabase Auth.
 *
 * Rules:
 *  - Only the anon/public Supabase client is used here (never service-role).
 *  - Emails are normalised (trimmed + lowercased) before being sent.
 *  - Raw Supabase error messages are never exposed to the UI;
 *    friendlyAuthError() maps them to human-readable strings.
 */
import { supabase } from './supabase';
import { destroyEngine as destroyAgoraEngine } from './agoraVoice';

// ─── Sign in ─────────────────────────────────────────────────────────────────

export async function signInWithPassword(
  email: string,
  password: string,
) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) throw error;
  return data; // { session, user }
}

// ─── Sign up ─────────────────────────────────────────────────────────────────

export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) throw error;

  return {
    session: data.session,
    user: data.user,
    /**
     * true  → Supabase requires email confirmation; session is null until
     *         the user clicks the confirmation link.
     * false → Email confirmation is disabled; the user is signed in immediately.
     */
    needsEmailConfirmation: data.session === null,
  };
}

// ─── Sign out ─────────────────────────────────────────────────────────────────

export async function signOut() {
  // Tear down any live Agora audio engine before clearing the session so no
  // channel membership outlives the logout. Best-effort; never blocks sign-out.
  try {
    await destroyAgoraEngine();
  } catch {
    // ignore — engine may not be initialized (Expo Go / never joined)
  }
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// ─── Error mapping ────────────────────────────────────────────────────────────

/**
 * Maps raw Supabase auth error messages to user-friendly strings.
 * Never show raw error messages in the UI.
 */
export function friendlyAuthError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);

  if (msg.includes('Invalid login credentials')) {
    return 'Incorrect email or password.';
  }
  if (msg.includes('Email not confirmed')) {
    return 'Please confirm your email before signing in.';
  }
  if (msg.includes('User already registered')) {
    return 'An account with this email already exists.';
  }
  if (msg.includes('Password should be at least')) {
    return 'Password must be at least 6 characters.';
  }
  if (msg.includes('Unable to validate email') || msg.includes('invalid email')) {
    return 'Please enter a valid email address.';
  }
  if (msg.includes('rate limit') || msg.includes('too many')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  if (msg.includes('network') || msg.includes('fetch')) {
    return 'Connection error. Check your internet and try again.';
  }
  return 'Something went wrong. Please try again.';
}

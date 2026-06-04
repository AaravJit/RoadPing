/**
 * Auth service — thin wrappers around Supabase Auth.
 *
 * Rules:
 *  - Only the anon/public Supabase client is used here (never service-role).
 *  - Emails are normalised (trimmed + lowercased) before being sent.
 *  - Raw Supabase error messages are never exposed to the UI;
 *    friendlyAuthError() maps them to human-readable strings.
 */
import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import type { EmailOtpType } from '@supabase/supabase-js';

import { supabase } from './supabase';
import { destroyEngine as destroyAgoraEngine } from './agoraVoice';

// ─── Email verification redirect ───────────────────────────────────────────────

/**
 * The exact deep link Supabase redirects to after verifying an email link.
 *
 * Hardcoded to the literal app-scheme URL (NOT `Linking.createURL`, which
 * resolves to an `exp://…` dev URL in Expo Go) so it always matches the value
 * allow-listed in the Supabase dashboard → URL Configuration → Additional
 * Redirect URLs. Production-safe: never localhost.
 */
export const AUTH_CALLBACK_URL = 'roadping://auth/callback';

export function authCallbackUrl(): string {
  return AUTH_CALLBACK_URL;
}

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
    options: {
      // Send the confirmation link back into the app via our deep link,
      // not the dashboard Site URL (which would be localhost).
      emailRedirectTo: authCallbackUrl(),
    },
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

// ─── Resend verification ───────────────────────────────────────────────────────

/**
 * Re-send the signup confirmation email. Used by the "Check your email" screen.
 * Reuses the same deep-link redirect so the new link also returns to the app.
 * Throws on error (e.g. rate limit) so the UI can show a friendly message.
 */
export async function resendVerificationEmail(email: string) {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: email.trim().toLowerCase(),
    options: { emailRedirectTo: authCallbackUrl() },
  });
  if (error) throw error;
}

// ─── Email verification callback ────────────────────────────────────────────────

const VALID_OTP_TYPES: readonly EmailOtpType[] = [
  'signup',
  'email',
  'magiclink',
  'recovery',
  'invite',
  'email_change',
];

/**
 * Coerce the `type` param from an email deep link into a valid EmailOtpType.
 * Defaults to 'email' (the generic email OTP) when missing/unknown.
 */
export function normalizeOtpType(raw: string | undefined | null): EmailOtpType {
  return raw != null && (VALID_OTP_TYPES as readonly string[]).includes(raw)
    ? (raw as EmailOtpType)
    : 'email';
}

/**
 * PREFERRED verification path: confirm an email link by its `token_hash`.
 *
 * This is device-independent (no PKCE code verifier needed) and works even when
 * the email is opened on a different device or in-app browser. Requires the
 * Supabase email template to deep-link with `token_hash` + `type` (see the
 * dashboard notes shipped with this change). Throws on expired/invalid tokens.
 */
export async function verifyEmailOtp(tokenHash: string, type: EmailOtpType) {
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  });
  if (error) throw error;
  return data; // { session, user }
}

/**
 * PKCE path: exchange a `?code=…` for a session. The code verifier was stored
 * locally at signUp time, so this only completes on the same device. Throws on
 * expired/invalid codes.
 */
export async function exchangeCodeForSession(code: string) {
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) throw error;
  return data; // { session, user }
}

/**
 * Implicit-flow fallback: some Supabase configs return the session directly in
 * the deep-link hash (`#access_token=…&refresh_token=…`). Adopt it explicitly.
 * Tokens are never logged. Throws if Supabase rejects them.
 */
export async function setSessionFromTokens(
  accessToken: string,
  refreshToken: string,
) {
  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) throw error;
  return data; // { session, user }
}

// ─── Sign in with Apple (native identity-token flow) ───────────────────────────

/**
 * Whether native Sign in with Apple can be offered on this device.
 * iOS only, and only when the OS reports the capability available (a real
 * iPhone, or a Simulator signed into an Apple ID). Never throws.
 */
export async function isAppleAuthAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * True when an Apple sign-in error is the user simply cancelling the sheet.
 * The UI should treat this as a no-op (no error banner).
 */
export function isAppleCancel(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === 'ERR_REQUEST_CANCELED'
  );
}

/**
 * Real Sign in with Apple:
 *   1. Open the native Apple auth sheet and obtain an identity token (a JWT
 *      whose audience is our bundle ID).
 *   2. Hand that token to Supabase via signInWithIdToken — Supabase verifies it
 *      with Apple and signs in (or creates) the user, returning a session.
 *
 * The identity token is NEVER logged. Apple only returns the user's name/email
 * on the FIRST authorization; we don't need them here — Supabase derives the
 * account from the token, and the route gate still sends new users through
 * profile setup. Cancellation throws an ERR_REQUEST_CANCELED error which the
 * caller filters with isAppleCancel().
 */
export async function signInWithApple() {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });

  const identityToken = credential.identityToken;
  if (identityToken == null || identityToken.length === 0) {
    throw new Error('Apple did not return an identity token.');
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: identityToken,
  });
  if (error) throw error;
  return data; // { session, user }
}

/**
 * Friendly message for an Apple sign-in failure. Keeps email-flow mapping
 * untouched while adding Apple-specific cases (provider not yet enabled in the
 * Supabase dashboard, missing token, network). Never surfaces raw errors.
 */
export function friendlyAppleError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);

  if (
    msg.includes('Unsupported provider') ||
    msg.includes('provider is not enabled') ||
    msg.includes('Provider not found') ||
    msg.includes('not enabled')
  ) {
    return 'Apple sign-in isn’t available yet. Please continue with email for now.';
  }
  if (msg.includes('identity token')) {
    return 'Apple sign-in didn’t complete. Please try again.';
  }
  if (msg.includes('network') || msg.includes('fetch')) {
    return 'Connection error. Check your internet and try again.';
  }
  return 'Could not sign in with Apple. Please try again or use email.';
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
  if (
    msg.includes('expired') ||
    msg.includes('otp_expired') ||
    msg.includes('invalid or has expired')
  ) {
    return 'This verification link has expired. Request a new one to continue.';
  }
  if (msg.includes('For security purposes') || msg.includes('only request this')) {
    return 'Please wait a moment before requesting another email.';
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

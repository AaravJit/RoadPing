/**
 * app/auth/callback.tsx — Email verification / magic-link deep-link handler.
 *
 * Supabase opens `roadping://auth/callback?…` after the user taps the email
 * link. The primary flow is the standard HTTPS `{{ .ConfirmationURL }}` button,
 * which verifies server-side then redirects here. We resolve the session from
 * whichever form the redirect carries:
 *
 *   1. code               → exchangeCodeForSession() (PRIMARY — PKCE redirect)
 *   2. access_token+refresh_token (hash) → setSession() (PRIMARY — implicit redirect)
 *   3. token_hash + type  → verifyOtp()              (FALLBACK — direct-link templates)
 *   4. error / error_code → polished "link expired" screen
 *
 * On success we hand off to the route gate (app/index.tsx) which forwards the
 * verified user to the right next step (profile → vehicle → Drive).
 *
 * A safety timeout flips to the error screen if no usable params ever arrive,
 * so the user is never stuck on an infinite "Verifying…" spinner.
 *
 * Security: tokens/codes are never logged.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';

import { LoadingState } from '@/components/LoadingState';
import { RoadPingLogo } from '@/components/RoadPingLogo';
import { AppText, Button, Screen } from '@/components/ui';
import {
  exchangeCodeForSession,
  normalizeOtpType,
  setSessionFromTokens,
  verifyEmailOtp,
} from '@/services/auth';
import { makeStyles } from '@/theme/ThemeProvider';
import { Spacing } from '@/theme/spacing';

type Status = 'working' | 'error';

/** How long to wait for a usable deep link before showing the error screen. */
const RESOLVE_TIMEOUT_MS = 10_000;

interface AuthParams {
  tokenHash?: string;
  type?: string;
  code?: string;
  accessToken?: string;
  refreshToken?: string;
  error?: string;
}

/**
 * Extract auth params from a deep link. Reads BOTH the query string and the
 * hash fragment so we handle whichever form Supabase sends. Returns only the
 * fields we act on — never logs the raw URL.
 */
function parseAuthParams(url: string | null): AuthParams {
  if (url == null) return {};
  const params: Record<string, string> = {};
  const collect = (segment: string) => {
    if (segment.length === 0) return;
    for (const pair of segment.split('&')) {
      const eq = pair.indexOf('=');
      const key = eq >= 0 ? pair.slice(0, eq) : pair;
      const val = eq >= 0 ? pair.slice(eq + 1) : '';
      if (key) params[decodeURIComponent(key)] = decodeURIComponent(val);
    }
  };
  const q = url.indexOf('?');
  const h = url.indexOf('#');
  if (q >= 0) collect(url.slice(q + 1, h > q ? h : undefined));
  if (h >= 0) collect(url.slice(h + 1));

  return {
    tokenHash: params.token_hash,
    type: params.type,
    code: params.code,
    accessToken: params.access_token,
    refreshToken: params.refresh_token,
    error: params.error ?? params.error_code,
  };
}

export default function AuthCallbackScreen() {
  const router = useRouter();
  const styles = useStyles();
  const url = Linking.useURL();
  const [status, setStatus] = useState<Status>('working');
  const handled = useRef(false);

  function fail() {
    if (handled.current) return;
    handled.current = true;
    setStatus('error');
  }

  function succeed() {
    // Session is live — let the route gate decide the next screen.
    router.replace('/');
  }

  // Resolve the session from whatever the link carries.
  useEffect(() => {
    if (url == null || handled.current) return;

    const p = parseAuthParams(url);

    if (p.error != null) {
      fail();
      return;
    }

    // PRIMARY: ConfirmationURL redirect carries a PKCE `code`.
    if (p.code != null) {
      handled.current = true;
      void (async () => {
        try {
          await exchangeCodeForSession(p.code as string);
          succeed();
        } catch {
          setStatus('error');
        }
      })();
      return;
    }

    // PRIMARY: implicit redirect carries tokens in the hash.
    if (p.accessToken != null && p.refreshToken != null) {
      handled.current = true;
      void (async () => {
        try {
          await setSessionFromTokens(p.accessToken as string, p.refreshToken as string);
          succeed();
        } catch {
          setStatus('error');
        }
      })();
      return;
    }

    // FALLBACK: direct-link templates that pass token_hash + type.
    if (p.tokenHash != null) {
      handled.current = true;
      void (async () => {
        try {
          await verifyEmailOtp(p.tokenHash as string, normalizeOtpType(p.type));
          succeed();
        } catch {
          setStatus('error');
        }
      })();
    }
    // Nothing usable yet — a cold start may deliver the URL a tick later; the
    // timeout below covers the case where it never does.
  }, [url, router]);

  // Safety net: never spin forever.
  useEffect(() => {
    const t = setTimeout(() => {
      if (!handled.current) fail();
    }, RESOLVE_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, []);

  // ── Expired / invalid link ────────────────────────────────────────────────
  if (status === 'error') {
    return (
      <Screen>
        <View style={styles.errorContainer}>
          <RoadPingLogo size={72} />
          <AppText variant="title1" weight="bold" align="center" accessibilityRole="header">
            This link has expired
          </AppText>
          <AppText variant="body" color="secondary" align="center">
            Verification links only work once and for a limited time. Request a
            new one and we&apos;ll send it to your inbox.
          </AppText>
          <View style={styles.actions}>
            <Button
              label="Send a New Link"
              size="lg"
              fullWidth
              onPress={() => router.replace('/auth?mode=signup')}
            />
            <Button
              label="Back to Sign In"
              variant="plain"
              fullWidth
              onPress={() => router.replace('/auth?mode=signin')}
            />
          </View>
        </View>
      </Screen>
    );
  }

  // ── Verifying ───────────────────────────────────────────────────────────────
  return <LoadingState message="Verifying your email…" />;
}

const useStyles = makeStyles(() => ({
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md12,
  },
  actions: {
    alignSelf: 'stretch',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
}));

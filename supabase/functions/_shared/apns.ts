/**
 * Apple Push Notification service sender for PushToTalk pushes.
 *
 * Apple sources (docs/PHASE3_VOICE_PTT.md → Sources):
 *   • PushToTalk pushes use `apns-push-type: pushtotalk`, topic
 *     `<bundle id>.voip-ptt`, priority 10 and expiration 0 ("Creating a Push
 *     to Talk app"; "Sending notification requests to APNs").
 *   • Token-based auth: an ES256 JWT {alg, kid} / {iss: team id, iat},
 *     refreshed no more than every 20 and no less than every 60 minutes
 *     ("Establishing a token-based connection to APNs").
 *   • Never retry BadDeviceToken, DeviceTokenNotForTopic, Forbidden,
 *     ExpiredToken, Unregistered or PayloadTooLarge ("Handling notification
 *     responses from APNs").
 *
 * Secrets (names only; values live in Supabase secrets, never in the repo):
 *   APNS_TEAM_ID, APNS_KEY_ID, APNS_PRIVATE_KEY (the .p8 contents),
 *   APNS_BUNDLE_ID (com.aarav.jit.roadping).
 */

export interface ApnsConfig {
  teamId: string;
  keyId: string;
  privateKeyPem: string;
  bundleId: string;
}

export type ApnsEnvironment = 'development' | 'production';

export function apnsConfigFromEnv(): ApnsConfig | null {
  const teamId = Deno.env.get('APNS_TEAM_ID');
  const keyId = Deno.env.get('APNS_KEY_ID');
  const privateKeyPem = Deno.env.get('APNS_PRIVATE_KEY');
  const bundleId = Deno.env.get('APNS_BUNDLE_ID');
  if (!teamId || !keyId || !privateKeyPem || !bundleId) return null;
  return { teamId, keyId, privateKeyPem, bundleId };
}

export function apnsHost(env: ApnsEnvironment): string {
  return env === 'development' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com';
}

// ── Provider token (JWT) ────────────────────────────────────────────────────

/** Reuse a provider token for 40 minutes: inside Apple's 20-60 minute window. */
export const PROVIDER_TOKEN_REUSE_S = 40 * 60;

let cached: { keyId: string; iat: number; jwt: string } | null = null;

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToPkcs8(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const raw = atob(body);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function signProviderToken(cfg: ApnsConfig, iat: number): Promise<string> {
  const enc = new TextEncoder();
  const header = b64url(enc.encode(JSON.stringify({ alg: 'ES256', kid: cfg.keyId })));
  const claims = b64url(enc.encode(JSON.stringify({ iss: cfg.teamId, iat })));
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(cfg.privateKeyPem),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  // WebCrypto returns the raw r||s form JWS ES256 expects.
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`)),
  );
  return `${header}.${claims}.${b64url(sig)}`;
}

export async function providerToken(cfg: ApnsConfig, nowS: number): Promise<string> {
  if (cached && cached.keyId === cfg.keyId && nowS - cached.iat < PROVIDER_TOKEN_REUSE_S) {
    return cached.jwt;
  }
  const jwt = await signProviderToken(cfg, nowS);
  cached = { keyId: cfg.keyId, iat: nowS, jwt };
  return jwt;
}

/** Test hook: forget the cached provider token. */
export function resetProviderTokenCache(): void {
  cached = null;
}

// ── Requests and responses ──────────────────────────────────────────────────

export interface PttPushTarget {
  token: string;
  environment: ApnsEnvironment;
}

export function buildPttRequest(
  cfg: ApnsConfig,
  target: PttPushTarget,
  payload: Record<string, unknown>,
  jwt: string,
): { url: string; init: RequestInit } {
  return {
    url: `${apnsHost(target.environment)}/3/device/${target.token}`,
    init: {
      method: 'POST',
      headers: {
        authorization: `bearer ${jwt}`,
        'apns-push-type': 'pushtotalk',
        'apns-topic': `${cfg.bundleId}.voip-ptt`,
        'apns-priority': '10',
        'apns-expiration': '0',
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
  };
}

/** sent | drop_token (forget this device token) | failed (log, do not retry). */
export type PushOutcome = 'sent' | 'drop_token' | 'failed';

const DROP_TOKEN_REASONS = new Set(['BadDeviceToken', 'DeviceTokenNotForTopic', 'Unregistered', 'ExpiredToken']);

export function classifyApnsResponse(status: number, reason: string | undefined): PushOutcome {
  if (status === 200) return 'sent';
  if (status === 410) return 'drop_token';
  if (reason && DROP_TOKEN_REASONS.has(reason)) return 'drop_token';
  // A push is only useful for the next few seconds, so nothing is retried.
  return 'failed';
}

export async function sendPttPush(
  cfg: ApnsConfig,
  target: PttPushTarget,
  payload: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
  nowS: number = Math.floor(Date.now() / 1000),
): Promise<{ outcome: PushOutcome; status: number; reason?: string }> {
  const jwt = await providerToken(cfg, nowS);
  const { url, init } = buildPttRequest(cfg, target, payload, jwt);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetchImpl(url, { ...init, signal: ctrl.signal });
    let reason: string | undefined;
    if (res.status !== 200) {
      try {
        reason = ((await res.json()) as { reason?: string }).reason;
      } catch {
        reason = undefined;
      }
    } else {
      await res.body?.cancel();
    }
    return { outcome: classifyApnsResponse(res.status, reason), status: res.status, reason };
  } catch {
    return { outcome: 'failed', status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

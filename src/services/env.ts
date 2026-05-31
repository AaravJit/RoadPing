/**
 * Environment variable validation.
 *
 * All public env vars must be prefixed EXPO_PUBLIC_ so Metro bundles them.
 * No service-role key ever lives here or in the mobile app.
 *
 * Call `validateEnv()` once at app startup (root layout) to fail fast
 * with a clear message rather than a cryptic runtime crash later.
 */

const REQUIRED_VARS = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
] as const;

type RequiredVar = (typeof REQUIRED_VARS)[number];

/**
 * Read a single env var. Returns empty string in Expo Go when .env is not
 * present so the app can still render an error screen instead of crashing.
 */
function readVar(key: RequiredVar): string {
  return process.env[key] ?? '';
}

/**
 * Returns the list of required env vars that are missing/empty.
 * NEVER throws — safe to call at module-import time or during render.
 */
export function missingEnvVars(): RequiredVar[] {
  return REQUIRED_VARS.filter((key) => {
    const value = process.env[key];
    return typeof value !== 'string' || value.length === 0;
  });
}

/** True when every required env var is present. Never throws. */
export function isEnvConfigured(): boolean {
  return missingEnvVars().length === 0;
}

/**
 * Returns a human-readable config-error message, or null when fully configured.
 * Used to render an in-app "Configuration Error" screen INSTEAD of crashing the
 * JS bundle at startup. Never logs or returns secret values.
 */
export function envErrorMessage(): string | null {
  const missing = missingEnvVars();
  if (missing.length === 0) return null;
  return [
    'Missing required environment variables:',
    ...missing.map((k) => `  • ${k}`),
    '',
    'These are injected by EAS at build time. Make sure each eas.json build',
    'profile sets "environment" and that the vars are assigned to it.',
  ].join('\n');
}

/**
 * Validate all required environment variables.
 * Throws a descriptive error if any are missing.
 *
 * NOTE: prefer the non-throwing `isEnvConfigured()` / `envErrorMessage()` at
 * startup. A throw during module evaluation crashes the native launch before
 * any error screen can render. This remains only for explicit imperative use.
 */
export function validateEnv(): void {
  const msg = envErrorMessage();
  if (msg !== null) {
    throw new Error(`❌ RoadPing: ${msg}`);
  }
}

/**
 * Typed, validated environment variables.
 * Only access this after calling `validateEnv()`.
 */
export const ENV = {
  SUPABASE_URL: readVar('EXPO_PUBLIC_SUPABASE_URL'),
  SUPABASE_ANON_KEY: readVar('EXPO_PUBLIC_SUPABASE_ANON_KEY'),
} as const;

/**
 * Screenshot/demo mode flag.
 *
 * When `EXPO_PUBLIC_SCREENSHOT_MODE=true` is set in the local `.env`,
 * `getNearbyDrivers()` returns a curated fixture list instead of calling the
 * backend, so the Drive screen looks populated for App Store screenshots even
 * when no real drivers are nearby.
 *
 * Safety rules:
 *   • Disabled by default — the prod TestFlight/App Store build must NOT set it.
 *   • Does not touch the backend, does not create fake users in production.
 *   • The Drive screen renders a visible "DEMO" badge whenever this is on, so
 *     a tester/reviewer can never mistake demo data for real activity.
 */
export const SCREENSHOT_MODE: boolean =
  process.env.EXPO_PUBLIC_SCREENSHOT_MODE === 'true';

/**
 * Agora kill switch.
 *
 * When `EXPO_PUBLIC_DISABLE_AGORA=true` is set, the app never loads, requires,
 * or initializes the react-native-agora native module. Use this to build a
 * RoadPing binary with Agora fully disabled to prove whether the native SDK is
 * the cause of a post-launch native crash. Room voice safely degrades to
 * speaking-indicator-only; everything else (launch, sign in, Drive, rooms)
 * continues to work.
 *
 * Phase 15 Agora code is NOT removed — only gated behind this flag.
 */
export const DISABLE_AGORA: boolean =
  process.env.EXPO_PUBLIC_DISABLE_AGORA === 'true';

/** True when running inside Expo Go (no native modules available). */
export const IS_EXPO_GO =
  typeof __DEV__ !== 'undefined' &&
  // Expo Go sets this global; bare/EAS builds do not
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).expo?.modules?.ExpoModulesCore === undefined;

/** True when running a development build or Expo Go. */
export const IS_DEV = __DEV__;

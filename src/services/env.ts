/**
 * Environment variable validation.
 *
 * All public env vars must be prefixed EXPO_PUBLIC_ so Metro bundles them.
 * No service-role key ever lives here or in the mobile app.
 *
 * IMPORTANT — STATIC REFERENCES ONLY:
 * Expo public env vars are inlined into the JS bundle by Metro/EAS at build
 * time. That inlining is a *textual* substitution of `process.env.EXPO_PUBLIC_X`
 * with the literal value. It ONLY works with static dot notation. Reading them
 * dynamically (e.g. `process.env[name]` or `process.env['EXPO_PUBLIC_X']`)
 * leaves the lookup untouched, so at runtime in a release build the value is
 * `undefined` — which is exactly why TestFlight showed "Configuration Error"
 * despite the vars being set in EAS. Never read these dynamically.
 *
 * Call `validateEnv()` once at app startup (root layout) to fail fast
 * with a clear message rather than a cryptic runtime crash later.
 */

/**
 * Typed environment variables.
 *
 * Each value is read with STATIC dot notation so Metro/EAS can inline it into
 * the production bundle. Do not refactor these into a dynamic lookup.
 */
export const ENV = {
  SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  DISABLE_AGORA: process.env.EXPO_PUBLIC_DISABLE_AGORA === 'true',
} as const;

/** Required vars, keyed by the EXPO_PUBLIC_ name for human-readable messages. */
const REQUIRED_VARS = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
] as const;

type RequiredVar = (typeof REQUIRED_VARS)[number];

/**
 * Returns the list of required env vars that are missing/empty.
 * Checks the statically-inlined ENV values (never a dynamic lookup).
 * NEVER throws — safe to call at module-import time or during render.
 */
export function missingEnvVars(): RequiredVar[] {
  const missing: RequiredVar[] = [];
  if (ENV.SUPABASE_URL.length === 0) missing.push('EXPO_PUBLIC_SUPABASE_URL');
  if (ENV.SUPABASE_ANON_KEY.length === 0)
    missing.push('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  return missing;
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
 * Safe startup check. Logs only presence/absence — NEVER the actual values.
 * Helps confirm in TestFlight device logs whether static inlining worked.
 */
console.log(
  `[RoadPing] env static check — url present: ${
    ENV.SUPABASE_URL.length > 0 ? 'yes' : 'no'
  }, anon present: ${ENV.SUPABASE_ANON_KEY.length > 0 ? 'yes' : 'no'}`
);

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
export const DISABLE_AGORA: boolean = ENV.DISABLE_AGORA;

/** True when running inside Expo Go (no native modules available). */
export const IS_EXPO_GO =
  typeof __DEV__ !== 'undefined' &&
  // Expo Go sets this global; bare/EAS builds do not
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).expo?.modules?.ExpoModulesCore === undefined;

/** True when running a development build or Expo Go. */
export const IS_DEV = __DEV__;

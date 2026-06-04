/**
 * scripts/create-review-user.mjs — one-time App Store Review account provisioner.
 *
 * Creates (or safely updates) a single, standard NON-ADMIN Supabase auth user
 * that Apple's reviewers sign in with, plus the minimum rows the app's route
 * gate needs: a completed profile (valid handle) and one demo vehicle.
 *
 * SECURITY
 *  - Service-role key is read from the environment ONLY. Nothing is hardcoded
 *    and no secret is committed. This script never ships in the mobile app.
 *  - The account is a normal user: no admin flag, no special grants, no bypass.
 *
 * USAGE (provision / reset password — idempotent):
 *   SUPABASE_URL='https://<ref>.supabase.co' \
 *   SUPABASE_SERVICE_ROLE_KEY='<service_role secret>' \
 *   REVIEW_PASSWORD='<the generated password>' \
 *   node scripts/create-review-user.mjs
 *
 * DELETE the review account later:
 *   SUPABASE_URL='...' SUPABASE_SERVICE_ROLE_KEY='...' \
 *   node scripts/create-review-user.mjs --delete
 *
 * Accepted env aliases: SUPABASE_URL|PROJECT_URL,
 *                       SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY
 */
import { createClient } from '@supabase/supabase-js';

// ─── Fixed review-account values ──────────────────────────────────────────────
const EMAIL = 'appreview@roadping.app';
const DISPLAY_NAME = 'Apple Review';
const HANDLE = 'applereview'; // 3–25 chars, ^[a-zA-Z0-9_]+$
const VEHICLE = {
  label: '2024 Honda Civic',
  vehicle_type: 'car', // coarse enum derived from body_type 'sedan'
  body_type: 'sedan',
  make: 'Honda',
  model: 'Civic',
  color: 'Black',
  year: 2024,
  is_active: true,
};

// ─── Env ──────────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.PROJECT_URL;
const SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;
const REVIEW_PASSWORD = process.env.REVIEW_PASSWORD;
const DELETE_MODE = process.argv.includes('--delete');

function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

if (!SUPABASE_URL) fail('Missing SUPABASE_URL (or PROJECT_URL).');
if (!SERVICE_ROLE) {
  fail('Missing SUPABASE_SERVICE_ROLE_KEY (or SERVICE_ROLE_KEY).');
}
if (!DELETE_MODE && (!REVIEW_PASSWORD || REVIEW_PASSWORD.length < 24)) {
  fail('Set REVIEW_PASSWORD to the generated password (≥ 24 characters).');
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Find an auth user by email by paging through the admin user list. */
async function findUserByEmail(email) {
  const target = email.toLowerCase();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    const hit = data.users.find((u) => (u.email ?? '').toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < 200) break; // last page
  }
  return null;
}

/** Pick a handle that isn't already taken by a different profile. */
async function resolveHandle(ownId) {
  for (const candidate of [HANDLE, `${HANDLE}_ios`, `${HANDLE}_app`]) {
    const { data, error } = await admin
      .from('profiles')
      .select('id')
      .eq('handle', candidate)
      .maybeSingle();
    if (error && error.code !== 'PGRST116') throw error;
    if (!data || data.id === ownId) return candidate;
  }
  // Fallback: guaranteed-unique suffix.
  return `${HANDLE}_${ownId.slice(0, 6)}`;
}

// ─── Delete mode ──────────────────────────────────────────────────────────────
async function runDelete() {
  const user = await findUserByEmail(EMAIL);
  if (!user) {
    console.log(`\nNo user found for ${EMAIL}. Nothing to delete.\n`);
    return;
  }
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) throw error;
  console.log(
    `\n✔ Deleted ${EMAIL} (${user.id}).\n` +
      `  profiles + vehicles rows were removed automatically (ON DELETE CASCADE).\n`,
  );
}

// ─── Provision mode ───────────────────────────────────────────────────────────
async function runProvision() {
  const created = [];
  const updated = [];

  // 1) Auth user — create or reset password (email pre-confirmed).
  let user = await findUserByEmail(EMAIL);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: EMAIL,
      password: REVIEW_PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: DISPLAY_NAME },
    });
    if (error) throw error;
    user = data.user;
    created.push(`auth.users (${user.id})`);
  } else {
    const { error } = await admin.auth.admin.updateUserById(user.id, {
      password: REVIEW_PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: DISPLAY_NAME },
    });
    if (error) throw error;
    updated.push(`auth.users (${user.id}) — password reset, email confirmed`);
  }

  const userId = user.id;

  // 2) Profile — needs a valid handle for the route gate's isComplete.
  const handle = await resolveHandle(userId);
  const { data: beforeProfile } = await admin
    .from('profiles')
    .select('id, handle')
    .eq('id', userId)
    .maybeSingle();

  const { error: profErr } = await admin
    .from('profiles')
    .upsert(
      { id: userId, display_name: DISPLAY_NAME, handle },
      { onConflict: 'id' },
    );
  if (profErr) throw profErr;
  (beforeProfile ? updated : created).push(
    `public.profiles (handle="${handle}", display_name="${DISPLAY_NAME}")`,
  );

  // 3) Vehicle — gate needs at least one. Insert demo only if none exist.
  const { data: vehicles, error: vehSelErr } = await admin
    .from('vehicles')
    .select('id')
    .eq('user_id', userId);
  if (vehSelErr) throw vehSelErr;

  if (!vehicles || vehicles.length === 0) {
    const { error: vehErr } = await admin
      .from('vehicles')
      .insert({ user_id: userId, ...VEHICLE });
    if (vehErr) throw vehErr;
    created.push(`public.vehicles ("${VEHICLE.label}", ${VEHICLE.body_type})`);
  } else {
    updated.push(
      `public.vehicles — left existing ${vehicles.length} row(s) untouched`,
    );
  }

  // ─── Summary ────────────────────────────────────────────────────────────────
  console.log('\n──────────────────────────────────────────────');
  console.log(' RoadPing — App Store Review account ready');
  console.log('──────────────────────────────────────────────');
  console.log(` Email:    ${EMAIL}`);
  console.log(` Password: ${REVIEW_PASSWORD}`);
  console.log(` User ID:  ${userId}`);
  console.log(` Admin:    NO (standard user, no special grants)`);
  if (created.length) console.log('\n Created:');
  created.forEach((r) => console.log(`   + ${r}`));
  if (updated.length) console.log('\n Updated / verified:');
  updated.forEach((r) => console.log(`   ~ ${r}`));
  console.log(
    '\n Note: first-run education is stored on-device (AsyncStorage), so the\n' +
      ' reviewer taps through the 3 intro cards once. Profile + vehicle are set,\n' +
      ' so they land on the Drive screen right after.\n',
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  try {
    if (DELETE_MODE) await runDelete();
    else await runProvision();
  } catch (err) {
    fail(`Failed: ${err?.message ?? String(err)}`);
  }
})();

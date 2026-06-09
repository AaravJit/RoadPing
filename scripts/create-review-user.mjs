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
 * USAGE:
 *   SUPABASE_URL='https://<ref>.supabase.co' \
 *   SUPABASE_SERVICE_ROLE_KEY='<service_role secret>' \
 *   REVIEW_PASSWORD='<password at least 24 chars>' \
 *   node scripts/create-review-user.mjs
 *
 * DELETE:
 *   SUPABASE_URL='https://<ref>.supabase.co' \
 *   SUPABASE_SERVICE_ROLE_KEY='<service_role secret>' \
 *   node scripts/create-review-user.mjs --delete
 */

import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

// ─── Fixed review-account values ──────────────────────────────────────────────
const EMAIL = 'appreview@roadping.app';
const DISPLAY_NAME = 'Apple Review';
const HANDLE = 'applereview';

const VEHICLE = {
  label: '2024 Honda Civic',
  vehicle_type: 'car',
  body_type: 'sedan',
  make: 'Honda',
  model: 'Civic',
  color: 'Black',
  year: 2024,
  is_active: true,
};

// ─── Demo peer + room (App Review report/block demonstration) ──────────────────
// Apple requires a screen recording of the report and block flows. Nearby live
// users can't be guaranteed during review, so we seed a private demo room with a
// second member the reviewer can open and report/block. This is reviewer-only
// demo data — it does not fake public/production nearby behavior.
const DEMO_PEER = {
  email: 'demo-rider@roadping.app',
  display_name: 'Demo Rider',
  handle: 'demorider',
  vehicle: {
    label: '2022 Yamaha MT-07',
    vehicle_type: 'motorcycle',
    body_type: 'motorcycle',
    make: 'Yamaha',
    model: 'MT-07',
    color: 'Blue',
    year: 2022,
    is_active: true,
  },
};

const DEMO_ROOM = {
  name: 'RoadPing Demo Room',
  description: 'Demo room for App Review — report & block a participant here.',
  is_private: true,
  invite_code: 'review-demo',
};

// ─── Env ──────────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.PROJECT_URL;
const SERVICE_ROLE =
process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;
const REVIEW_PASSWORD = process.env.REVIEW_PASSWORD;
const DELETE_MODE = process.argv.includes('--delete');

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

if (!SUPABASE_URL) fail('Missing SUPABASE_URL or PROJECT_URL.');
if (!SERVICE_ROLE) fail('Missing SUPABASE_SERVICE_ROLE_KEY or SERVICE_ROLE_KEY.');
if (!DELETE_MODE && (!REVIEW_PASSWORD || REVIEW_PASSWORD.length < 24)) {
  fail('Set REVIEW_PASSWORD to a password with at least 24 characters.');
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  realtime: {
    transport: ws,
  },
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function findUserByEmail(email) {
  const target = email.toLowerCase();

  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });

    if (error) throw error;

    const hit = data.users.find(
      (user) => (user.email ?? '').toLowerCase() === target,
    );

    if (hit) return hit;
    if (data.users.length < 200) break;
  }

  return null;
}

async function resolveHandle(ownId) {
  const candidates = [HANDLE, `${HANDLE}_ios`, `${HANDLE}_app`];

  for (const candidate of candidates) {
    const { data, error } = await admin
    .from('profiles')
    .select('id')
    .eq('handle', candidate)
    .maybeSingle();

    if (error && error.code !== 'PGRST116') throw error;
    if (!data || data.id === ownId) return candidate;
  }

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

  // Also remove the demo peer (the demo room is owned by the review user and
  // cascade-deletes with it via rooms.owner_id ON DELETE CASCADE).
  const peer = await findUserByEmail(DEMO_PEER.email);
  if (peer) {
    const { error: peerErr } = await admin.auth.admin.deleteUser(peer.id);
    if (peerErr) throw peerErr;
    console.log(`✔ Deleted demo peer ${DEMO_PEER.email} (${peer.id}).`);
  }

  console.log(
    `\n✔ Deleted ${EMAIL} (${user.id}).\n` +
    '  profiles + vehicles + owned demo room rows should be removed automatically if cascade is configured.\n',
  );
}

// ─── Provision mode ───────────────────────────────────────────────────────────
async function runProvision() {
  const created = [];
  const updated = [];

  let user = await findUserByEmail(EMAIL);

  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: EMAIL,
      password: REVIEW_PASSWORD,
      email_confirm: true,
      user_metadata: {
        display_name: DISPLAY_NAME,
      },
    });

    if (error) throw error;

    user = data.user;
    created.push(`auth.users (${user.id})`);
  } else {
    const { error } = await admin.auth.admin.updateUserById(user.id, {
      password: REVIEW_PASSWORD,
      email_confirm: true,
      user_metadata: {
        display_name: DISPLAY_NAME,
      },
    });

    if (error) throw error;

    updated.push(`auth.users (${user.id}) — password reset, email confirmed`);
  }

  const userId = user.id;

  const handle = await resolveHandle(userId);

  const { data: beforeProfile, error: beforeProfileError } = await admin
  .from('profiles')
  .select('id, handle')
  .eq('id', userId)
  .maybeSingle();

  if (beforeProfileError && beforeProfileError.code !== 'PGRST116') {
    throw beforeProfileError;
  }

  const { error: profileError } = await admin.from('profiles').upsert(
    {
      id: userId,
      display_name: DISPLAY_NAME,
      handle,
    },
    {
      onConflict: 'id',
    },
  );

  if (profileError) throw profileError;

  if (beforeProfile) {
    updated.push(
      `public.profiles (handle="${handle}", display_name="${DISPLAY_NAME}")`,
    );
  } else {
    created.push(
      `public.profiles (handle="${handle}", display_name="${DISPLAY_NAME}")`,
    );
  }

  const { data: vehicles, error: vehicleSelectError } = await admin
  .from('vehicles')
  .select('id')
  .eq('user_id', userId);

  if (vehicleSelectError) throw vehicleSelectError;

  if (!vehicles || vehicles.length === 0) {
    const { error: vehicleInsertError } = await admin.from('vehicles').insert({
      user_id: userId,
      ...VEHICLE,
    });

    if (vehicleInsertError) throw vehicleInsertError;

    created.push(`public.vehicles ("${VEHICLE.label}", ${VEHICLE.body_type})`);
  } else {
    updated.push(
      `public.vehicles — left existing ${vehicles.length} row(s) untouched`,
    );
  }

  console.log('\n──────────────────────────────────────────────');
  console.log(' RoadPing — App Store Review account ready');
  console.log('──────────────────────────────────────────────');
  console.log(` Email:    ${EMAIL}`);
  console.log(` Password: ${REVIEW_PASSWORD}`);
  console.log(` User ID:  ${userId}`);
  console.log(' Admin:    NO');

  if (created.length > 0) {
    console.log('\n Created:');
    for (const row of created) console.log(`   + ${row}`);
  }

  if (updated.length > 0) {
    console.log('\n Updated / verified:');
    for (const row of updated) console.log(`   ~ ${row}`);
  }

  // Seed the demo room + peer member so the reviewer can demonstrate
  // report/block on a participant row. Non-fatal: a failure here must not block
  // the (already provisioned) review account.
  try {
    await provisionDemoPeerAndRoom(userId, created, updated);
  } catch (demoError) {
    console.warn(
      `\n⚠ Demo room/peer seeding skipped: ${demoError?.message ?? String(demoError)}`,
    );
  }

  console.log(
    '\n Note: first-run education is stored on-device, so Apple may tap through\n' +
    ' the intro cards once. Profile + vehicle are server-side ready.\n' +
    ' Report/block can be demonstrated in the seeded "RoadPing Demo Room".\n',
  );
}

// ─── Demo peer + room provisioning ──────────────────────────────────────────────
function randomPassword() {
  // 32+ chars, never used interactively (demo peer never signs in).
  return (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '');
}

async function provisionDemoPeerAndRoom(reviewUserId, created, updated) {
  // 1. Demo peer auth user (created once; password rotated each run).
  let peer = await findUserByEmail(DEMO_PEER.email);
  if (!peer) {
    const { data, error } = await admin.auth.admin.createUser({
      email: DEMO_PEER.email,
      password: randomPassword(),
      email_confirm: true,
      user_metadata: { display_name: DEMO_PEER.display_name },
    });
    if (error) throw error;
    peer = data.user;
    created.push(`auth.users demo peer (${peer.id})`);
  }
  const peerId = peer.id;

  // 2. Demo peer profile + vehicle.
  const { error: peerProfileError } = await admin.from('profiles').upsert(
    { id: peerId, display_name: DEMO_PEER.display_name, handle: DEMO_PEER.handle },
    { onConflict: 'id' },
  );
  if (peerProfileError) throw peerProfileError;

  const { data: peerVehicles, error: peerVehErr } = await admin
    .from('vehicles')
    .select('id')
    .eq('user_id', peerId);
  if (peerVehErr) throw peerVehErr;
  if (!peerVehicles || peerVehicles.length === 0) {
    const { error: peerVehInsErr } = await admin
      .from('vehicles')
      .insert({ user_id: peerId, ...DEMO_PEER.vehicle });
    if (peerVehInsErr) throw peerVehInsErr;
  }

  // 3. Demo room owned by the review user (invite_code is unique).
  let { data: room, error: roomSelErr } = await admin
    .from('rooms')
    .select('id')
    .eq('invite_code', DEMO_ROOM.invite_code)
    .maybeSingle();
  if (roomSelErr && roomSelErr.code !== 'PGRST116') throw roomSelErr;

  if (!room) {
    const { data: newRoom, error: roomInsErr } = await admin
      .from('rooms')
      .insert({ owner_id: reviewUserId, ...DEMO_ROOM })
      .select('id')
      .single();
    if (roomInsErr) throw roomInsErr;
    room = newRoom;
    created.push(`public.rooms ("${DEMO_ROOM.name}")`);
  } else {
    updated.push(`public.rooms ("${DEMO_ROOM.name}") — already present`);
  }

  // 4. Ensure both the review user and the demo peer are members.
  //    (The owner is normally auto-added by the handle_new_room trigger;
  //     upsert keeps this idempotent and trigger-independent.)
  const { error: membersErr } = await admin.from('room_members').upsert(
    [
      { room_id: room.id, user_id: reviewUserId, is_moderator: true },
      { room_id: room.id, user_id: peerId, is_moderator: false },
    ],
    { onConflict: 'room_id,user_id', ignoreDuplicates: true },
  );
  if (membersErr) throw membersErr;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
try {
  if (DELETE_MODE) {
    await runDelete();
  } else {
    await runProvision();
  }
} catch (error) {
  fail(`Failed: ${error?.message ?? String(error)}`);
}

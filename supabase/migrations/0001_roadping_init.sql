-- ============================================================================
-- RoadPing — initial schema
-- ----------------------------------------------------------------------------
-- Opt-in live driver map with live proximity voice.
--   * Users are HIDDEN by default. They appear only while a live_session is active.
--   * location_presence holds ONLY the current live fix — never history.
--   * Voice is live-only: there are deliberately NO audio / clip / recording tables.
--   * There is NO message / chat / history storage anywhere in this schema.
--
-- Privacy model (see policies below):
--   * No client can ever SELECT another user's coordinates, live state, or zones.
--     location_presence has NO select policy — reads happen exclusively inside
--     SECURITY DEFINER RPCs (get_nearby_drivers, get_driver_card) added later.
--   * private_zones are owner-only and never serialized to anyone else.
--   * blocks are silent and mutual; the blocked user has no read access to them.
-- ============================================================================

-- ── Extensions ──────────────────────────────────────────────────────────────
create extension if not exists postgis  with schema extensions;  -- geography + GIST
create extension if not exists pgcrypto with schema extensions;  -- gen_random_bytes


-- ── Shared trigger helpers ───────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Auto-provision a profile row when a new auth user is created.
-- SECURITY DEFINER so it can write past RLS during the signup transaction.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, handle)
  values (new.id, 'driver_' || left(replace(new.id::text, '-', ''), 10))
  on conflict (id) do nothing;
  return new;
end;
$$;


-- ============================================================================
-- profiles  (1:1 with auth.users)
-- ============================================================================
create table public.profiles (
  id                   uuid        primary key references auth.users(id) on delete cascade,
  handle               text        not null,
  display_name         text,
  avatar_url           text,
  default_range_m      integer     not null default 500
                                    check (default_range_m between 100 and 5000),
  dnd                  boolean     not null default false,   -- mute incoming live voice
  is_banned            boolean     not null default false,   -- hard block on going live
  is_shadow_suppressed boolean     not null default false,   -- silently dropped from discovery
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint profiles_handle_format check (handle ~ '^[a-z0-9_]{3,24}$')
);

-- Case-insensitive unique handle.
create unique index profiles_handle_lower_key on public.profiles (lower(handle));

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Provision profile on signup.
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ============================================================================
-- vehicles  (belong to a user)
-- ============================================================================
create table public.vehicles (
  id          uuid        primary key default gen_random_uuid(),
  owner_id    uuid        not null references auth.users(id) on delete cascade,
  make        text        not null,
  model       text        not null,
  year        integer     check (year between 1900 and (extract(year from now())::int + 2)),
  color       text,                                           -- display color name / hex
  nickname    text,
  body_type   text        not null default 'sedan'
                          check (body_type in (
                            'sedan','coupe','hatchback','wagon','suv','pickup',
                            'van','crossover','sportsCar','supercar','motorcycle')),
  is_primary  boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index vehicles_owner_id_idx on public.vehicles (owner_id);
-- At most one primary vehicle per owner.
create unique index vehicles_one_primary_per_owner
  on public.vehicles (owner_id) where (is_primary);

create trigger vehicles_set_updated_at
  before update on public.vehicles
  for each row execute function public.set_updated_at();


-- ============================================================================
-- private_zones  (belong to a user; never visible to anyone else)
-- ============================================================================
create table public.private_zones (
  id          uuid                      primary key default gen_random_uuid(),
  user_id     uuid                      not null references auth.users(id) on delete cascade,
  name        text                      not null,
  center      geography(Point, 4326)    not null,
  radius_m    integer                   not null default 300
                                        check (radius_m between 50 and 5000),
  kind        text                      not null default 'custom'
                                        check (kind in ('home','work','custom')),
  created_at  timestamptz               not null default now(),
  updated_at  timestamptz               not null default now()
);

create index private_zones_user_id_idx on public.private_zones (user_id);
-- Used server-side to test "is the user inside one of their own zones?"
create index private_zones_center_gix on public.private_zones using gist (center);

create trigger private_zones_set_updated_at
  before update on public.private_zones
  for each row execute function public.set_updated_at();


-- ============================================================================
-- live_sessions  (belong to a user; expire via heartbeat TTL)
--   active  <=>  ended_at IS NULL AND expires_at > now()
-- ============================================================================
create table public.live_sessions (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references auth.users(id) on delete cascade,
  vehicle_id        uuid        references public.vehicles(id) on delete set null,
  range_m           integer     not null default 500
                                check (range_m between 100 and 5000),
  started_at        timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now(),
  expires_at        timestamptz not null default (now() + interval '20 seconds'),
  ended_at          timestamptz,
  ended_reason      text        check (ended_reason in ('user','expired','entered_zone','banned'))
);

create index live_sessions_user_id_idx on public.live_sessions (user_id);
-- One active session per user.
create unique index live_sessions_one_active_per_user
  on public.live_sessions (user_id) where (ended_at is null);
-- Fast scan for the expiry sweep.
create index live_sessions_expiry_idx
  on public.live_sessions (expires_at) where (ended_at is null);


-- ============================================================================
-- location_presence  (CURRENT live fix only — no history, one row per user)
--   * SELECT is denied to everyone; reads go through SECURITY DEFINER RPCs.
--   * Row exists only while the user's session is live; deleted on stop/expiry.
-- ============================================================================
create table public.location_presence (
  user_id     uuid                    primary key references auth.users(id) on delete cascade,
  session_id  uuid                    not null references public.live_sessions(id) on delete cascade,
  geog        geography(Point, 4326)  not null,
  heading     double precision,                    -- degrees, 0..360
  speed_mps   double precision,                    -- for safety / driving-mode logic
  accuracy_m  double precision,
  updated_at  timestamptz             not null default now()
);

-- Primary index for nearby queries: ST_DWithin(geog, $point, range_m).
create index location_presence_geog_gix on public.location_presence using gist (geog);
-- TTL / staleness sweep.
create index location_presence_updated_at_idx on public.location_presence (updated_at);

create trigger location_presence_set_updated_at
  before update on public.location_presence
  for each row execute function public.set_updated_at();


-- ============================================================================
-- blocks  (silent, enforced as mutual invisibility)
-- ============================================================================
create table public.blocks (
  blocker_id  uuid        not null references auth.users(id) on delete cascade,
  blocked_id  uuid        not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_no_self check (blocker_id <> blocked_id)
);

-- Reverse lookup so "did anyone block me?" is cheap inside visibility RPCs.
create index blocks_blocked_id_idx on public.blocks (blocked_id);


-- ============================================================================
-- reports  (moderation queue)
-- ============================================================================
create table public.reports (
  id           uuid        primary key default gen_random_uuid(),
  reporter_id  uuid        not null references auth.users(id) on delete cascade,
  reported_id  uuid        not null references auth.users(id) on delete cascade,
  reason       text        not null,
  context      text        check (context in ('map','room','voice','profile')),
  session_id   uuid        references public.live_sessions(id) on delete set null,
  status       text        not null default 'open'
                          check (status in ('open','reviewing','actioned','dismissed')),
  created_at   timestamptz not null default now(),
  constraint reports_no_self check (reporter_id <> reported_id)
);

create index reports_reported_id_idx on public.reports (reported_id);
create index reports_status_idx      on public.reports (status);


-- ============================================================================
-- rooms  (drive rooms / convoys)
-- ============================================================================
create table public.rooms (
  id           uuid        primary key default gen_random_uuid(),
  owner_id     uuid        not null references auth.users(id) on delete cascade,
  name         text        not null,
  description  text,
  is_private   boolean     not null default true,
  invite_code  text        not null unique default encode(gen_random_bytes(6), 'hex'),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index rooms_owner_id_idx on public.rooms (owner_id);

create trigger rooms_set_updated_at
  before update on public.rooms
  for each row execute function public.set_updated_at();


-- ============================================================================
-- room_members  (N:M users <-> rooms)
-- ============================================================================
create table public.room_members (
  room_id    uuid        not null references public.rooms(id) on delete cascade,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  role       text        not null default 'member' check (role in ('owner','member')),
  is_active  boolean     not null default true,
  joined_at  timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index room_members_user_id_idx on public.room_members (user_id);

-- Auto-enroll the creator as the room owner.
create or replace function public.handle_new_room()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.room_members (room_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (room_id, user_id) do nothing;
  return new;
end;
$$;

create trigger on_room_created
  after insert on public.rooms
  for each row execute function public.handle_new_room();


-- ============================================================================
-- SECURITY DEFINER helpers
--   Used inside RLS policies (and future RPCs) to dodge policy recursion and
--   to centralize the visibility predicates.
-- ============================================================================
create or replace function public.is_blocked(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b)
       or (blocker_id = b and blocked_id = a)
  );
$$;

create or replace function public.is_room_member(p_room uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.room_members
    where room_id = p_room and user_id = p_user and is_active
  );
$$;

create or replace function public.is_room_owner(p_room uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.rooms where id = p_room and owner_id = p_user
  );
$$;

-- Expiry sweep — schedule with pg_cron (e.g. every 15s):
--   select cron.schedule('roadping-expire', '15 seconds', 'select public.expire_stale_sessions()');
create or replace function public.expire_stale_sessions()
returns void
language sql
security definer
set search_path = public
as $$
  with expired as (
    update public.live_sessions
       set ended_at = now(), ended_reason = 'expired'
     where ended_at is null and expires_at < now()
    returning id
  )
  delete from public.location_presence p
   where not exists (
     select 1 from public.live_sessions s
     where s.id = p.session_id and s.ended_at is null
   );
$$;


-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.profiles          enable row level security;
alter table public.vehicles          enable row level security;
alter table public.private_zones     enable row level security;
alter table public.live_sessions     enable row level security;
alter table public.location_presence enable row level security;
alter table public.blocks            enable row level security;
alter table public.reports           enable row level security;
alter table public.rooms             enable row level security;
alter table public.room_members      enable row level security;

-- ── profiles ──────────────────────────────────────────────────────────────
-- Own row only. Other users' public card fields are exposed exclusively through
-- SECURITY DEFINER RPCs that enforce visibility (live + in range + not blocked).
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ── vehicles ────────────────────────────────────────────────────────────────
create policy vehicles_select_own on public.vehicles
  for select to authenticated using (owner_id = auth.uid());
create policy vehicles_insert_own on public.vehicles
  for insert to authenticated with check (owner_id = auth.uid());
create policy vehicles_update_own on public.vehicles
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy vehicles_delete_own on public.vehicles
  for delete to authenticated using (owner_id = auth.uid());

-- ── private_zones ─────────────────────────────────────────────────────────
-- Owner-only for every operation. Never returned to anyone else, ever.
create policy private_zones_select_own on public.private_zones
  for select to authenticated using (user_id = auth.uid());
create policy private_zones_insert_own on public.private_zones
  for insert to authenticated with check (user_id = auth.uid());
create policy private_zones_update_own on public.private_zones
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy private_zones_delete_own on public.private_zones
  for delete to authenticated using (user_id = auth.uid());

-- ── live_sessions ─────────────────────────────────────────────────────────
-- Own only. Other users' live state surfaces only via visibility RPCs.
create policy live_sessions_select_own on public.live_sessions
  for select to authenticated using (user_id = auth.uid());
create policy live_sessions_insert_own on public.live_sessions
  for insert to authenticated with check (user_id = auth.uid());
create policy live_sessions_update_own on public.live_sessions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy live_sessions_delete_own on public.live_sessions
  for delete to authenticated using (user_id = auth.uid());

-- ── location_presence ───────────────────────────────────────────────────────
-- DELIBERATELY NO SELECT POLICY -> nobody can read coordinates directly.
-- Writes are own-row only, and only while the referenced session is live.
create policy location_presence_insert_own on public.location_presence
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.live_sessions s
      where s.id = session_id and s.user_id = auth.uid() and s.ended_at is null
    )
  );
create policy location_presence_update_own on public.location_presence
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy location_presence_delete_own on public.location_presence
  for delete to authenticated using (user_id = auth.uid());

-- ── blocks ──────────────────────────────────────────────────────────────────
-- Only the blocker can see/manage the row; the blocked user gets no read access.
create policy blocks_select_own on public.blocks
  for select to authenticated using (blocker_id = auth.uid());
create policy blocks_insert_own on public.blocks
  for insert to authenticated
  with check (blocker_id = auth.uid() and blocked_id <> auth.uid());
create policy blocks_delete_own on public.blocks
  for delete to authenticated using (blocker_id = auth.uid());

-- ── reports ─────────────────────────────────────────────────────────────────
-- Reporters can file and read their own reports; resolution is service-role only.
create policy reports_select_own on public.reports
  for select to authenticated using (reporter_id = auth.uid());
create policy reports_insert_own on public.reports
  for insert to authenticated
  with check (reporter_id = auth.uid() and reported_id <> auth.uid());

-- ── rooms ───────────────────────────────────────────────────────────────────
create policy rooms_select_member on public.rooms
  for select to authenticated
  using (owner_id = auth.uid() or public.is_room_member(id, auth.uid()));
create policy rooms_insert_own on public.rooms
  for insert to authenticated with check (owner_id = auth.uid());
create policy rooms_update_owner on public.rooms
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy rooms_delete_owner on public.rooms
  for delete to authenticated using (owner_id = auth.uid());

-- ── room_members ─────────────────────────────────────────────────────────────
create policy room_members_select_member on public.room_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_room_member(room_id, auth.uid()));
-- Self-join, or the owner adding someone.
create policy room_members_insert on public.room_members
  for insert to authenticated
  with check (user_id = auth.uid() or public.is_room_owner(room_id, auth.uid()));
create policy room_members_update on public.room_members
  for update to authenticated
  using (user_id = auth.uid() or public.is_room_owner(room_id, auth.uid()))
  with check (user_id = auth.uid() or public.is_room_owner(room_id, auth.uid()));
create policy room_members_delete on public.room_members
  for delete to authenticated
  using (user_id = auth.uid() or public.is_room_owner(room_id, auth.uid()));


-- ============================================================================
-- Grants
--   RLS is the gate; anon gets no policies and therefore no access.
-- ============================================================================
grant usage on schema public to authenticated;

grant select, insert, update, delete on
  public.profiles, public.vehicles, public.private_zones,
  public.live_sessions, public.location_presence, public.blocks,
  public.reports, public.rooms, public.room_members
to authenticated;

grant execute on function
  public.is_blocked(uuid, uuid),
  public.is_room_member(uuid, uuid),
  public.is_room_owner(uuid, uuid)
to authenticated;

-- Cleanup is intended for the scheduler / service role, not end users.
revoke execute on function public.expire_stale_sessions() from authenticated;

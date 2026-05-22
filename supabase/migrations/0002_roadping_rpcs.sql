-- ============================================================================
-- RoadPing — RPCs backing the Edge Functions
-- ----------------------------------------------------------------------------
-- The Edge Functions authenticate + validate, then call these. The geo math
-- (ST_DWithin / ST_Distance) and the privileged reads (location_presence has
-- NO select policy) must live here, in SECURITY DEFINER functions that derive
-- identity from auth.uid() — so they are safe to expose to `authenticated`
-- and are called with the caller's JWT (never the service role).
--
-- Still NO voice, NO clips, NO history anywhere.
-- ============================================================================

-- ── Is the caller currently inside one of THEIR OWN private zones? ──────────
-- Powers both the live "Safe to Start / Too close" preview and the hard gate
-- inside start_live_session / heartbeat.
create or replace function public.inside_private_zone(
  p_lat double precision,
  p_lng double precision
)
returns table (
  blocked     boolean,
  zone_id     uuid,
  zone_name   text,
  distance_m  double precision
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_uid   uuid := auth.uid();
  v_point geography;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  v_point := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;

  return query
  select true, z.id, z.name, ST_Distance(z.center, v_point)
  from private_zones z
  where z.user_id = v_uid
    and ST_DWithin(z.center, v_point, z.radius_m)
  order by ST_Distance(z.center, v_point) asc
  limit 1;

  if not found then
    return query select false, null::uuid, null::text, null::double precision;
  end if;
end;
$$;


-- ── Go live ─────────────────────────────────────────────────────────────────
-- Atomic: ban check -> private-zone gate -> end any prior active session ->
-- create session -> upsert presence. Raises TOO_CLOSE_TO_ZONE / USER_BANNED.
create or replace function public.start_live_session(
  p_lat        double precision,
  p_lng        double precision,
  p_range_m    integer          default 500,
  p_vehicle_id uuid             default null,
  p_heading    double precision default null,
  p_speed      double precision default null,
  p_accuracy   double precision default null
)
returns public.live_sessions
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid     uuid := auth.uid();
  v_point   geography;
  v_session public.live_sessions;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  if exists (select 1 from profiles where id = v_uid and is_banned) then
    raise exception 'USER_BANNED';
  end if;

  v_point := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;

  -- Hard private-zone gate (server is the authority; the client preview is UX only).
  if exists (
    select 1 from private_zones z
    where z.user_id = v_uid and ST_DWithin(z.center, v_point, z.radius_m)
  ) then
    raise exception 'TOO_CLOSE_TO_ZONE';
  end if;

  if p_range_m is null or p_range_m not between 100 and 5000 then
    p_range_m := 500;
  end if;

  -- Enforce single active session per user.
  update live_sessions
     set ended_at = now(), ended_reason = 'user'
   where user_id = v_uid and ended_at is null;

  insert into live_sessions (user_id, vehicle_id, range_m, expires_at)
  values (v_uid, p_vehicle_id, p_range_m, now() + interval '20 seconds')
  returning * into v_session;

  insert into location_presence (user_id, session_id, geog, heading, speed_mps, accuracy_m, updated_at)
  values (v_uid, v_session.id, v_point, p_heading, p_speed, p_accuracy, now())
  on conflict (user_id) do update
    set session_id = excluded.session_id,
        geog       = excluded.geog,
        heading    = excluded.heading,
        speed_mps  = excluded.speed_mps,
        accuracy_m = excluded.accuracy_m,
        updated_at = now();

  return v_session;
end;
$$;


-- ── Stop ──────────────────────────────────────────────────────────────────
-- Ends the active session and DELETES the presence row (hidden immediately).
create or replace function public.stop_live_session()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  update live_sessions
     set ended_at = now(), ended_reason = 'user'
   where user_id = v_uid and ended_at is null;

  delete from location_presence where user_id = v_uid;

  return jsonb_build_object('live', false);
end;
$$;


-- ── Heartbeat (update live location) ─────────────────────────────────────────
-- Refreshes the single presence row + extends the TTL. Re-runs the zone gate:
-- if the user drove into a private zone, the session is force-ended and hidden.
create or replace function public.heartbeat(
  p_lat      double precision,
  p_lng      double precision,
  p_heading  double precision default null,
  p_speed    double precision default null,
  p_accuracy double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid     uuid := auth.uid();
  v_session public.live_sessions;
  v_point   geography;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select * into v_session
    from live_sessions
   where user_id = v_uid and ended_at is null
   order by started_at desc
   limit 1;

  if not found then raise exception 'NO_ACTIVE_SESSION'; end if;

  v_point := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;

  if exists (
    select 1 from private_zones z
    where z.user_id = v_uid and ST_DWithin(z.center, v_point, z.radius_m)
  ) then
    update live_sessions set ended_at = now(), ended_reason = 'entered_zone'
     where id = v_session.id;
    delete from location_presence where user_id = v_uid;
    return jsonb_build_object('live', false, 'reason', 'entered_zone');
  end if;

  update location_presence
     set geog = v_point, heading = p_heading, speed_mps = p_speed,
         accuracy_m = p_accuracy, updated_at = now()
   where user_id = v_uid;

  update live_sessions
     set last_heartbeat_at = now(), expires_at = now() + interval '20 seconds'
   where id = v_session.id
   returning * into v_session;

  return jsonb_build_object(
    'live', true,
    'session_id', v_session.id,
    'expires_at', v_session.expires_at
  );
end;
$$;


-- ── Nearby drivers ───────────────────────────────────────────────────────────
-- The ONLY path that reads other users' presence. Enforces every visibility
-- rule server-side: live + fresh (not stale) + within mutual range + not
-- blocked (either direction) + not banned/shadow-suppressed + not self.
-- Coordinates are coarsened before they leave the database.
create or replace function public.get_nearby_drivers(
  p_lat double precision,
  p_lng double precision
)
returns table (
  user_id     uuid,
  handle      text,
  display_name text,
  distance_m  double precision,
  lat         double precision,   -- coarsened (~11m)
  lng         double precision,   -- coarsened (~11m)
  heading     double precision,
  speed_mps   double precision,
  vehicle     jsonb,
  is_talking  boolean             -- always false here; talking state is live-only (Realtime), never stored
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_viewer uuid := auth.uid();
  v_range  integer;
  v_point  geography;
begin
  if v_viewer is null then raise exception 'NOT_AUTHENTICATED'; end if;

  -- Use the viewer's active-session range if live, else their default, else 500.
  select coalesce(
    (select s.range_m from live_sessions s
       where s.user_id = v_viewer and s.ended_at is null
       order by s.started_at desc limit 1),
    (select default_range_m from profiles where id = v_viewer),
    500
  ) into v_range;

  v_point := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;

  return query
  select
    lp.user_id,
    pr.handle,
    pr.display_name,
    ST_Distance(lp.geog, v_point) as distance_m,
    round(ST_Y(lp.geog::geometry)::numeric, 4)::double precision as lat,
    round(ST_X(lp.geog::geometry)::numeric, 4)::double precision as lng,
    lp.heading,
    lp.speed_mps,
    coalesce(v.card, '{}'::jsonb) as vehicle,
    false as is_talking
  from location_presence lp
  join live_sessions ls on ls.id = lp.session_id
  join profiles      pr on pr.id = lp.user_id
  left join lateral (
    select jsonb_build_object(
      'make', vh.make, 'model', vh.model, 'year', vh.year,
      'color', vh.color, 'nickname', vh.nickname, 'body_type', vh.body_type
    ) as card
    from vehicles vh where vh.id = ls.vehicle_id
  ) v on true
  where lp.user_id <> v_viewer
    and ls.ended_at is null
    and ls.expires_at > now()                                  -- not stale
    and pr.is_banned = false
    and pr.is_shadow_suppressed = false
    and not public.is_blocked(v_viewer, lp.user_id)            -- blocks (mutual)
    and ST_DWithin(lp.geog, v_point, least(v_range, ls.range_m))
  order by distance_m asc
  limit 200;
end;
$$;


-- ── Grants ───────────────────────────────────────────────────────────────────
-- Called with the caller's JWT so auth.uid() resolves; SECURITY DEFINER does
-- the privileged reads. Never call these with the service role.
grant execute on function
  public.inside_private_zone(double precision, double precision),
  public.start_live_session(double precision, double precision, integer, uuid, double precision, double precision, double precision),
  public.stop_live_session(),
  public.heartbeat(double precision, double precision, double precision, double precision, double precision),
  public.get_nearby_drivers(double precision, double precision)
to authenticated;

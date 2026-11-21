-- Preserve seat IDs 1–8. Seats 9 and 10 extend the window and aisle rows.
alter table public.office_seats
  drop constraint office_seats_seat_index_check,
  add constraint office_seats_seat_index_check check (seat_index between 1 and 10);

create function private.write_office_seats(
  p_seats jsonb,
  p_expected_revision text,
  p_max_seats integer
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
  v_deleted integer := 0;
  v_inserted integer := 0;
begin
  if not public.can_manage_team_data() then
    raise exception using
      errcode = '42501',
      message = 'active leader required',
      detail = 'SQA_ACTIVE_LEADER_REQUIRED';
  end if;

  if p_seats is null or pg_catalog.jsonb_typeof(p_seats) is distinct from 'array' then
    raise exception using
      errcode = '22023',
      message = 'office seats must be a json array',
      detail = 'SQA_OFFICE_SEATS_INVALID';
  end if;

  v_count := pg_catalog.jsonb_array_length(p_seats);
  if v_count > p_max_seats or exists (
    select 1
      from pg_catalog.jsonb_array_elements(p_seats) item
     where pg_catalog.jsonb_typeof(item) is distinct from 'object'
        or pg_catalog.jsonb_typeof(item -> 'seat_index') is distinct from 'number'
        or pg_catalog.jsonb_typeof(item -> 'profile_id') is distinct from 'string'
        or pg_catalog.jsonb_typeof(item -> 'gender') is distinct from 'string'
        or pg_catalog.jsonb_typeof(item -> 'style_seed') is distinct from 'number'
        or (item ->> 'seat_index') !~ (case when p_max_seats = 8 then '^[1-8]$' else '^([1-9]|10)$' end)
        or (item ->> 'style_seed') !~ '^[0-9]{1,10}$'
        or (item ->> 'gender') not in ('male', 'female')
        or (item ->> 'profile_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) then
    raise exception using
      errcode = '22023',
      message = pg_catalog.format('office seats must be up to %s {seat_index, profile_id, gender, style_seed} objects', p_max_seats),
      detail = 'SQA_OFFICE_SEATS_INVALID';
  end if;

  if exists (
    select 1
      from pg_catalog.jsonb_array_elements(p_seats) item
     where (item ->> 'style_seed')::bigint > 2147483647
  ) then
    raise exception using
      errcode = '22023',
      message = 'style seed is out of range',
      detail = 'SQA_OFFICE_SEATS_INVALID';
  end if;

  if (select count(distinct item ->> 'seat_index') from pg_catalog.jsonb_array_elements(p_seats) item) <> v_count
     or (select count(distinct (item ->> 'profile_id')::uuid) from pg_catalog.jsonb_array_elements(p_seats) item) <> v_count then
    raise exception using
      errcode = '22023',
      message = 'each seat and each person can appear only once',
      detail = 'SQA_OFFICE_SEATS_DUPLICATE';
  end if;

  if exists (
    select 1
      from pg_catalog.jsonb_array_elements(p_seats) item
     where not exists (
       select 1
         from public.profiles profile
        where profile.id = (item ->> 'profile_id')::uuid
          and profile.is_active
     )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'only active accounts can be seated',
      detail = 'SQA_OFFICE_SEAT_PROFILE_INACTIVE';
  end if;

  -- One writer at a time, so the compare-and-swap sees the latest committed layout.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('sqa:office-seats'));

  -- Check under the same lock as the revision so a legacy writer cannot race
  -- a v2 writer that has just occupied an extended seat.
  if p_max_seats = 8 and exists (select 1 from public.office_seats where seat_index > 8) then
    raise exception using
      errcode = 'P0001',
      message = 'this office layout includes extended seats; reload the app before editing',
      detail = 'SQA_OFFICE_LAYOUT_CONFLICT';
  end if;

  if p_expected_revision is distinct from private.office_seats_revision() then
    raise exception using
      errcode = 'P0001',
      message = 'office layout changed since it was loaded',
      detail = 'SQA_OFFICE_LAYOUT_CONFLICT';
  end if;

  -- Remove every row that is not kept exactly as-is, then insert the new ones.
  -- Deleting first lets people swap seats without tripping unique(profile_id).
  delete from public.office_seats seat
   where not exists (
     select 1
       from pg_catalog.jsonb_array_elements(p_seats) item
      where (item ->> 'seat_index')::smallint = seat.seat_index
        and (item ->> 'profile_id')::uuid = seat.profile_id
        and item ->> 'gender' = seat.gender
        and (item ->> 'style_seed')::integer = seat.style_seed
   );
  get diagnostics v_deleted = row_count;

  insert into public.office_seats (seat_index, profile_id, gender, style_seed, updated_by)
  select (item ->> 'seat_index')::smallint,
         (item ->> 'profile_id')::uuid,
         item ->> 'gender',
         (item ->> 'style_seed')::integer,
         auth.uid()
    from pg_catalog.jsonb_array_elements(p_seats) item
   where not exists (
     select 1
       from public.office_seats seat
      where seat.seat_index = (item ->> 'seat_index')::smallint
   );
  get diagnostics v_inserted = row_count;

  return v_deleted > 0 or v_inserted > 0;
end;
$$;

revoke all on function private.write_office_seats(jsonb, text, integer) from public, anon, authenticated, service_role;

-- Preserve the old API for clients with the eight-seat editor. Its writer
-- rejects the whole update when either extended seat is occupied.
create or replace function public.replace_office_seats(
  p_seats jsonb,
  p_expected_revision text
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select private.write_office_seats(p_seats, p_expected_revision, 8)
$$;

create function public.replace_office_seats_v2(
  p_seats jsonb,
  p_expected_revision text
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select private.write_office_seats(p_seats, p_expected_revision, 10)
$$;

revoke all on function public.replace_office_seats(jsonb, text) from public, anon, authenticated;
grant execute on function public.replace_office_seats(jsonb, text) to authenticated;
revoke all on function public.replace_office_seats_v2(jsonb, text) from public, anon, authenticated;
grant execute on function public.replace_office_seats_v2(jsonb, text) to authenticated;

comment on table public.office_seats is
  'Home-screen pixel office layout (10 seats). Read via get_office_seats(), write via replace_office_seats_v2().';
comment on function public.replace_office_seats(jsonb, text) is
  'Legacy eight-seat compare-and-swap. Refuses writes when seats 9 or 10 are occupied.';
comment on function public.replace_office_seats_v2(jsonb, text) is
  'Leader-only compare-and-swap of the ten-seat office layout; returns false when nothing changed.';

-- Keep the meeting RPC signature and the partial-leave rules. An unseated
-- organizer can invite all ten seated users, so attendance can reach eleven.
create or replace function public.start_office_meeting(
  p_title text,
  p_participant_ids uuid[],
  p_starts_at timestamptz,
  p_location text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_title text := pg_catalog.btrim(coalesce(p_title, ''));
  v_location text := pg_catalog.btrim(coalesce(p_location, ''));
  v_invitees uuid[];
  v_now timestamptz := pg_catalog.clock_timestamp();
  -- 지금 바로 여는 회의는 연 때와 시작 시각이 똑같다(화면이 ‘예정’으로 잘못 보지 않게).
  v_starts_at timestamptz := coalesce(p_starts_at, v_now);
  v_meeting_id uuid;
begin
  if v_actor_id is null or not public.can_use_app() then
    raise exception using
      errcode = '42501',
      message = 'active app user required',
      detail = 'SQA_APP_ACCESS_REQUIRED';
  end if;

  select profile.name into v_actor_name
    from public.profiles profile
   where profile.id = v_actor_id
     and profile.role in ('leader', 'member');
  if v_actor_name is null then
    raise exception using
      errcode = 'P0001',
      message = 'team leader access is read only',
      detail = 'SQA_TEAM_LEADER_READ_ONLY';
  end if;

  if pg_catalog.char_length(v_title) > 60
     or pg_catalog.char_length(v_location) > 30
     or p_participant_ids is null
     or pg_catalog.array_position(p_participant_ids, null) is not null then
    raise exception using
      errcode = '22023',
      message = 'a meeting needs a title up to 60 characters, a location up to 30 and a list of invitees',
      detail = 'SQA_OFFICE_MEETING_INVALID';
  end if;

  -- Now or later today (a few minutes of clock skew count as now).
  if v_starts_at < v_now - interval '5 minutes'
     or private.sqa_business_date(v_starts_at) <> private.sqa_business_date(v_now) then
    raise exception using
      errcode = '22023',
      message = 'a meeting starts now or later today',
      detail = 'SQA_OFFICE_MEETING_TIME_INVALID';
  end if;
  if v_starts_at < v_now then
    v_starts_at := v_now;
  end if;

  select coalesce(pg_catalog.array_agg(distinct invitee_id), '{}'::uuid[]) into v_invitees
    from pg_catalog.unnest(p_participant_ids) as invitee_id
   where invitee_id <> v_actor_id;
  if pg_catalog.cardinality(v_invitees) < 1 or pg_catalog.cardinality(v_invitees) > 10 then
    raise exception using
      errcode = '22023',
      message = 'invite one to ten people',
      detail = 'SQA_OFFICE_MEETING_INVALID';
  end if;

  -- Only active leaders and members who have a seat in the office can be invited.
  if exists (
    select 1
      from pg_catalog.unnest(v_invitees) as invitee_id
     where not exists (
       select 1
         from public.office_seats seat
         join public.profiles profile on profile.id = seat.profile_id
        where seat.profile_id = invitee_id
          and profile.is_active
          and profile.role in ('leader', 'member')
     )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'only active people seated in the office can be invited',
      detail = 'SQA_OFFICE_MEETING_PARTICIPANT_INVALID';
  end if;

  -- People on vacation or a business trip that day are not invited.
  if exists (
    select 1
      from public.member_leaves leave
     where leave.profile_id = any(v_invitees)
       and private.sqa_business_date(v_starts_at) between leave.starts_on and leave.ends_on
       and (leave.day_period is null or leave.day_period =
            case when extract(hour from v_starts_at at time zone 'Asia/Seoul') < 12 then 'am' else 'pm' end)
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'people on vacation or a business trip cannot be invited',
      detail = 'SQA_OFFICE_MEETING_PARTICIPANT_AWAY';
  end if;

  -- One room: a single writer at a time sees whether it is free.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('sqa:office-meeting'));
  delete from public.office_meetings meeting where meeting.expires_at <= v_now;
  if exists (select 1 from public.office_meetings) then
    raise exception using
      errcode = 'P0001',
      message = 'the meeting room is in use',
      detail = 'SQA_OFFICE_MEETING_BUSY';
  end if;

  insert into public.office_meetings (title, organizer_id, organizer_name, created_at, starts_at, location, expires_at)
  values (v_title, v_actor_id, v_actor_name, v_now, v_starts_at, v_location, v_starts_at + interval '3 hours')
  returning id into v_meeting_id;

  insert into public.office_meeting_participants (meeting_id, user_id, participant_name, acknowledged_at)
  values (v_meeting_id, v_actor_id, v_actor_name, v_now);

  insert into public.office_meeting_participants (meeting_id, user_id, participant_name)
  select v_meeting_id, profile.id, profile.name
    from public.profiles profile
   where profile.id = any(v_invitees);

  return v_meeting_id;
end;
$$;

comment on function public.start_office_meeting(text, uuid[], timestamptz, text) is
  'Opens a meeting for the organizer and up to ten eligible seated invitees.';

notify pgrst, 'reload schema';

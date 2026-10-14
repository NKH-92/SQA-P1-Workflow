-- Existing vacation and trip rows remain full-day periods.
alter table public.member_leaves
  add column vacation_unit text not null default 'full',
  add column day_period text;

alter table public.member_leaves add constraint member_leaves_vacation_unit_check check (
  (vacation_unit = 'full' and day_period is null)
  or (kind = 'vacation' and vacation_unit in ('half', 'quarter')
      and starts_on = ends_on and day_period is not null and day_period in ('am', 'pm'))
);

-- Keep the existing five-argument RPC throughout the expand-only release.
-- The versioned seven-argument RPC requires both fields; old clients continue
-- to use the five-argument wrapper below.
create or replace function public.add_member_leave_v2(
  p_profile_id uuid,
  p_kind text,
  p_starts_on date,
  p_ends_on date,
  p_note text,
  p_vacation_unit text,
  p_day_period text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := private.sqa_business_date();
  v_note text := pg_catalog.btrim(coalesce(p_note, ''));
  v_leave_id uuid;
begin
  perform private.assert_member_presence_writer(p_profile_id);

  if p_kind is null or p_kind not in ('vacation', 'trip')
     or p_starts_on is null or p_ends_on is null
     or p_ends_on < p_starts_on or p_ends_on - p_starts_on > 89
     or p_ends_on < v_today or p_starts_on > v_today + 365
     or pg_catalog.char_length(v_note) > 30 then
    raise exception using errcode = '22023', message = 'invalid leave period', detail = 'SQA_MEMBER_PRESENCE_INVALID';
  end if;

  if p_vacation_unit is null or p_vacation_unit not in ('full', 'half', 'quarter')
     or (p_vacation_unit = 'full' and p_day_period is not null)
     or (p_vacation_unit <> 'full' and (
       p_kind <> 'vacation' or p_starts_on <> p_ends_on
       or p_day_period is null or p_day_period not in ('am', 'pm')
     )) then
    raise exception using errcode = '22023', message = 'partial vacation needs one day and AM or PM', detail = 'SQA_MEMBER_PARTIAL_LEAVE_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('sqa:member-leave:' || p_profile_id::text));
  delete from public.member_leaves leave where leave.ends_on < v_today;

  -- Full-day leave or trips overlap either period. Opposite partial periods
  -- on the same day may coexist; two entries in the same period cannot.
  if exists (
    select 1 from public.member_leaves leave
     where leave.profile_id = p_profile_id
       and leave.starts_on <= p_ends_on and leave.ends_on >= p_starts_on
       and (p_vacation_unit = 'full' or leave.vacation_unit = 'full' or leave.day_period = p_day_period)
  ) then
    raise exception using errcode = 'P0001', message = 'overlapping leave period', detail = 'SQA_MEMBER_LEAVE_OVERLAP';
  end if;

  insert into public.member_leaves (
    profile_id, kind, starts_on, ends_on, note, created_by, vacation_unit, day_period
  ) values (
    p_profile_id, p_kind, p_starts_on, p_ends_on, v_note, auth.uid(), p_vacation_unit, p_day_period
  ) returning id into v_leave_id;
  return v_leave_id;
end;
$$;

revoke all on function public.add_member_leave_v2(uuid, text, date, date, text, text, text) from public, anon, authenticated;
grant execute on function public.add_member_leave_v2(uuid, text, date, date, text, text, text) to authenticated;

comment on function public.add_member_leave_v2(uuid, text, date, date, text, text, text) is
  'Registers a full-day vacation/trip or a one-day half/quarter vacation with AM/PM. Only yourself or the active leader.';

create or replace function public.add_member_leave(
  p_profile_id uuid,
  p_kind text,
  p_starts_on date,
  p_ends_on date,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_member_presence_writer(p_profile_id);
  return public.add_member_leave_v2(p_profile_id, p_kind, p_starts_on, p_ends_on, p_note, 'full', null);
end;
$$;

revoke all on function public.add_member_leave(uuid, text, date, date, text) from public, anon, authenticated;
grant execute on function public.add_member_leave(uuid, text, date, date, text) to authenticated;

-- Return the new vacation fields while preserving the 06:00 expiry rule.
create or replace function public.get_member_presence()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_today date := private.sqa_business_date(v_now);
begin
  if auth.uid() is null or not public.can_use_app() then
    raise exception using
      errcode = '42501',
      message = 'active app user required',
      detail = 'SQA_APP_ACCESS_REQUIRED';
  end if;

  return pg_catalog.jsonb_build_object(
    'statuses', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'profile_id', status.profile_id,
          'name', profile.name,
          'status', status.status,
          'updated_at', status.updated_at
        ) order by profile.name, status.profile_id
      )
      from public.member_statuses status
      join public.profiles profile
        on profile.id = status.profile_id and profile.is_active
     where status.updated_at >= private.member_status_reset_cutoff(v_now)
    ), '[]'::jsonb),
    'leaves', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', leave.id,
          'profile_id', leave.profile_id,
          'name', profile.name,
          'kind', leave.kind,
          'starts_on', leave.starts_on,
          'ends_on', leave.ends_on,
          'note', leave.note,
          'vacation_unit', leave.vacation_unit,
          'day_period', leave.day_period
        ) order by leave.starts_on, profile.name, leave.id
      )
      from public.member_leaves leave
      join public.profiles profile
        on profile.id = leave.profile_id and profile.is_active
     where leave.ends_on >= v_today
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_member_presence() from public, anon, authenticated;
grant execute on function public.get_member_presence() to authenticated;

-- Keep the meeting RPC signature and permissions; respect partial leave periods.
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
  if pg_catalog.cardinality(v_invitees) < 1 or pg_catalog.cardinality(v_invitees) > 8 then
    raise exception using
      errcode = '22023',
      message = 'invite one to eight people',
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

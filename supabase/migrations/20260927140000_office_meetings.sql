-- Instant office meeting (the small meeting room in the home pixel office).
-- Anyone who can use the app, except read-only team leaders, opens one meeting
-- at a time and invites people seated in the office who are not on vacation or
-- a business trip that day. A meeting starts now or later today (Asia/Seoul)
-- and takes place in the office meeting room (empty location) or somewhere
-- else. Invitees confirm with a check; the organizer or the leader ends (or
-- cancels) the meeting, which deletes it (no history is kept). A meeting nobody
-- ends expires three hours after its start time.
--
-- The room and who is in it are visible to the whole part, like the seat layout:
-- active app users may SELECT both tables through RLS so Realtime
-- postgres_changes can push updates to every open office. Rows carry name
-- snapshots because members cannot read other profiles. Every write goes
-- through the RPCs below; team leaders keep the write guard (verify/95).
--
-- Deliberately not part of the private mutation audit: an instant meeting is
-- transient coordination, not business data.

create table public.office_meetings (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true,
  title text not null default '',
  organizer_id uuid not null
    references public.profiles(id) on delete cascade,
  organizer_name text not null,
  created_at timestamptz not null default clock_timestamp(),
  starts_at timestamptz not null,
  location text not null default '',
  expires_at timestamptz not null,
  constraint office_meetings_singleton_key unique (singleton),
  constraint office_meetings_singleton_check check (singleton),
  constraint office_meetings_title_check check (char_length(title) <= 60),
  constraint office_meetings_location_check check (char_length(location) <= 30),
  constraint office_meetings_expiry_check check (expires_at > starts_at)
);

create index office_meetings_organizer_id_idx
  on public.office_meetings(organizer_id);

create table public.office_meeting_participants (
  meeting_id uuid not null
    references public.office_meetings(id) on delete cascade,
  user_id uuid not null
    references public.profiles(id) on delete cascade,
  participant_name text not null,
  acknowledged_at timestamptz,
  constraint office_meeting_participants_pkey primary key (meeting_id, user_id)
);

create index office_meeting_participants_user_id_idx
  on public.office_meeting_participants(user_id);

alter table public.office_meetings enable row level security;
alter table public.office_meeting_participants enable row level security;

revoke all on table public.office_meetings from public, anon, authenticated;
revoke all on table public.office_meeting_participants from public, anon, authenticated;
grant select on table public.office_meetings to authenticated;
grant select on table public.office_meeting_participants to authenticated;
grant all on table public.office_meetings to service_role;
grant all on table public.office_meeting_participants to service_role;

create policy office_meetings_select_app_users
on public.office_meetings
for select
to authenticated
using (public.can_use_app());

create policy office_meeting_participants_select_app_users
on public.office_meeting_participants
for select
to authenticated
using (public.can_use_app());

create trigger reject_team_leader_write
before insert or update or delete on public.office_meetings
for each row execute function private.reject_team_leader_business_write();

create trigger reject_team_leader_write
before insert or update or delete on public.office_meeting_participants
for each row execute function private.reject_team_leader_business_write();

create or replace function public.get_office_meeting()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.can_use_app() then
    raise exception using
      errcode = '42501',
      message = 'active app user required',
      detail = 'SQA_APP_ACCESS_REQUIRED';
  end if;

  return (
    select pg_catalog.jsonb_build_object(
      'id', meeting.id,
      'title', meeting.title,
      'organizer_id', meeting.organizer_id,
      'organizer_name', meeting.organizer_name,
      'created_at', meeting.created_at,
      'starts_at', meeting.starts_at,
      'location', meeting.location,
      'expires_at', meeting.expires_at,
      'participants', coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'user_id', participant.user_id,
            'name', participant.participant_name,
            'acknowledged_at', participant.acknowledged_at
          ) order by participant.participant_name, participant.user_id
        )
        from public.office_meeting_participants participant
        where participant.meeting_id = meeting.id
      ), '[]'::jsonb)
    )
    from public.office_meetings meeting
    where meeting.expires_at > pg_catalog.clock_timestamp()
    limit 1
  );
end;
$$;

revoke all on function public.get_office_meeting() from public, anon, authenticated;
grant execute on function public.get_office_meeting() to authenticated;

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

revoke all on function public.start_office_meeting(text, uuid[], timestamptz, text) from public, anon, authenticated;
grant execute on function public.start_office_meeting(text, uuid[], timestamptz, text) to authenticated;

create or replace function public.acknowledge_office_meeting(p_meeting_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_acknowledged_at timestamptz;
begin
  if v_actor_id is null or not public.can_use_app() then
    raise exception using
      errcode = '42501',
      message = 'active app user required',
      detail = 'SQA_APP_ACCESS_REQUIRED';
  end if;

  update public.office_meeting_participants participant
     set acknowledged_at = coalesce(participant.acknowledged_at, pg_catalog.clock_timestamp())
   where participant.meeting_id = p_meeting_id
     and participant.user_id = v_actor_id
     and exists (
       select 1
         from public.office_meetings meeting
        where meeting.id = p_meeting_id
          and meeting.expires_at > pg_catalog.clock_timestamp()
     )
  returning participant.acknowledged_at into v_acknowledged_at;

  if v_acknowledged_at is null then
    raise exception using
      errcode = 'P0001',
      message = 'no open meeting invites you',
      detail = 'SQA_OFFICE_MEETING_NOT_FOUND';
  end if;
  return v_acknowledged_at;
end;
$$;

revoke all on function public.acknowledge_office_meeting(uuid) from public, anon, authenticated;
grant execute on function public.acknowledge_office_meeting(uuid) to authenticated;

create or replace function public.end_office_meeting(p_meeting_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_organizer_id uuid;
begin
  if v_actor_id is null or not public.can_use_app() then
    raise exception using
      errcode = '42501',
      message = 'active app user required',
      detail = 'SQA_APP_ACCESS_REQUIRED';
  end if;

  select meeting.organizer_id into v_organizer_id
    from public.office_meetings meeting
   where meeting.id = p_meeting_id;
  -- Someone else already ended it.
  if v_organizer_id is null then
    return false;
  end if;

  if v_organizer_id <> v_actor_id and not public.can_manage_team_data() then
    raise exception using
      errcode = '42501',
      message = 'only the organizer or the leader can end the meeting',
      detail = 'SQA_OFFICE_MEETING_FORBIDDEN';
  end if;

  delete from public.office_meetings meeting where meeting.id = p_meeting_id;
  return true;
end;
$$;

revoke all on function public.end_office_meeting(uuid) from public, anon, authenticated;
grant execute on function public.end_office_meeting(uuid) to authenticated;

-- Push room changes to every open office. Skips when already published and on
-- plain Postgres environments without the supabase_realtime publication.
do $$
declare
  target text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach target in array array['office_meetings', 'office_meeting_participants'] loop
    if not exists (
      select 1
        from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = target
    ) then
      execute format('alter publication supabase_realtime add table public.%I', target);
    end if;
  end loop;
end
$$;

comment on table public.office_meetings is
  'At most one open instant meeting (now or later today, in the office room or elsewhere). Deleted when it ends; expires 3 hours after its start.';
comment on table public.office_meeting_participants is
  'Invitees of the open office meeting and when each confirmed. The organizer is confirmed on start.';
comment on function public.start_office_meeting(text, uuid[], timestamptz, text) is
  'Opens the single office meeting (now or later today) for active seated people who are not on leave. Team leaders are read-only.';
comment on function public.acknowledge_office_meeting(uuid) is
  'Marks the caller as confirmed in the open office meeting.';
comment on function public.end_office_meeting(uuid) is
  'Ends or cancels (deletes) the office meeting. Only the organizer or the leader can; returns false when already gone.';

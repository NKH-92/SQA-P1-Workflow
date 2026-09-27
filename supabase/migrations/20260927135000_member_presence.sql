-- Personal presence for the home pixel office. Each leader or member shows
-- where they are: a quick status for short absences during the day (meeting,
-- field, lab, other) that stays until they clear it, and dated vacation or
-- business-trip periods. The office replaces a seated character with a pixel
-- sign for that status, so the whole part sees who is away.
--
-- People change their own presence; the active leader may also change it for
-- leaders and members (e.g. registering a sick day). Team leaders are
-- read-only (verify/95 write guard) and have no presence of their own.
--
-- Presence is visible to the whole part like the seat layout: active app users
-- may SELECT both tables through RLS so Realtime postgres_changes can push
-- updates to every open office. Every write goes through the RPCs below.
--
-- Deliberately not part of the private mutation audit: presence is transient
-- coordination, not business data. Leaves that ended are deleted on the next
-- write and never returned.

create table public.member_statuses (
  profile_id uuid primary key
    references public.profiles(id) on delete cascade,
  status text not null,
  set_by uuid
    references public.profiles(id) on delete set null,
  updated_at timestamptz not null default clock_timestamp(),
  constraint member_statuses_status_check check (status in ('meeting', 'field', 'lab', 'away'))
);

create index member_statuses_set_by_idx
  on public.member_statuses(set_by);

create table public.member_leaves (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null
    references public.profiles(id) on delete cascade,
  kind text not null,
  starts_on date not null,
  ends_on date not null,
  note text not null default '',
  created_by uuid
    references public.profiles(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  constraint member_leaves_kind_check check (kind in ('vacation', 'trip')),
  constraint member_leaves_range_check check (ends_on >= starts_on and ends_on - starts_on <= 89),
  constraint member_leaves_note_check check (char_length(note) <= 30)
);

create index member_leaves_profile_id_idx
  on public.member_leaves(profile_id, ends_on);
create index member_leaves_created_by_idx
  on public.member_leaves(created_by);

alter table public.member_statuses enable row level security;
alter table public.member_leaves enable row level security;

revoke all on table public.member_statuses from public, anon, authenticated;
revoke all on table public.member_leaves from public, anon, authenticated;
grant select on table public.member_statuses to authenticated;
grant select on table public.member_leaves to authenticated;
grant all on table public.member_statuses to service_role;
grant all on table public.member_leaves to service_role;

create policy member_statuses_select_app_users
on public.member_statuses
for select
to authenticated
using (public.can_use_app());

create policy member_leaves_select_app_users
on public.member_leaves
for select
to authenticated
using (public.can_use_app());

create trigger reject_team_leader_write
before insert or update or delete on public.member_statuses
for each row execute function private.reject_team_leader_business_write();

create trigger reject_team_leader_write
before insert or update or delete on public.member_leaves
for each row execute function private.reject_team_leader_business_write();

-- Who may change p_profile_id's presence: the person themselves (leader or
-- member) or the active leader, and only for active leaders and members.
create or replace function private.assert_member_presence_writer(p_profile_id uuid)
returns void
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

  if not exists (
    select 1
      from public.profiles profile
     where profile.id = auth.uid()
       and profile.role in ('leader', 'member')
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'team leader access is read only',
      detail = 'SQA_TEAM_LEADER_READ_ONLY';
  end if;

  if p_profile_id is null then
    raise exception using
      errcode = '22023',
      message = 'a person is required',
      detail = 'SQA_MEMBER_PRESENCE_INVALID';
  end if;

  if p_profile_id <> auth.uid() and not public.can_manage_team_data() then
    raise exception using
      errcode = '42501',
      message = 'only the person or the leader can change presence',
      detail = 'SQA_MEMBER_PRESENCE_FORBIDDEN';
  end if;

  if not exists (
    select 1
      from public.profiles profile
     where profile.id = p_profile_id
       and profile.is_active
       and profile.role in ('leader', 'member')
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'presence is only for active leaders and members',
      detail = 'SQA_MEMBER_PRESENCE_TARGET_INVALID';
  end if;
end;
$$;

revoke all on function private.assert_member_presence_writer(uuid) from public, anon, authenticated;

create or replace function public.get_member_presence()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := private.sqa_business_date();
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
        on profile.id = status.profile_id
       and profile.is_active
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
          'note', leave.note
        ) order by leave.starts_on, profile.name, leave.id
      )
      from public.member_leaves leave
      join public.profiles profile
        on profile.id = leave.profile_id
       and profile.is_active
     where leave.ends_on >= v_today
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_member_presence() from public, anon, authenticated;
grant execute on function public.get_member_presence() to authenticated;

-- Sets (or with a null/empty status clears) a quick status. Returns the stored
-- status, or null after clearing.
create or replace function public.set_member_status(p_profile_id uuid, p_status text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text := nullif(pg_catalog.btrim(coalesce(p_status, '')), '');
begin
  perform private.assert_member_presence_writer(p_profile_id);

  if v_status is null then
    delete from public.member_statuses status where status.profile_id = p_profile_id;
    return null;
  end if;

  if v_status not in ('meeting', 'field', 'lab', 'away') then
    raise exception using
      errcode = '22023',
      message = 'unknown status',
      detail = 'SQA_MEMBER_PRESENCE_INVALID';
  end if;

  insert into public.member_statuses (profile_id, status, set_by, updated_at)
  values (p_profile_id, v_status, auth.uid(), pg_catalog.clock_timestamp())
  on conflict (profile_id) do update
    set status = excluded.status,
        set_by = excluded.set_by,
        updated_at = excluded.updated_at;
  return v_status;
end;
$$;

revoke all on function public.set_member_status(uuid, text) from public, anon, authenticated;
grant execute on function public.set_member_status(uuid, text) to authenticated;

-- Registers a vacation or business trip (whole Asia/Seoul days, up to 90 days,
-- not entirely in the past, starting within a year). Periods of one person
-- never overlap.
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
declare
  v_today date := private.sqa_business_date();
  v_note text := pg_catalog.btrim(coalesce(p_note, ''));
  v_leave_id uuid;
begin
  perform private.assert_member_presence_writer(p_profile_id);

  if p_kind is null
     or p_kind not in ('vacation', 'trip')
     or p_starts_on is null
     or p_ends_on is null
     or p_ends_on < p_starts_on
     or p_ends_on - p_starts_on > 89
     or p_ends_on < v_today
     or p_starts_on > v_today + 365
     or pg_catalog.char_length(v_note) > 30 then
    raise exception using
      errcode = '22023',
      message = 'a leave needs a kind and a period of up to 90 days from today on',
      detail = 'SQA_MEMBER_PRESENCE_INVALID';
  end if;

  -- One writer per person decides overlaps.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('sqa:member-leave:' || p_profile_id::text));
  delete from public.member_leaves leave where leave.ends_on < v_today;

  if exists (
    select 1
      from public.member_leaves leave
     where leave.profile_id = p_profile_id
       and leave.starts_on <= p_ends_on
       and leave.ends_on >= p_starts_on
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'the period overlaps another vacation or trip',
      detail = 'SQA_MEMBER_LEAVE_OVERLAP';
  end if;

  insert into public.member_leaves (profile_id, kind, starts_on, ends_on, note, created_by)
  values (p_profile_id, p_kind, p_starts_on, p_ends_on, v_note, auth.uid())
  returning id into v_leave_id;
  return v_leave_id;
end;
$$;

revoke all on function public.add_member_leave(uuid, text, date, date, text) from public, anon, authenticated;
grant execute on function public.add_member_leave(uuid, text, date, date, text) to authenticated;

-- Cancels a vacation or trip. Returns false when it was already gone.
create or replace function public.delete_member_leave(p_leave_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
begin
  if auth.uid() is null or not public.can_use_app() then
    raise exception using
      errcode = '42501',
      message = 'active app user required',
      detail = 'SQA_APP_ACCESS_REQUIRED';
  end if;

  select leave.profile_id into v_profile_id
    from public.member_leaves leave
   where leave.id = p_leave_id;
  if v_profile_id is null then
    return false;
  end if;

  if v_profile_id <> auth.uid() and not public.can_manage_team_data() then
    if not exists (
      select 1 from public.profiles profile
       where profile.id = auth.uid()
         and profile.role in ('leader', 'member')
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'team leader access is read only',
        detail = 'SQA_TEAM_LEADER_READ_ONLY';
    end if;
    raise exception using
      errcode = '42501',
      message = 'only the person or the leader can change presence',
      detail = 'SQA_MEMBER_PRESENCE_FORBIDDEN';
  end if;

  delete from public.member_leaves leave where leave.id = p_leave_id;
  delete from public.member_leaves leave where leave.ends_on < private.sqa_business_date();
  return true;
end;
$$;

revoke all on function public.delete_member_leave(uuid) from public, anon, authenticated;
grant execute on function public.delete_member_leave(uuid) to authenticated;

-- Push presence changes to every open office. Skips when already published and
-- on plain Postgres environments without the supabase_realtime publication.
do $$
declare
  target text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach target in array array['member_statuses', 'member_leaves'] loop
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

comment on table public.member_statuses is
  'Quick presence of a leader or member (meeting, field, lab, away) until cleared. Shown on their office seat.';
comment on table public.member_leaves is
  'Vacation or business-trip periods (Asia/Seoul days, up to 90 days, no overlaps per person). Ended periods are deleted.';
comment on function public.get_member_presence() is
  'Quick statuses and current or upcoming leaves of active people, for every app user.';
comment on function public.set_member_status(uuid, text) is
  'Sets or clears a quick status for yourself, or for a leader or member when you are the active leader.';
comment on function public.add_member_leave(uuid, text, date, date, text) is
  'Registers a vacation or trip for yourself, or for a leader or member when you are the active leader.';
comment on function public.delete_member_leave(uuid) is
  'Cancels a vacation or trip; only the person or the active leader. Returns false when already gone.';

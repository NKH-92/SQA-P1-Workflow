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

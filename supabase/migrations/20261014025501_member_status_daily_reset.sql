-- Quick statuses expire at the next 06:00 Asia/Seoul boundary. Dated vacation
-- and trip rows are never changed, including current and future leave periods.
create or replace function private.member_status_reset_cutoff(p_now timestamptz default clock_timestamp())
returns timestamptz
language sql
immutable
strict
set search_path = ''
as $$
  select (pg_catalog.date_trunc('day', p_now at time zone 'Asia/Seoul' - interval '6 hours')
          + interval '6 hours') at time zone 'Asia/Seoul';
$$;

revoke all on function private.member_status_reset_cutoff(timestamptz) from public, anon, authenticated;
grant execute on function private.member_status_reset_cutoff(timestamptz) to postgres;

create or replace function private.reset_member_statuses_daily(p_now timestamptz default clock_timestamp())
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  -- Preserve statuses set at/after 06:00 even if the scheduled job starts late.
  -- Clear hidden quick statuses too, so they cannot reappear after leave ends.
  delete from public.member_statuses status
   where status.updated_at < private.member_status_reset_cutoff(p_now);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function private.reset_member_statuses_daily(timestamptz) from public, anon, authenticated;
grant execute on function private.reset_member_statuses_daily(timestamptz) to postgres;

-- A delayed or missed Cron run must not make yesterday's status visible.
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
          'note', leave.note
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

-- The existing Supabase Cron contract is UTC: 21:00 UTC = 06:00 KST.
select cron.schedule(
  'sqa-member-status-reset-daily',
  '0 21 * * *',
  'select private.reset_member_statuses_daily();'
);

comment on table public.member_statuses is
  'Quick presence (meeting, field, lab, away), reset daily at 06:00 Asia/Seoul. Vacation and trips keep their dated periods.';
comment on function private.reset_member_statuses_daily(timestamptz) is
  'Cron-only quick status reset at the latest 06:00 Asia/Seoul boundary; leaves and newer statuses are preserved.';

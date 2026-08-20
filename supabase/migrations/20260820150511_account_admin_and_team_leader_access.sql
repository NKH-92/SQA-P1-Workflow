-- Account administration, forced-password transitions, and the read-only
-- team-leader role. The fixed temporary password is held only by the server
-- function; it is deliberately never stored in application tables or audit logs.

create table if not exists private.account_password_change_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  correlation_id uuid not null unique,
  mode text not null check (mode in ('issue_temp', 'complete_temp')),
  actor_id uuid references auth.users(id) on delete set null,
  previous_must_change_password boolean not null,
  reason text,
  created_at timestamptz not null default clock_timestamp()
);

revoke all on table private.account_password_change_state from public, anon, authenticated;
grant select, insert, update, delete on table private.account_password_change_state to service_role;

create or replace function public.current_session_is_valid()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    exists (
      select 1
        from auth.sessions session
       where session.user_id = auth.uid()
         and session.id::text = auth.jwt() ->> 'session_id'
    ),
    false
  );
$$;

revoke all on function public.current_session_is_valid() from public, anon, authenticated;
grant execute on function public.current_session_is_valid() to authenticated;

create or replace function public.can_use_app()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_self()
     and public.password_is_current()
     and public.current_session_is_valid();
$$;

revoke all on function public.can_use_app() from public, anon, authenticated;
grant execute on function public.can_use_app() to authenticated;

-- Legacy name retained because it is the common read gate across the existing
-- workspace RPCs and RLS policies. It now means "leader-workspace viewer".
create or replace function public.is_active_leader()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_self()
     and public.password_is_current()
     and coalesce(
    exists (
      select 1
        from public.profiles profile
       where profile.id = auth.uid()
         and profile.role in ('leader', 'team_leader')
    ),
    false
  ) and public.current_session_is_valid();
$$;

revoke all on function public.is_active_leader() from public, anon, authenticated;
grant execute on function public.is_active_leader() to authenticated;
comment on function public.is_active_leader() is
  'Compatibility read gate for active leader and team_leader workspace viewers. Use can_manage_team_data for mutations.';

create or replace function public.can_manage_team_data()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    exists (
      select 1
        from public.profiles profile
       where profile.id = auth.uid()
         and profile.role = 'leader'
         and profile.is_active
         and not profile.must_change_password
    ),
    false
  ) and public.current_session_is_valid();
$$;

revoke all on function public.can_manage_team_data() from public, anon, authenticated;
grant execute on function public.can_manage_team_data() to authenticated;

-- Final write barrier. Existing SECURITY DEFINER mutation RPCs retain auth.uid(),
-- so this also blocks direct RPC attempts by team leaders, not only REST writes.
create or replace function private.reject_team_leader_business_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and exists (
    select 1 from public.profiles profile
     where profile.id = auth.uid() and profile.role = 'team_leader'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'team leader access is read only',
      detail = 'SQA_TEAM_LEADER_READ_ONLY';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.reject_team_leader_business_write() from public, anon, authenticated;

do $$
declare
  target record;
begin
  for target in
    select cls.relname
      from pg_class cls
      join pg_namespace ns on ns.oid = cls.relnamespace
     where ns.nspname = 'public'
       and cls.relkind in ('r', 'p')
       and cls.relname <> 'review_read_receipts'
  loop
    execute format('drop trigger if exists reject_team_leader_write on public.%I', target.relname);
    execute format(
      'create trigger reject_team_leader_write before insert or update or delete on public.%I for each row execute function private.reject_team_leader_business_write()',
      target.relname
    );
  end loop;
end;
$$;

create or replace function public.prepare_password_reset(
  p_target_user_id uuid,
  p_reason text,
  p_correlation_id uuid
)
returns table (user_id uuid, email text, name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.profiles%rowtype;
  normalized_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.can_manage_team_data() then
    raise exception using errcode = 'P0001', message = 'active leader required', detail = 'SQA_ACTIVE_LEADER_REQUIRED';
  end if;
  if p_correlation_id is null then
    raise exception using errcode = '22023', message = 'correlation id is required', detail = 'SQA_CORRELATION_REQUIRED';
  end if;
  if normalized_reason is null or char_length(normalized_reason) > 500 then
    raise exception using errcode = '22023', message = 'reset reason is required and must be 500 characters or fewer', detail = 'SQA_REASON_REQUIRED';
  end if;

  select * into target from public.profiles where id = p_target_user_id for update;
  if not found or target.is_active is false then
    raise exception using errcode = 'P0001', message = 'active account not found', detail = 'SQA_ACTIVE_ACCOUNT_NOT_FOUND';
  end if;

  insert into private.account_password_change_state (
    user_id, correlation_id, mode, actor_id, previous_must_change_password, reason
  ) values (
    target.id, p_correlation_id, 'issue_temp', auth.uid(), target.must_change_password, normalized_reason
  )
  on conflict on constraint account_password_change_state_pkey do update set
    correlation_id = excluded.correlation_id,
    mode = excluded.mode,
    actor_id = excluded.actor_id,
    previous_must_change_password = excluded.previous_must_change_password,
    reason = excluded.reason,
    created_at = clock_timestamp();

  update public.profiles
     set must_change_password = true
   where id = target.id;

  return query select target.id, target.email::text, target.name;
end;
$$;

create or replace function public.cancel_password_reset(p_target_user_id uuid, p_correlation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  state private.account_password_change_state%rowtype;
begin
  if not public.can_manage_team_data() then
    raise exception using errcode = 'P0001', message = 'active leader required', detail = 'SQA_ACTIVE_LEADER_REQUIRED';
  end if;
  delete from private.account_password_change_state
   where user_id = p_target_user_id and correlation_id = p_correlation_id and mode = 'issue_temp'
   returning * into state;
  if found then
    update public.profiles set must_change_password = state.previous_must_change_password where id = state.user_id;
  end if;
end;
$$;

create or replace function public.prepare_own_password_change(p_correlation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.profiles%rowtype;
begin
  if auth.uid() is null or not public.current_session_is_valid() then
    raise exception using errcode = 'P0001', message = 'authenticated session required', detail = 'SQA_SESSION_REQUIRED';
  end if;
  select * into target from public.profiles where id = auth.uid() for update;
  if not found or target.is_active is false or target.must_change_password is not true then
    raise exception using errcode = 'P0001', message = 'forced password change is not required', detail = 'SQA_PASSWORD_CHANGE_NOT_REQUIRED';
  end if;
  insert into private.account_password_change_state (
    user_id, correlation_id, mode, actor_id, previous_must_change_password
  ) values (target.id, p_correlation_id, 'complete_temp', target.id, true)
  on conflict on constraint account_password_change_state_pkey do update set
    correlation_id = excluded.correlation_id,
    mode = excluded.mode,
    actor_id = excluded.actor_id,
    previous_must_change_password = true,
    reason = null,
    created_at = clock_timestamp();
end;
$$;

create or replace function public.cancel_own_password_change(p_correlation_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from private.account_password_change_state
   where user_id = auth.uid()
     and correlation_id = p_correlation_id
     and mode = 'complete_temp';
$$;

create or replace function private.mark_password_current_from_auth_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  state private.account_password_change_state%rowtype;
begin
  delete from private.account_password_change_state
   where user_id = new.id
   returning * into state;

  if found and state.mode = 'complete_temp' then
    update public.profiles
       set must_change_password = false,
           updated_at = clock_timestamp()
     where id = new.id;
  elsif found and state.mode = 'issue_temp' then
    update public.profiles
       set must_change_password = true,
           updated_at = clock_timestamp()
     where id = new.id;
    insert into public.activity_logs (
      actor_id, target_user_id, entity_type, entity_id, action, summary, metadata
    ) values (
      state.actor_id,
      new.id,
      'allowed_user',
      new.id,
      'password_reset',
      '사용자 계정의 비밀번호를 초기화했습니다.',
      jsonb_build_object(
        'reason', state.reason,
        'correlation_id', state.correlation_id
      )
    );
  end if;
  return new;
end;
$$;

revoke all on function private.mark_password_current_from_auth_change() from public, anon, authenticated;

-- Correct the explicit last-leader check for either non-leader destination.
create or replace function private.guard_last_leader_role_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'leader' and old.is_active and new.role <> 'leader' then
    perform pg_advisory_xact_lock(hashtext('sqa:last-active-leader'));
    if not exists (
      select 1 from public.profiles profile
       where profile.role = 'leader' and profile.is_active and profile.id <> old.id
    ) then
      raise exception using errcode = 'P0001', message = 'cannot demote the last active leader', detail = 'SQA_LAST_LEADER_PROTECTED';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_last_leader_role_transition on public.profiles;
create trigger guard_last_leader_role_transition
before update of role on public.profiles
for each row execute function private.guard_last_leader_role_transition();

revoke all on function public.prepare_password_reset(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.cancel_password_reset(uuid, uuid) from public, anon, authenticated;
revoke all on function public.prepare_own_password_change(uuid) from public, anon, authenticated;
revoke all on function public.cancel_own_password_change(uuid) from public, anon, authenticated;
grant execute on function public.prepare_password_reset(uuid, text, uuid) to authenticated;
grant execute on function public.cancel_password_reset(uuid, uuid) to authenticated;
grant execute on function public.prepare_own_password_change(uuid) to authenticated;
grant execute on function public.cancel_own_password_change(uuid) to authenticated;

comment on table private.account_password_change_state is
  'Short-lived authorization state for admin reset and first-login password completion; never stores passwords.';

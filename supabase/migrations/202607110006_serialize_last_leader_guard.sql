-- Serialize concurrent demotion/deactivation checks so two leaders cannot both
-- observe the other as active and commit a zero-leader state.

-- The original helper was STABLE SQL.  A STABLE function can keep the
-- statement snapshot that existed before the advisory lock was acquired, so a
-- waiter could still count the leader that the first transaction had already
-- demoted.  A VOLATILE PL/pgSQL query obtains a fresh SPI snapshot after the
-- lock and makes the serialization effective.
create or replace function public.count_active_leaders_except(p_profile_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  active_count integer;
begin
  select count(*)::integer
    into active_count
    from public.profiles
   where role = 'leader'
     and is_active = true
     and id <> p_profile_id;
  return active_count;
end;
$$;

create or replace function public.guard_last_active_leader_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.id = auth.uid()
     and old.is_active = true
     and new.is_active = false
  then
    raise exception 'cannot deactivate your own account';
  end if;

  if old.role = 'leader'
     and old.is_active = true
     and (new.role <> 'leader' or new.is_active = false)
  then
    perform pg_advisory_xact_lock(hashtextextended('sqa-p1-active-leader-guard', 0));
    if public.count_active_leaders_except(old.id) = 0 then
      raise exception 'cannot disable or demote the last active leader';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.guard_last_active_leader_allowed_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  linked_profile_id uuid;
begin
  if old.role = 'leader' and new.role <> 'leader' then
    perform pg_advisory_xact_lock(hashtextextended('sqa-p1-active-leader-guard', 0));

    select profile.id
      into linked_profile_id
      from public.profiles profile
     where lower(profile.email::text) = lower(new.email::text)
       and profile.role = 'leader'
       and profile.is_active = true
     limit 1;

    if linked_profile_id is not null
       and public.count_active_leaders_except(linked_profile_id) = 0
    then
      raise exception 'cannot disable or demote the last active leader';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.count_active_leaders_except(uuid) from public;
revoke all on function public.count_active_leaders_except(uuid) from anon;
revoke all on function public.count_active_leaders_except(uuid) from authenticated;
revoke all on function public.guard_last_active_leader_profile() from public;
revoke all on function public.guard_last_active_leader_allowed_user() from public;

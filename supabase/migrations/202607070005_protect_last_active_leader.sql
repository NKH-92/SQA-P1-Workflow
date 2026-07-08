-- Prevent demotion or deactivation of the last active leader.

create or replace function public.count_active_leaders_except(p_profile_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.profiles
  where role = 'leader'
    and is_active = true
    and id <> p_profile_id;
$$;

create or replace function public.guard_last_active_leader_profile()
returns trigger
language plpgsql
security definer
set search_path = public
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
     and (
       new.role <> 'leader'
       or new.is_active = false
     )
     and public.count_active_leaders_except(old.id) = 0
  then
    raise exception 'cannot disable or demote the last active leader';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_last_active_leader on public.profiles;
create trigger profiles_guard_last_active_leader
before update on public.profiles
for each row execute function public.guard_last_active_leader_profile();

create or replace function public.guard_last_active_leader_allowed_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  linked_profile_id uuid;
begin
  if old.role = 'leader'
     and new.role <> 'leader'
  then
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

drop trigger if exists allowed_users_guard_last_active_leader on public.allowed_users;
create trigger allowed_users_guard_last_active_leader
before update of role on public.allowed_users
for each row execute function public.guard_last_active_leader_allowed_user();

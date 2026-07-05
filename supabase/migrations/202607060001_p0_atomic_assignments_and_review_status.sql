-- P0: atomic project assignment replace, unified review status RPC, active-user assignment guard.

create or replace function public.profile_is_active(profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_active from public.profiles where id = profile_id),
    false
  );
$$;

revoke all on function public.profile_is_active(uuid) from public;
grant execute on function public.profile_is_active(uuid) to authenticated;

create or replace function public.validate_project_assignment_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_profile_role(new.user_id, 'member', 'project_assignments.user_id');
  if not public.profile_is_active(new.user_id) then
    raise exception 'project_assignments.user_id must reference an active profile';
  end if;
  return new;
end;
$$;

create or replace function public.validate_assignment_user_active()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.profile_is_active(new.user_id) then
    raise exception '% must reference an active profile', tg_table_name || '.user_id';
  end if;
  return new;
end;
$$;

drop trigger if exists product_assignments_validate_active on public.product_assignments;
create trigger product_assignments_validate_active
before insert or update of user_id on public.product_assignments
for each row execute function public.validate_assignment_user_active();

drop trigger if exists duty_assignments_validate_active on public.duty_assignments;
create trigger duty_assignments_validate_active
before insert or update of user_id on public.duty_assignments
for each row execute function public.validate_assignment_user_active();

create or replace function public.replace_project_assignments(
  p_project_id uuid,
  p_member_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
begin
  if not public.is_active_leader() then
    raise exception 'permission denied';
  end if;

  if not exists (select 1 from public.projects where id = p_project_id) then
    raise exception 'project not found';
  end if;

  delete from public.project_assignments
   where project_id = p_project_id
     and user_id <> all(coalesce(p_member_ids, array[]::uuid[]));

  if p_member_ids is not null then
    foreach v_member_id in array p_member_ids loop
      insert into public.project_assignments (project_id, user_id, notes)
      values (p_project_id, v_member_id, null)
      on conflict (project_id, user_id) do nothing;
    end loop;
  end if;
end;
$$;

create or replace function public.create_project_with_assignments(
  p_name text,
  p_description text,
  p_deadline date,
  p_status public.project_status,
  p_member_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
  v_member_id uuid;
begin
  if not public.is_active_leader() then
    raise exception 'permission denied';
  end if;

  insert into public.projects (name, description, deadline, status, created_by)
  values (p_name, coalesce(p_description, ''), p_deadline, p_status, auth.uid())
  returning id into v_project_id;

  if p_member_ids is not null then
    foreach v_member_id in array p_member_ids loop
      insert into public.project_assignments (project_id, user_id, notes)
      values (v_project_id, v_member_id, null);
    end loop;
  end if;

  return v_project_id;
end;
$$;

create or replace function public.update_review_request_status(
  p_review_request_id uuid,
  p_status public.review_status
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_active_leader() then
    raise exception 'permission denied';
  end if;

  if p_status = 'rejected' then
    raise exception 'use reject_review_request for rejected status';
  end if;

  update public.review_requests
     set status = p_status
   where id = p_review_request_id;

  if not found then
    raise exception 'review request not found';
  end if;
end;
$$;

revoke all on function public.replace_project_assignments(uuid, uuid[]) from public;
grant execute on function public.replace_project_assignments(uuid, uuid[]) to authenticated;

revoke all on function public.update_review_request_status(uuid, public.review_status) from public;
grant execute on function public.update_review_request_status(uuid, public.review_status) to authenticated;

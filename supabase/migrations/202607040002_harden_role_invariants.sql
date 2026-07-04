create or replace function public.profile_has_role(profile_id uuid, expected_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.profiles profile
     where profile.id = profile_id
       and profile.role = expected_role
  );
$$;

revoke all on function public.profile_has_role(uuid, public.app_role) from public;
grant execute on function public.profile_has_role(uuid, public.app_role) to authenticated;

create or replace function public.require_profile_role(profile_id uuid, expected_role public.app_role, field_name text)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.profile_has_role(profile_id, expected_role) then
    raise exception '% must reference a % profile', field_name, expected_role;
  end if;
end;
$$;

revoke all on function public.require_profile_role(uuid, public.app_role, text) from public;

create or replace function public.validate_project_assignment_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_profile_role(new.user_id, 'member', 'project_assignments.user_id');
  return new;
end;
$$;

revoke all on function public.validate_project_assignment_member() from public;

drop trigger if exists project_assignments_validate_member on public.project_assignments;
create trigger project_assignments_validate_member
before insert or update of user_id on public.project_assignments
for each row execute function public.validate_project_assignment_member();

create or replace function public.validate_project_creator_leader()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.created_by is distinct from old.created_by then
    raise exception 'projects.created_by cannot be changed';
  end if;

  perform public.require_profile_role(new.created_by, 'leader', 'projects.created_by');
  return new;
end;
$$;

revoke all on function public.validate_project_creator_leader() from public;

drop trigger if exists projects_validate_creator_leader on public.projects;
create trigger projects_validate_creator_leader
before insert or update of created_by on public.projects
for each row execute function public.validate_project_creator_leader();

alter table public.projects
  alter column created_by set default auth.uid();

create or replace function public.validate_profile_note_roles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_profile_role(new.profile_id, 'member', 'profile_notes.profile_id');
  perform public.require_profile_role(new.leader_id, 'leader', 'profile_notes.leader_id');
  return new;
end;
$$;

revoke all on function public.validate_profile_note_roles() from public;

drop trigger if exists profile_notes_validate_roles on public.profile_notes;
create trigger profile_notes_validate_roles
before insert or update of profile_id, leader_id on public.profile_notes
for each row execute function public.validate_profile_note_roles();

create or replace function public.validate_review_feedback_leader()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_profile_role(new.leader_id, 'leader', 'review_feedback.leader_id');
  return new;
end;
$$;

revoke all on function public.validate_review_feedback_leader() from public;

drop trigger if exists review_feedback_validate_leader on public.review_feedback;
create trigger review_feedback_validate_leader
before insert or update of leader_id on public.review_feedback
for each row execute function public.validate_review_feedback_leader();

create or replace function public.validate_allowed_user_creator()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is not null then
    perform public.require_profile_role(new.created_by, 'leader', 'allowed_users.created_by');
  end if;
  return new;
end;
$$;

revoke all on function public.validate_allowed_user_creator() from public;

drop trigger if exists allowed_users_validate_creator on public.allowed_users;
create trigger allowed_users_validate_creator
before insert or update of created_by on public.allowed_users
for each row execute function public.validate_allowed_user_creator();

drop policy if exists "allowed_users_leader_all" on public.allowed_users;
create policy "allowed_users_leader_all"
on public.allowed_users for all
to authenticated
using (public.is_leader())
with check (
  public.is_leader()
  and (created_by is null or public.profile_has_role(created_by, 'leader'))
);

drop policy if exists "profile_notes_write_leader" on public.profile_notes;
create policy "profile_notes_write_leader"
on public.profile_notes for all
to authenticated
using (public.is_leader())
with check (
  public.is_leader()
  and leader_id = auth.uid()
  and public.profile_has_role(profile_id, 'member')
  and public.profile_has_role(leader_id, 'leader')
);

drop policy if exists "review_feedback_insert_leader" on public.review_feedback;
create policy "review_feedback_insert_leader"
on public.review_feedback for insert
to authenticated
with check (
  public.is_leader()
  and leader_id = auth.uid()
  and public.profile_has_role(leader_id, 'leader')
);

drop policy if exists "review_feedback_update_leader" on public.review_feedback;
create policy "review_feedback_update_leader"
on public.review_feedback for update
to authenticated
using (public.is_leader())
with check (
  public.is_leader()
  and public.profile_has_role(leader_id, 'leader')
);

drop policy if exists "projects_write_leader" on public.projects;
drop policy if exists "projects_insert_leader_creator" on public.projects;
drop policy if exists "projects_update_leader" on public.projects;
drop policy if exists "projects_delete_leader" on public.projects;
create policy "projects_insert_leader_creator"
on public.projects for insert
to authenticated
with check (
  public.is_leader()
  and created_by = auth.uid()
  and public.profile_has_role(created_by, 'leader')
);

create policy "projects_update_leader"
on public.projects for update
to authenticated
using (public.is_leader())
with check (
  public.is_leader()
  and public.profile_has_role(created_by, 'leader')
);

create policy "projects_delete_leader"
on public.projects for delete
to authenticated
using (public.is_leader());

drop policy if exists "project_assignments_write_leader" on public.project_assignments;
drop policy if exists "project_assignments_insert_leader_member" on public.project_assignments;
drop policy if exists "project_assignments_update_leader_member" on public.project_assignments;
drop policy if exists "project_assignments_delete_leader" on public.project_assignments;
create policy "project_assignments_insert_leader_member"
on public.project_assignments for insert
to authenticated
with check (
  public.is_leader()
  and public.profile_has_role(user_id, 'member')
);

create policy "project_assignments_update_leader_member"
on public.project_assignments for update
to authenticated
using (public.is_leader())
with check (
  public.is_leader()
  and public.profile_has_role(user_id, 'member')
);

create policy "project_assignments_delete_leader"
on public.project_assignments for delete
to authenticated
using (public.is_leader());

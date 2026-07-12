-- Add an optimistic-concurrency path for the project assignment editor.
-- Keep the historical two-argument RPC intact for rollback compatibility; the
-- current frontend uses this three-argument function and supplies the project
-- snapshot timestamp it displayed to the operator.

create or replace function public.replace_project_assignments_if_current(
  p_project_id uuid,
  p_member_ids uuid[],
  p_expected_updated_at timestamptz
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_updated_at timestamptz;
  v_member_id uuid;
begin
  if not public.is_active_leader() then
    raise exception 'permission denied';
  end if;

  if p_expected_updated_at is null then
    raise exception 'project version is required';
  end if;

  select updated_at
    into v_current_updated_at
    from public.projects
   where id = p_project_id
   for update;

  if v_current_updated_at is null then
    raise exception 'project not found';
  end if;

  if v_current_updated_at <> p_expected_updated_at then
    raise exception 'project changed since it was opened';
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

  -- Bump the parent revision so a second editor with the same snapshot fails
  -- after the first transaction commits.
  update public.projects
     set updated_at = clock_timestamp()
   where id = p_project_id
   returning updated_at into v_current_updated_at;
  return v_current_updated_at;
end;
$$;

revoke all on function public.replace_project_assignments_if_current(uuid, uuid[], timestamptz) from public;
revoke all on function public.replace_project_assignments_if_current(uuid, uuid[], timestamptz) from anon;
grant execute on function public.replace_project_assignments_if_current(uuid, uuid[], timestamptz) to authenticated;

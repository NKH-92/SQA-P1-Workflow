-- Leader workflow improvements:
-- 1. Store an optional reason only while a product has no assignee.
-- 2. Allow the current active leader to assign a project to themselves.
--
-- Product assignment state remains derived from product_assignments. This avoids
-- introducing a second status value that could drift from the assignment rows.

alter table public.products
  add column if not exists unassigned_reason text;

alter table public.products
  drop constraint if exists products_unassigned_reason_length_check;

alter table public.products
  add constraint products_unassigned_reason_length_check
  check (unassigned_reason is null or char_length(unassigned_reason) <= 1000);

create or replace function public.validate_product_unassigned_reason()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.unassigned_reason := nullif(btrim(new.unassigned_reason), '');

  if new.unassigned_reason is not null
     and exists (
       select 1
         from public.product_assignments
        where product_id = new.id
     ) then
    raise exception 'unassigned reason is only allowed for a product without assignees';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_product_unassigned_reason() from public;
revoke execute on function public.validate_product_unassigned_reason() from anon, authenticated;

drop trigger if exists products_validate_unassigned_reason on public.products;
create trigger products_validate_unassigned_reason
before insert or update of unassigned_reason on public.products
for each row execute function public.validate_product_unassigned_reason();

create or replace function public.clear_product_unassigned_reason()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.products
     set unassigned_reason = null
   where id = new.product_id
     and unassigned_reason is not null;
  return new;
end;
$$;

revoke all on function public.clear_product_unassigned_reason() from public;
revoke execute on function public.clear_product_unassigned_reason() from anon, authenticated;

drop trigger if exists product_assignments_clear_unassigned_reason on public.product_assignments;
create trigger product_assignments_clear_unassigned_reason
after insert or update of product_id on public.product_assignments
for each row execute function public.clear_product_unassigned_reason();

create or replace function public.replace_product_assignments_with_reason(
  p_product_id uuid,
  p_member_ids uuid[],
  p_unassigned_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member_id uuid;
  v_member_ids uuid[] := coalesce(p_member_ids, array[]::uuid[]);
  v_reason text := nullif(btrim(p_unassigned_reason), '');
begin
  if not public.is_active_leader() then
    raise exception 'permission denied';
  end if;

  if v_reason is not null and char_length(v_reason) > 1000 then
    raise exception 'unassigned reason must be 1000 characters or fewer';
  end if;

  -- Lock the product while replacing assignments and reason as one state change.
  perform 1
    from public.products
   where id = p_product_id
   for update;
  if not found then
    raise exception 'product not found';
  end if;

  delete from public.product_assignments
   where product_id = p_product_id
     and user_id <> all(v_member_ids);

  foreach v_member_id in array v_member_ids loop
    if v_member_id is null then
      raise exception 'product assignment user is required';
    end if;

    insert into public.product_assignments (product_id, user_id)
    values (p_product_id, v_member_id)
    on conflict (user_id, product_id) do nothing;
  end loop;

  update public.products
     set unassigned_reason = case
       when cardinality(v_member_ids) = 0 then v_reason
       else null
     end
   where id = p_product_id;
end;
$$;

revoke all on function public.replace_product_assignments_with_reason(uuid, uuid[], text) from public;
revoke all on function public.replace_product_assignments_with_reason(uuid, uuid[], text) from anon;
grant execute on function public.replace_product_assignments_with_reason(uuid, uuid[], text) to authenticated;

-- Product and duty assignment targets remain member-only. Project assignments
-- additionally allow the current authenticated active leader to select themself.
create or replace function public.validate_project_assignment_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.profile_is_active(new.user_id) then
    raise exception 'project_assignments.user_id must reference an active profile';
  end if;

  if public.profile_has_role(new.user_id, 'member') then
    return new;
  end if;

  if new.user_id = auth.uid()
     and public.profile_has_role(new.user_id, 'leader')
     and public.is_active_leader() then
    return new;
  end if;

  raise exception 'project_assignments.user_id must reference an active member or the current active leader';
end;
$$;

revoke all on function public.validate_project_assignment_member() from public;
revoke execute on function public.validate_project_assignment_member() from anon, authenticated;

drop policy if exists "project_assignments_insert_leader_member" on public.project_assignments;
create policy "project_assignments_insert_leader_member"
on public.project_assignments for insert
to authenticated
with check (
  public.is_active_leader()
  and (
    public.profile_has_role(user_id, 'member')
    or (
      user_id = auth.uid()
      and public.profile_has_role(user_id, 'leader')
    )
  )
);

drop policy if exists "project_assignments_update_leader_member" on public.project_assignments;
create policy "project_assignments_update_leader_member"
on public.project_assignments for update
to authenticated
using (public.is_active_leader())
with check (
  public.is_active_leader()
  and (
    public.profile_has_role(user_id, 'member')
    or (
      user_id = auth.uid()
      and public.profile_has_role(user_id, 'leader')
    )
  )
);

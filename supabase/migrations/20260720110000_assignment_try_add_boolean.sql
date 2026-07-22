-- Boolean-returning add-only assignment RPCs let callers distinguish
-- an actual insert from a pre-existing duplicate no-op. The legacy
-- add_product_assignment/add_duty_assignment RPCs return void and gave the
-- client no way to know whether ON CONFLICT DO NOTHING silently skipped the
-- insert, so the remote adapter always recorded a "배정했습니다" activity log
-- even when nothing changed. Those RPCs are left untouched for DB-first/
-- frontend-first rollout compatibility (D-06); only new, additive functions
-- are introduced here.
--
-- FOUND is set by PL/pgSQL after an INSERT/UPDATE/DELETE to whether the
-- statement affected at least one row. With ON CONFLICT DO NOTHING, a
-- duplicate insert affects zero rows, so `return found` is exactly
-- "was a new row created" — true on insert, false on no-op.

create or replace function public.try_add_product_assignment(
  p_product_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_active_leader() then
    raise exception 'permission denied';
  end if;

  if not exists (select 1 from public.products where id = p_product_id) then
    raise exception 'product not found';
  end if;

  perform public.require_profile_role(p_user_id, 'member', 'product_assignments.user_id');
  if not public.profile_is_active(p_user_id) then
    raise exception 'product_assignments.user_id must reference an active profile';
  end if;

  insert into public.product_assignments (product_id, user_id)
  values (p_product_id, p_user_id)
  on conflict (user_id, product_id) do nothing;

  return found;
end;
$$;

create or replace function public.try_add_duty_assignment(
  p_duty_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_active_leader() then
    raise exception 'permission denied';
  end if;

  if not exists (select 1 from public.duties where id = p_duty_id) then
    raise exception 'duty not found';
  end if;

  perform public.require_profile_role(p_user_id, 'member', 'duty_assignments.user_id');
  if not public.profile_is_active(p_user_id) then
    raise exception 'duty_assignments.user_id must reference an active profile';
  end if;

  insert into public.duty_assignments (duty_id, user_id)
  values (p_duty_id, p_user_id)
  on conflict (user_id, duty_id) do nothing;

  return found;
end;
$$;

revoke all on function public.try_add_product_assignment(uuid, uuid) from public;
revoke all on function public.try_add_product_assignment(uuid, uuid) from anon;
grant execute on function public.try_add_product_assignment(uuid, uuid) to authenticated;

revoke all on function public.try_add_duty_assignment(uuid, uuid) from public;
revoke all on function public.try_add_duty_assignment(uuid, uuid) from anon;
grant execute on function public.try_add_duty_assignment(uuid, uuid) to authenticated;

comment on function public.try_add_product_assignment(uuid, uuid) is
  'Add-only product assignment; returns true when a row was inserted, false on a pre-existing duplicate no-op.';
comment on function public.try_add_duty_assignment(uuid, uuid) is
  'Add-only duty assignment; returns true when a row was inserted, false on a pre-existing duplicate no-op.';

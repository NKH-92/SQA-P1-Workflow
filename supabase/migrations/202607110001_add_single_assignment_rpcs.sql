-- Add-only assignment RPCs for single-member assignment flows.
-- Full replacement RPCs remain available for explicit assignment editing.

create or replace function public.add_product_assignment(
  p_product_id uuid,
  p_user_id uuid
)
returns void
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
end;
$$;

create or replace function public.add_duty_assignment(
  p_duty_id uuid,
  p_user_id uuid
)
returns void
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
end;
$$;

revoke all on function public.add_product_assignment(uuid, uuid) from public;
grant execute on function public.add_product_assignment(uuid, uuid) to authenticated;

revoke all on function public.add_duty_assignment(uuid, uuid) from public;
grant execute on function public.add_duty_assignment(uuid, uuid) to authenticated;

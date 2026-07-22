-- Assignment parent revision corrective migration.
-- A successful add-only assignment changes the parent aggregate and must
-- advance its OCC revision. Duplicate no-ops keep the existing revision.

create or replace function public.try_add_product_assignment(
  p_product_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted boolean;
begin
  if auth.uid() is null or not public.is_active_leader() then
    raise exception using errcode = 'P0001', message = 'permission denied', detail = 'SQA_PERMISSION_DENIED';
  end if;

  perform 1 from public.products where id = p_product_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'product not found', detail = 'SQA_MASTER_NOT_FOUND';
  end if;

  perform public.require_profile_role(p_user_id, 'member', 'product_assignments.user_id');
  if not public.profile_is_active(p_user_id) then
    raise exception 'product_assignments.user_id must reference an active profile';
  end if;

  insert into public.product_assignments (product_id, user_id)
  values (p_product_id, p_user_id)
  on conflict (user_id, product_id) do nothing;
  v_inserted := found;

  if v_inserted then
    update public.products set updated_at = clock_timestamp() where id = p_product_id;
  end if;
  return v_inserted;
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
declare
  v_inserted boolean;
begin
  if auth.uid() is null or not public.is_active_leader() then
    raise exception using errcode = 'P0001', message = 'permission denied', detail = 'SQA_PERMISSION_DENIED';
  end if;

  perform 1 from public.duties where id = p_duty_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'duty not found', detail = 'SQA_MASTER_NOT_FOUND';
  end if;

  perform public.require_profile_role(p_user_id, 'member', 'duty_assignments.user_id');
  if not public.profile_is_active(p_user_id) then
    raise exception 'duty_assignments.user_id must reference an active profile';
  end if;

  insert into public.duty_assignments (duty_id, user_id)
  values (p_duty_id, p_user_id)
  on conflict (user_id, duty_id) do nothing;
  v_inserted := found;

  if v_inserted then
    update public.duties set updated_at = clock_timestamp() where id = p_duty_id;
  end if;
  return v_inserted;
end;
$$;

revoke all on function public.try_add_product_assignment(uuid, uuid) from public, anon, authenticated;
grant execute on function public.try_add_product_assignment(uuid, uuid) to authenticated;
revoke all on function public.try_add_duty_assignment(uuid, uuid) from public, anon, authenticated;
grant execute on function public.try_add_duty_assignment(uuid, uuid) to authenticated;

comment on function public.try_add_product_assignment(uuid, uuid) is
  'Add-only product assignment; true insert advances the product OCC revision, duplicate no-op does neither.';
comment on function public.try_add_duty_assignment(uuid, uuid) is
  'Add-only duty assignment; true insert advances the duty OCC revision, duplicate no-op does neither.';

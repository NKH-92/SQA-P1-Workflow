-- Profile-role OCC + assignment-replacement audit reason / no-op contract.

create or replace function public.set_profile_role_if_current(
  p_profile_id uuid,
  p_expected_updated_at timestamptz,
  p_role public.app_role,
  p_reason text,
  p_correlation_id uuid default null
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_updated_at timestamptz;
  v_other_leaders integer;
begin
  if not public.is_active_leader() then
    raise exception using errcode = 'P0001', message = 'permission denied', detail = 'SQA_PERMISSION_DENIED';
  end if;
  if p_expected_updated_at is null then
    raise exception using errcode = 'P0001', message = 'master record version is required', detail = 'SQA_MASTER_VERSION_REQUIRED';
  end if;
  if v_reason is null then
    raise exception using errcode = 'P0001', message = 'change reason is required', detail = 'SQA_REASON_REQUIRED';
  end if;
  if char_length(v_reason) > 500 then
    raise exception using errcode = 'P0001', message = 'change reason must be 500 characters or fewer', detail = 'SQA_REASON_TOO_LONG';
  end if;
  if p_role is null then
    raise exception using errcode = 'P0001', message = 'role is required', detail = 'SQA_PROFILE_ROLE_REQUIRED';
  end if;

  select * into v_profile from public.profiles where id = p_profile_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'master record not found', detail = 'SQA_MASTER_NOT_FOUND';
  end if;
  if v_profile.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = 'P0001', message = 'master record changed since it was opened', detail = 'SQA_MASTER_STALE';
  end if;

  if v_profile.role is not distinct from p_role then
    return v_profile.updated_at;
  end if;

  -- Last active leader cannot be demoted to member.
  if v_profile.role = 'leader' and v_profile.is_active is distinct from false and p_role = 'member' then
    select count(*) into v_other_leaders
      from public.profiles
     where role = 'leader'
       and is_active is distinct from false
       and id <> p_profile_id;
    if v_other_leaders < 1 then
      raise exception using errcode = 'P0001', message = 'cannot demote the last active leader', detail = 'SQA_LAST_LEADER_PROTECTED';
    end if;
  end if;

  perform set_config('sqa.audit_reason', v_reason, true);
  perform set_config('sqa.audit_source', 'set_profile_role_if_current', true);
  if p_correlation_id is not null then
    perform set_config('sqa.audit_correlation_id', p_correlation_id::text, true);
  end if;

  update public.profiles
     set role = p_role
   where id = p_profile_id
   returning updated_at into v_updated_at;

  return v_updated_at;
end;
$$;

revoke all on function public.set_profile_role_if_current(uuid, timestamptz, public.app_role, text, uuid) from public, anon, authenticated;
grant execute on function public.set_profile_role_if_current(uuid, timestamptz, public.app_role, text, uuid) to authenticated;

-- Recreate assignment replacement RPCs with audit reason + true no-op.
drop function if exists public.replace_product_assignments_if_current(uuid, uuid[], text, timestamptz);
drop function if exists public.replace_duty_assignments_if_current(uuid, uuid[], timestamptz);

create or replace function public.replace_product_assignments_if_current(
  p_product_id uuid,
  p_member_ids uuid[],
  p_unassigned_reason text,
  p_expected_updated_at timestamptz,
  p_reason text,
  p_correlation_id uuid default null
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member_id uuid;
  v_member_ids uuid[] := coalesce(p_member_ids, array[]::uuid[]);
  v_unassigned text := nullif(btrim(coalesce(p_unassigned_reason, '')), '');
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_current_updated_at timestamptz;
  v_existing uuid[];
  v_current_unassigned text;
  v_changed boolean := false;
begin
  if not public.is_active_leader() then
    raise exception using errcode = 'P0001', message = 'permission denied', detail = 'SQA_PERMISSION_DENIED';
  end if;
  if p_expected_updated_at is null then
    raise exception using errcode = 'P0001', message = 'master record version is required', detail = 'SQA_MASTER_VERSION_REQUIRED';
  end if;
  if v_reason is null then
    raise exception using errcode = 'P0001', message = 'change reason is required', detail = 'SQA_REASON_REQUIRED';
  end if;
  if char_length(v_reason) > 500 then
    raise exception using errcode = 'P0001', message = 'change reason must be 500 characters or fewer', detail = 'SQA_REASON_TOO_LONG';
  end if;
  if v_unassigned is not null and char_length(v_unassigned) > 1000 then
    raise exception using errcode = 'P0001', message = 'unassigned reason must be 1000 characters or fewer', detail = 'SQA_UNASSIGNED_REASON_TOO_LONG';
  end if;

  select updated_at, unassigned_reason
    into v_current_updated_at, v_current_unassigned
    from public.products
   where id = p_product_id
   for update;
  if v_current_updated_at is null then
    raise exception using errcode = 'P0001', message = 'master record not found', detail = 'SQA_MASTER_NOT_FOUND';
  end if;
  if v_current_updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = 'P0001', message = 'master record changed since it was opened', detail = 'SQA_MASTER_STALE';
  end if;

  select coalesce(array_agg(user_id order by user_id), array[]::uuid[])
    into v_existing
    from public.product_assignments
   where product_id = p_product_id;

  if (
    select coalesce(array_agg(x order by x), array[]::uuid[])
      from unnest(v_member_ids) as t(x)
  ) is not distinct from v_existing
     and (
       case when cardinality(v_member_ids) = 0 then v_unassigned else null end
     ) is not distinct from v_current_unassigned
  then
    return v_current_updated_at;
  end if;

  perform set_config('sqa.audit_reason', v_reason, true);
  perform set_config('sqa.audit_source', 'replace_product_assignments_if_current', true);
  if p_correlation_id is not null then
    perform set_config('sqa.audit_correlation_id', p_correlation_id::text, true);
  end if;

  delete from public.product_assignments
   where product_id = p_product_id
     and user_id <> all(v_member_ids);
  if found then v_changed := true; end if;

  foreach v_member_id in array v_member_ids loop
    if v_member_id is null then
      raise exception using errcode = 'P0001', message = 'product assignment user is required', detail = 'SQA_ASSIGNMENT_USER_REQUIRED';
    end if;
    insert into public.product_assignments (product_id, user_id)
    values (p_product_id, v_member_id)
    on conflict (user_id, product_id) do nothing;
    if found then v_changed := true; end if;
  end loop;

  update public.products
     set unassigned_reason = case when cardinality(v_member_ids) = 0 then v_unassigned else null end,
         updated_at = clock_timestamp()
   where id = p_product_id
   returning updated_at into v_current_updated_at;

  return v_current_updated_at;
end;
$$;

create or replace function public.replace_duty_assignments_if_current(
  p_duty_id uuid,
  p_member_ids uuid[],
  p_expected_updated_at timestamptz,
  p_reason text,
  p_correlation_id uuid default null
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member_id uuid;
  v_member_ids uuid[] := coalesce(p_member_ids, array[]::uuid[]);
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_current_updated_at timestamptz;
  v_existing uuid[];
begin
  if not public.is_active_leader() then
    raise exception using errcode = 'P0001', message = 'permission denied', detail = 'SQA_PERMISSION_DENIED';
  end if;
  if p_expected_updated_at is null then
    raise exception using errcode = 'P0001', message = 'master record version is required', detail = 'SQA_MASTER_VERSION_REQUIRED';
  end if;
  if v_reason is null then
    raise exception using errcode = 'P0001', message = 'change reason is required', detail = 'SQA_REASON_REQUIRED';
  end if;
  if char_length(v_reason) > 500 then
    raise exception using errcode = 'P0001', message = 'change reason must be 500 characters or fewer', detail = 'SQA_REASON_TOO_LONG';
  end if;

  select updated_at into v_current_updated_at from public.duties where id = p_duty_id for update;
  if v_current_updated_at is null then
    raise exception using errcode = 'P0001', message = 'master record not found', detail = 'SQA_MASTER_NOT_FOUND';
  end if;
  if v_current_updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = 'P0001', message = 'master record changed since it was opened', detail = 'SQA_MASTER_STALE';
  end if;

  select coalesce(array_agg(user_id order by user_id), array[]::uuid[])
    into v_existing
    from public.duty_assignments
   where duty_id = p_duty_id;

  if (
    select coalesce(array_agg(x order by x), array[]::uuid[])
      from unnest(v_member_ids) as t(x)
  ) is not distinct from v_existing then
    return v_current_updated_at;
  end if;

  perform set_config('sqa.audit_reason', v_reason, true);
  perform set_config('sqa.audit_source', 'replace_duty_assignments_if_current', true);
  if p_correlation_id is not null then
    perform set_config('sqa.audit_correlation_id', p_correlation_id::text, true);
  end if;

  delete from public.duty_assignments
   where duty_id = p_duty_id
     and user_id <> all(v_member_ids);

  foreach v_member_id in array v_member_ids loop
    if v_member_id is null then
      raise exception using errcode = 'P0001', message = 'duty assignment user is required', detail = 'SQA_ASSIGNMENT_USER_REQUIRED';
    end if;
    insert into public.duty_assignments (duty_id, user_id)
    values (p_duty_id, v_member_id)
    on conflict (user_id, duty_id) do nothing;
  end loop;

  update public.duties
     set updated_at = clock_timestamp()
   where id = p_duty_id
   returning updated_at into v_current_updated_at;

  return v_current_updated_at;
end;
$$;

revoke all on function public.replace_product_assignments_if_current(uuid, uuid[], text, timestamptz, text, uuid) from public, anon, authenticated;
grant execute on function public.replace_product_assignments_if_current(uuid, uuid[], text, timestamptz, text, uuid) to authenticated;

revoke all on function public.replace_duty_assignments_if_current(uuid, uuid[], timestamptz, text, uuid) from public, anon, authenticated;
grant execute on function public.replace_duty_assignments_if_current(uuid, uuid[], timestamptz, text, uuid) to authenticated;

comment on function public.set_profile_role_if_current(uuid, timestamptz, public.app_role, text, uuid) is
  'OCC profile role update with authoritative audit reason.';
comment on function public.replace_product_assignments_if_current(uuid, uuid[], text, timestamptz, text, uuid) is
  'OCC product assignment replacement with audit reason and true no-op.';
comment on function public.replace_duty_assignments_if_current(uuid, uuid[], timestamptz, text, uuid) is
  'OCC duty assignment replacement with audit reason and true no-op.';

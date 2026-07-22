-- Canonicalize assignment replacement member sets before the
-- true no-op check so duplicate/reordered IDs do not bump revision or audit.

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
  v_member_ids uuid[];
  v_unassigned text := nullif(btrim(coalesce(p_unassigned_reason, '')), '');
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_current_updated_at timestamptz;
  v_existing uuid[];
  v_current_unassigned text;
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

  if exists (select 1 from unnest(coalesce(p_member_ids, array[]::uuid[])) as t(x) where x is null) then
    raise exception using errcode = 'P0001', message = 'product assignment user is required', detail = 'SQA_ASSIGNMENT_USER_REQUIRED';
  end if;

  select coalesce(array_agg(distinct x order by x), array[]::uuid[])
    into v_member_ids
    from unnest(coalesce(p_member_ids, array[]::uuid[])) as t(x);

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

  if v_member_ids is not distinct from v_existing
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

  foreach v_member_id in array v_member_ids loop
    insert into public.product_assignments (product_id, user_id)
    values (p_product_id, v_member_id)
    on conflict (user_id, product_id) do nothing;
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
  v_member_ids uuid[];
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

  if exists (select 1 from unnest(coalesce(p_member_ids, array[]::uuid[])) as t(x) where x is null) then
    raise exception using errcode = 'P0001', message = 'duty assignment user is required', detail = 'SQA_ASSIGNMENT_USER_REQUIRED';
  end if;

  select coalesce(array_agg(distinct x order by x), array[]::uuid[])
    into v_member_ids
    from unnest(coalesce(p_member_ids, array[]::uuid[])) as t(x);

  select updated_at
    into v_current_updated_at
    from public.duties
   where id = p_duty_id
   for update;
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

  if v_member_ids is not distinct from v_existing then
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

comment on function public.replace_product_assignments_if_current(uuid, uuid[], text, timestamptz, text, uuid) is
  'OCC-guarded product assignment replacement with set-canonical true no-op and authoritative audit reason.';
comment on function public.replace_duty_assignments_if_current(uuid, uuid[], timestamptz, text, uuid) is
  'OCC-guarded duty assignment replacement with set-canonical true no-op and authoritative audit reason.';

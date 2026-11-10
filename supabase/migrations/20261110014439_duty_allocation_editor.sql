-- Keep the write implementation in the non-exposed schema. The SQL bodies of
-- the two public wrappers resolve the private function at definition time.
create function private.write_duty_allocation(
  p_duty_id uuid, p_expected_updated_at timestamptz, p_name text,
  p_major_category_id uuid, p_notes text, p_assignee_label text,
  p_member_ids uuid[], p_reason text, p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_duty public.duties%rowtype;
  v_id uuid := p_duty_id;
  v_name text := btrim(coalesce(p_name, ''));
  v_notes text := nullif(btrim(p_notes, E' \t\r\n'), '');
  v_label text := nullif(btrim(p_assignee_label), '');
  v_reason text := nullif(btrim(p_reason, E' \t\r\n'), '');
  v_members uuid[];
  v_existing uuid[] := array[]::uuid[];
begin
  if auth.uid() is null or not public.is_active_leader() then
    raise exception using errcode = '42501', message = 'active leader required';
  end if;
  if char_length(v_name) not between 1 and 200 or p_major_category_id is null then
    raise exception using errcode = '23514', message = 'duty name and category are required';
  end if;
  if array_position(p_member_ids, null::uuid) is not null then
    raise exception using errcode = '23514', message = 'duty assignment user is required';
  end if;

  if p_duty_id is not null then
    if v_reason is null then
      raise exception using errcode = 'P0001', message = 'change reason is required';
    end if;
    if char_length(v_reason) > 500 then
      raise exception using errcode = 'P0001', message = 'change reason must be 500 characters or fewer';
    end if;
    -- The legacy assignment and metadata RPCs take the same parent lock.
    select * into v_duty from public.duties where id = p_duty_id for update;
    if not found or p_expected_updated_at is null or v_duty.updated_at is distinct from p_expected_updated_at then
      raise exception using errcode = 'P0001', message = 'record changed since it was opened', detail = 'SQA_MASTER_STALE';
    end if;
    select coalesce(array_agg(user_id order by user_id), array[]::uuid[])
      into v_existing from public.duty_assignments where duty_id = p_duty_id;
  end if;

  -- Null means the editor did not touch the assignment. An empty array is
  -- an explicit replacement, including a switch from people to a label.
  if p_member_ids is null then
    v_members := v_existing;
    v_label := v_duty.assignee_label;
  else
    select coalesce(array_agg(distinct id order by id), array[]::uuid[])
      into v_members from unnest(p_member_ids) as member(id);
  end if;
  if v_label is not null and cardinality(v_members) > 0 and p_member_ids is not null then
    raise exception using errcode = '23514', message = 'choose a label or members';
  end if;
  if p_duty_id is not null and (v_name, p_major_category_id, v_notes, v_label, v_members)
    is not distinct from (v_duty.name, v_duty.major_category_id, v_duty.notes, v_duty.assignee_label, v_existing) then
    return jsonb_build_object('id', v_id, 'noop', true);
  end if;

  perform set_config('sqa.audit_reason', coalesce(v_reason, ''), true);
  perform set_config('sqa.audit_correlation_id', coalesce(p_correlation_id::text, ''), true);
  perform set_config('sqa.audit_source', case when p_duty_id is null
    then 'create_duty_with_assignments' else 'save_duty_with_assignments_if_current' end, true);

  if p_duty_id is null then
    insert into public.duties (name, major_category_id, notes, assignee_label)
      values (v_name, p_major_category_id, v_notes, v_label) returning id into v_id;
  else
    update public.duties set name = v_name, major_category_id = p_major_category_id,
      notes = v_notes, assignee_label = v_label, updated_at = clock_timestamp()
      where id = v_id;
  end if;

  if v_members is distinct from v_existing then
    delete from public.duty_assignments where duty_id = v_id and user_id <> all(v_members);
    -- Only new assignments pass through the role and active-account triggers.
    insert into public.duty_assignments (duty_id, user_id)
      select v_id, id from unnest(v_members) as member(id) where id <> all(v_existing);
  end if;
  return jsonb_build_object('id', v_id, 'noop', false);
end;
$$;

create function public.create_duty_with_assignments(
  p_name text, p_major_category_id uuid, p_notes text, p_assignee_label text,
  p_member_ids uuid[], p_correlation_id uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
begin atomic
  select private.write_duty_allocation(null, null, p_name, p_major_category_id,
    p_notes, p_assignee_label, coalesce(p_member_ids, array[]::uuid[]), null, p_correlation_id);
end;

create function public.save_duty_with_assignments_if_current(
  p_duty_id uuid, p_expected_updated_at timestamptz, p_name text,
  p_major_category_id uuid, p_notes text, p_assignee_label text,
  p_member_ids uuid[], p_reason text, p_correlation_id uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
begin atomic
  select private.write_duty_allocation(p_duty_id, p_expected_updated_at, p_name,
    p_major_category_id, p_notes, p_assignee_label, p_member_ids, p_reason, p_correlation_id)
    where p_duty_id is not null;
end;

revoke all on function private.write_duty_allocation(uuid,timestamptz,text,uuid,text,text,uuid[],text,uuid) from public, anon, authenticated;
grant execute on function private.write_duty_allocation(uuid,timestamptz,text,uuid,text,text,uuid[],text,uuid) to authenticated;
revoke all on function public.create_duty_with_assignments(text,uuid,text,text,uuid[],uuid) from public, anon, authenticated;
grant execute on function public.create_duty_with_assignments(text,uuid,text,text,uuid[],uuid) to authenticated;
revoke all on function public.save_duty_with_assignments_if_current(uuid,timestamptz,text,uuid,text,text,uuid[],text,uuid) from public, anon, authenticated;
grant execute on function public.save_duty_with_assignments_if_current(uuid,timestamptz,text,uuid,text,text,uuid[],text,uuid) to authenticated;
